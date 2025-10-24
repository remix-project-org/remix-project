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
  const [chains, setChains] = useState<Chain[]>([]) // State to hold the chains data
  const [compilationOutput, setCompilationOutput] = useState<{ [key: string]: CompilerAbstract } | undefined>()

  // Form values:
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
      
      // Fetch compiler artefacts initially
      plugin.call('compilerArtefacts' as any, 'getAllCompilerAbstracts').then((obj: any) => {
        setCompilationOutput(obj)
      })

      // Subscribe to compilations
      plugin.on('compilerArtefacts' as any, 'compilationSaved', (compilerAbstracts: { [key: string]: CompilerAbstract }) => {
        setCompilationOutput((prev) => ({ ...(prev || {}), ...compilerAbstracts }))
      })
    }

    // Check if plugin is already activated
    if (plugin.isActivated()) {
      initializePlugin()
    } else {
      // Listen for activation event if not yet activated
      plugin.internalEvents.once('verification_activated', () => {
        initializePlugin()
      })
    }

    // Fetch chains.json and update state
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

    // Clean up on unmount
    return () => {
      plugin.off('compilerArtefacts' as any, 'compilationSaved')
      plugin.internalEvents.removeListener('submissionUpdated', submissionUpdatedListener)
    }
  }, [])

  // Poll status of pending receipts frequently
  useEffect(() => {
    const getPendingReceipts = (submissions: SubmittedContracts) => {
      const pendingReceipts: VerificationReceipt[] = []
      // Check statuses of receipts
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
          await new Promise((resolve) => setTimeout(resolve, 500)) // avoid api rate limit exceeding.

          const { verifierInfo, receiptId } = receipt
          if (receiptId) {
            const contract = changedSubmittedContracts[receipt.contractId]
            const chainSettings = mergeChainSettingsWithDefaults(contract.chainId, settings)
            const verifierSettings = chainSettings.verifiers[verifierInfo.name]

            // In case the user overwrites the API later, prefer the one stored in localStorage
            const verifier = getVerifier(verifierInfo.name, { ...verifierSettings, apiUrl: verifierInfo.apiUrl })
            if (!verifier.checkVerificationStatus) {
              continue
            }

            try {
              let response: VerificationResponse
              if (receipt.isProxyReceipt) {
                response = await verifier.checkProxyVerificationStatus(receiptId, contract.chainId)
              } else {
                response = await verifier.checkVerificationStatus(receiptId, contract.chainId)
              }
              const { status, message, lookupUrl } = response
              receipt.status = status
              receipt.message = message
              if (lookupUrl) {
                receipt.lookupUrl = lookupUrl
              }
            } catch (e) {
              receipt.failedChecks++
              // Only retry 5 times
              if (receipt.failedChecks >= 5) {
                receipt.status = 'failed'
                receipt.message = e.message
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