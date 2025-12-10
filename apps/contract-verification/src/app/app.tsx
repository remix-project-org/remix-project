import { useState, useEffect, useRef } from 'react'

import { ContractVerificationPluginClient } from './ContractVerificationPluginClient'

import { AppContext } from './AppContext'
import { VerifyFormContext } from './VerifyFormContext'
import DisplayRoutes from './routes'
import type { ContractVerificationSettings, ThemeType, Chain, SubmittedContracts, VerificationReceipt, VerificationResponse } from './types'
import { mergeChainSettingsWithDefaults } from './utils'

import './App.css'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import { useLocalStorage } from './hooks/useLocalStorage'
import { getVerifier } from './Verifiers'
import { ContractDropdownSelection } from './components/ContractDropdown'
import { IntlProvider } from 'react-intl'

const plugin = new ContractVerificationPluginClient()

const App = () => {
  const [themeType, setThemeType] = useState<ThemeType>('dark')
  const [settings, setSettings] = useLocalStorage<ContractVerificationSettings>('contract-verification:settings', { chains: {} })
  const [submittedContracts, setSubmittedContracts] = useLocalStorage<SubmittedContracts>('contract-verification:submitted-contracts', {})
  const [chains, setChains] = useState<Chain[]>([]) 
  const [compilationOutput, setCompilationOutput] = useState<{ [key: string]: CompilerAbstract } | undefined>()

  const [selectedChain, setSelectedChain] = useState<Chain | undefined>()
  const [contractAddress, setContractAddress] = useState('')
  const [contractAddressError, setContractAddressError] = useState('')
  const [selectedContract, setSelectedContract] = useState<ContractDropdownSelection | undefined>()
  const [proxyAddress, setProxyAddress] = useState('')
  const [proxyAddressError, setProxyAddressError] = useState('')
  const [abiEncodedConstructorArgs, setAbiEncodedConstructorArgs] = useState<string>('')
  const [abiEncodingError, setAbiEncodingError] = useState<string>('')
  const [locale, setLocale] = useState<{ code: string; messages: any }>({
    code: 'en',
    messages: {},
  })

  const timer = useRef(null)

  useEffect(() => {
    const initializePlugin = () => {
      // @ts-ignore
      plugin.call('locale', 'currentLocale').then((locale: any) => {
        setLocale(locale)
      })
      // @ts-ignore
      plugin.on('locale', 'localeChanged', (locale: any) => {
        setLocale(locale)
      })
      plugin.call('compilerArtefacts' as any, 'getAllCompilerAbstracts').then((obj: any) => {
        setCompilationOutput(obj)
      })
      plugin.on('compilerArtefacts' as any, 'compilationSaved', (compilerAbstracts: { [key: string]: CompilerAbstract }) => {
        setCompilationOutput((prev) => ({ ...(prev || {}), ...compilerAbstracts }))
      })
    }

    if (plugin.isActivated()) {
      initializePlugin()
    } else {
      plugin.internalEvents.once('verification_activated', () => {
        initializePlugin()
      })
    }

    fetch('https://chainid.network/chains.json')
      .then((response) => response.json())
      .then((data) => setChains(data))
      .catch((error) => console.error('Failed to fetch chains.json:', error))

    const submissionUpdatedListener = () => {
      const latestSubmissions = window.localStorage.getItem('contract-verification:submitted-contracts')
      if (latestSubmissions) {
        setSubmittedContracts(JSON.parse(latestSubmissions))
      }
    }
    plugin.internalEvents.on('submissionUpdated', submissionUpdatedListener)

    return () => {
      plugin.off('compilerArtefacts' as any, 'compilationSaved')
      plugin.internalEvents.removeListener('submissionUpdated', submissionUpdatedListener)
    }
  }, [])

  // Poll status of pending receipts frequently
  useEffect(() => {
    const getPendingReceipts = (submissions: SubmittedContracts) => {
      const pendingReceipts: VerificationReceipt[] = []
      for (const submission of Object.values(submissions)) {
        for (const receipt of submission.receipts) {
          if (receipt.status === 'pending') {
            pendingReceipts.push(receipt)
          }
        }
        for (const proxyReceipt of submission.proxyReceipts ?? []) {
          if (proxyReceipt.status === 'pending') {
            pendingReceipts.push(proxyReceipt)
          }
        }
      }
      return pendingReceipts
    }

    let pendingReceipts = getPendingReceipts(submittedContracts)

    if (pendingReceipts.length > 0) {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }

      const pollStatus = async () => {
        const changedSubmittedContracts = { ...submittedContracts }

        for (const receipt of pendingReceipts) {
          await new Promise((resolve) => setTimeout(resolve, 500)) 

          const { verifierInfo, receiptId, contractId } = receipt
          const contract = changedSubmittedContracts[contractId]

          if (receipt.failedChecks >= 10) {
            receipt.failedChecks = 0
          }

          if (receiptId) {
            const chainSettings = mergeChainSettingsWithDefaults(contract.chainId, settings)
            let verifierSettings = { ...chainSettings.verifiers[verifierInfo.name] }

            if (verifierInfo.name === 'Etherscan' && !verifierSettings.apiKey) {
              try {
                const globalApiKey = await plugin.call('config' as any, 'getAppParameter', 'etherscan-access-token')
                if (globalApiKey) {
                  verifierSettings = { ...verifierSettings, apiKey: globalApiKey }
                }
              } catch (e) { }
            }

            if (verifierInfo.name === 'Etherscan' && !verifierSettings.apiKey) {
              receipt.status = 'failed'
              receipt.message = 'API key not configured'
              continue
            }

            let verifier
            try {
              verifier = getVerifier(verifierInfo.name, { ...verifierSettings, apiUrl: verifierInfo.apiUrl })
            } catch (e) {
              receipt.status = 'failed'
              receipt.message = e.message || 'Failed to initialize verifier'
              continue
            }

            if (!verifier.checkVerificationStatus) {
              receipt.status = 'failed'
              receipt.message = 'Status check not supported for this verifier'
              continue
            }

            try {
              let response: VerificationResponse
              if (receipt.isProxyReceipt) {
                response = await verifier.checkProxyVerificationStatus(receiptId, contract.chainId)
              } else {
                response = await verifier.checkVerificationStatus(receiptId, contract.chainId)
              }

              if (response.status === 'pending') {
                 receipt.failedChecks++
              }

              if (receipt.failedChecks >= 10) {
                 response.status = 'failed'
                 response.message = 'Verification timed out (30s limit).'
              }

              const { status, message, lookupUrl } = response
              const prevStatus = receipt.status
              
              receipt.status = status
              receipt.message = message
              if (lookupUrl) {
                receipt.lookupUrl = lookupUrl
              }

              if (prevStatus === 'pending' && status !== 'pending') {
                const successStatuses = ['verified', 'partially verified', 'already verified', 'exactly verified', 'fully verified']
                
                if (successStatuses.includes(status)) {
                  if (receipt.lookupUrl) {
                    const htmlContent = `<span class="text-success">[${verifierInfo.name}] Verification Successful!</span> &nbsp;<a href="${receipt.lookupUrl}" target="_blank">View Code</a>`
                    await plugin.call('terminal' as any, 'logHtml', { value: htmlContent })
                  } else {
                    const htmlContent = `<span class="text-success">[${verifierInfo.name}] Verification Successful!</span>`
                    await plugin.call('terminal' as any, 'logHtml', { value: htmlContent })
                  }
                } else if (status === 'failed') {
                    if (message === 'Verification timed out (30s limit).') {
                        plugin.call('terminal', 'log', { type: 'warn', value: `[${verifierInfo.name}] Polling timed out. Please open the "Contract Verification" plugin to check details.` })
                    } else {
                        plugin.call('terminal', 'log', { type: 'warn', value: `[${verifierInfo.name}] Verification Failed: ${message || 'Unknown reason'}` })
                        plugin.call('terminal', 'log', { type: 'warn', value: `Please open the "Contract Verification" plugin to retry.` })
                    }
                  
                    if (verifierInfo.name === 'Etherscan' && !chainSettings.verifiers['Etherscan']?.apiKey) {
                        plugin.call('terminal', 'log', { type: 'info', value: `Note: To retry Etherscan verification in the plugin, you must save your API key in the plugin settings.` })
                    }
                }
              }
            } catch (e) {
              receipt.failedChecks++
              
              let errorMsg = e.message || 'Unknown error'
              
              if (errorMsg.trim().startsWith('<') || errorMsg.includes('<!DOCTYPE html>')) {
                 errorMsg = 'Explorer API Error (500)';
              }
              if (errorMsg.includes('404')) {
                 errorMsg = 'Pending registration (404)';
              }

              if (receipt.failedChecks >= 10) {
                receipt.status = 'failed'
                receipt.message = errorMsg
                
                if (errorMsg.includes('404')) {
                     plugin.call('terminal', 'log', { type: 'warn', value: `[${verifierInfo.name}] Polling timed out (404). Please open the "Contract Verification" plugin to check details.` })
                } else {
                     plugin.call('terminal', 'log', { type: 'warn', value: `[${verifierInfo.name}] Verification Failed after ${receipt.failedChecks} attempts: ${errorMsg}` })
                     plugin.call('terminal', 'log', { type: 'warn', value: `Please open the "Contract Verification" plugin to retry.` })
                }
                
                if (verifierInfo.name === 'Etherscan' && !chainSettings.verifiers['Etherscan']?.apiKey) {
                    plugin.call('terminal', 'log', { type: 'info', value: `Note: To retry Etherscan verification in the plugin, you must save your API key in the plugin settings.` })
                }
              }
            }
          }
        }

        pendingReceipts = getPendingReceipts(changedSubmittedContracts)
        if (timer.current && pendingReceipts.length === 0) {
          clearInterval(timer.current)
          timer.current = null
        }
        setSubmittedContracts((prev) => Object.assign({}, prev, changedSubmittedContracts))
      }

      timer.current = setInterval(pollStatus, 3000)
    }
  }, [submittedContracts])

  return (
    <IntlProvider locale={locale.code} messages={locale.messages}>
      <AppContext.Provider value={{ themeType, setThemeType, clientInstance: plugin, settings, setSettings, chains, compilationOutput, submittedContracts, setSubmittedContracts }}>
        <VerifyFormContext.Provider value={{ selectedChain, setSelectedChain, contractAddress, setContractAddress, contractAddressError, setContractAddressError, selectedContract, setSelectedContract, proxyAddress, setProxyAddress, proxyAddressError, setProxyAddressError, abiEncodedConstructorArgs, setAbiEncodedConstructorArgs, abiEncodingError, setAbiEncodingError }}>
          <DisplayRoutes />
        </VerifyFormContext.Provider>
      </AppContext.Provider>
    </IntlProvider>
  )
}

export default App