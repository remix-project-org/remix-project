import { PluginClient } from '@remixproject/plugin'
import { createClient } from '@remixproject/plugin-webview'

import EventManager from 'events'
import { VERIFIERS, type ChainSettings,Chain, type ContractVerificationSettings, type LookupResponse, type VerifierIdentifier, SubmittedContract, SubmittedContracts, VerificationReceipt } from './types'
import { mergeChainSettingsWithDefaults, validConfiguration } from './utils'
import { getVerifier } from './Verifiers'
import { CompilerAbstract } from '@remix-project/remix-solidity'

export class ContractVerificationPluginClient extends PluginClient {
  public internalEvents: EventManager

  constructor() {
    super()
    this.methods = ['lookupAndSave', 'verifyOnDeploy']
    this.internalEvents = new EventManager()
    createClient(this)
    this.onload()
  }

  onActivation(): void {
    this.internalEvents.emit('verification_activated')
  }

  async lookupAndSave(verifierId: string, chainId: string, contractAddress: string): Promise<LookupResponse> {
    const canonicalVerifierId = VERIFIERS.find((id) => id.toLowerCase() === verifierId.toLowerCase())
    if (!canonicalVerifierId) {
      console.error(`lookupAndSave failed: Unknown verifier: ${verifierId}`)
      return
    }

    const userSettings = this.getUserSettingsFromLocalStorage()
    const chainSettings = mergeChainSettingsWithDefaults(chainId, userSettings)

    try {
      const lookupResult = await this.lookup(canonicalVerifierId, chainSettings, chainId, contractAddress)
      await this.saveToRemix(lookupResult)
      return lookupResult
    } catch (err) {
      console.error(`lookupAndSave failed: ${err}`)
    }
  }

  async lookup(verifierId: VerifierIdentifier, chainSettings: ChainSettings, chainId: string, contractAddress: string): Promise<LookupResponse> {
    if (!validConfiguration(chainSettings, verifierId)) {
      throw new Error(`Error during lookup: Invalid configuration given for verifier ${verifierId}`)
    }
    const verifier = getVerifier(verifierId, chainSettings.verifiers[verifierId])
    return await verifier.lookup(contractAddress, chainId)
  }

  async saveToRemix(lookupResponse: LookupResponse): Promise<void> {
    for (const source of lookupResponse.sourceFiles ?? []) {
      try {
        await this.call('fileManager', 'setFile', source.path, source.content)
      } catch (err) {
        throw new Error(`Error while creating file ${source.path}: ${err.message}`)
      }
    }
    try {
      await this.call('fileManager', 'open', lookupResponse.targetFilePath)
    } catch (err) {
      throw new Error(`Error focusing file ${lookupResponse.targetFilePath}: ${err.message}`)
    }
  }

  verifyOnDeploy = async (data: any): Promise<void> => {
    try {
      await this.call('terminal', 'log', { type: 'log', value: 'Verification process started...' })

      const { chainId, currentChain, contractAddress, contractName, compilationResult, constructorArgs, etherscanApiKey } = data

      if (!currentChain) {
        await this.call('terminal', 'log', { type: 'error', value: 'Chain data was not provided for verification.' })
        return
      }

      const userSettings = this.getUserSettingsFromLocalStorage()

      if (etherscanApiKey) {
        if (!userSettings.chains[chainId]) {
          userSettings.chains[chainId] = { verifiers: {} }
        }

        if (!userSettings.chains[chainId].verifiers.Etherscan) {
          userSettings.chains[chainId].verifiers.Etherscan = {}
        }
        userSettings.chains[chainId].verifiers.Etherscan.apiKey = etherscanApiKey

        if (!userSettings.chains[chainId].verifiers.Routescan) {
          userSettings.chains[chainId].verifiers.Routescan = {}
        }
        if (!userSettings.chains[chainId].verifiers.Routescan.apiKey){
          userSettings.chains[chainId].verifiers.Routescan.apiKey = "placeholder"
        }

        window.localStorage.setItem("contract-verification:settings", JSON.stringify(userSettings))

      }

      const submittedContracts: SubmittedContracts = JSON.parse(window.localStorage.getItem('contract-verification:submitted-contracts') || '{}')

      const filePath = Object.keys(compilationResult.data.contracts).find(path =>
        compilationResult.data.contracts[path][contractName]
      )
      if (!filePath) throw new Error(`Could not find file path for contract ${contractName}`)

      const submittedContract: SubmittedContract = {
        id: `${chainId}-${contractAddress}`,
        address: contractAddress,
        chainId: chainId,
        filePath: filePath,
        contractName: contractName,
        abiEncodedConstructorArgs: constructorArgs,
        date: new Date().toISOString(),
        receipts: []
      }

      const compilerAbstract: CompilerAbstract = compilationResult
      const chainSettings = mergeChainSettingsWithDefaults(chainId, userSettings)

      const verificationPromises = []

      if (validConfiguration(chainSettings, 'Sourcify')) {
        verificationPromises.push(this._verifyWithProvider('Sourcify', submittedContract, compilerAbstract, chainId, chainSettings))
      }

      if (currentChain.explorers && currentChain.explorers.some(explorer => explorer.name.toLowerCase().includes('routescan'))) {
        verificationPromises.push(this._verifyWithProvider('Routescan', submittedContract, compilerAbstract, chainId, chainSettings))
      }

      if (currentChain.explorers && currentChain.explorers.some(explorer => explorer.url.includes('blockscout'))) {
        verificationPromises.push(this._verifyWithProvider('Blockscout', submittedContract, compilerAbstract, chainId, chainSettings))
      }

      if (currentChain.explorers && currentChain.explorers.some(explorer => explorer.name.includes('etherscan'))) {
        if (etherscanApiKey) {
          verificationPromises.push(this._verifyWithProvider('Etherscan', submittedContract, compilerAbstract, chainId, chainSettings))
        } else {
          await this.call('terminal', 'log', { type: 'warn', value: 'Etherscan verification skipped: API key not found in global Settings.' })
        }
      }

      await Promise.all(verificationPromises)

      submittedContracts[submittedContract.id] = submittedContract
      window.localStorage.setItem('contract-verification:submitted-contracts', JSON.stringify(submittedContracts))
      this.internalEvents.emit('submissionUpdated')

    } catch (error) {
      await this.call('terminal', 'log', { type: 'error', value: `An unexpected error occurred during verification: ${error.message}` })
    }
  }

  private _verifyWithProvider = async (
    providerName: VerifierIdentifier,
    submittedContract: SubmittedContract,
    compilerAbstract: CompilerAbstract,
    chainId: string,
    chainSettings: ChainSettings
  ): Promise<void> => {
    let receipt: VerificationReceipt
    const verifierSettings = chainSettings.verifiers[providerName]
    const verifier = getVerifier(providerName, verifierSettings)

    try {
      if (validConfiguration(chainSettings, providerName)) {

        await this.call('terminal', 'log', { type: 'log', value: `Verifying with ${providerName}...` })

        if (providerName === 'Etherscan' || providerName === 'Routescan' || providerName === 'Blockscout') {
          await new Promise(resolve => setTimeout(resolve, 9000))
        }

        if (verifier && typeof verifier.verify === 'function') {
          const result = await verifier.verify(submittedContract, compilerAbstract)

          receipt = {
            receiptId: result.receiptId || undefined,
            verifierInfo: { name: providerName, apiUrl: verifier.apiUrl },
            status: result.status,
            message: result.message,
            lookupUrl: result.lookupUrl,
            contractId: submittedContract.id,
            isProxyReceipt: false,
            failedChecks: 0
          }

          const successMessage = `${providerName} verification successful.`
          await this.call('terminal', 'log', { type: 'info', value: successMessage })

          if (result.lookupUrl) {
            const textMessage = `${result.lookupUrl}`
            await this.call('terminal', 'log', { type: 'info', value: textMessage })
          }
        } else {
          throw new Error(`${providerName} verifier is not properly configured or does not support direct verification.`)
        }
      }
    } catch (e) {
      if (e.message.includes('Unable to locate ContractCode')) {
        const checkUrl = `${verifier.explorerUrl}/address/${submittedContract.address}`;
        const friendlyMessage = `Initial verification failed, possibly due to a sync delay. Please check the status manually.`

        await this.call('terminal', 'log', { type: 'warn', value: `${providerName}: ${friendlyMessage}` })

        const textMessage = `Check Manually: ${checkUrl}`
        await this.call('terminal', 'log', { type: 'info', value: textMessage })

        receipt = {
          verifierInfo: { name: providerName, apiUrl: verifier?.apiUrl || 'N/A' },
          status: 'failed',
          message: 'Failed initially (sync delay), check manually.',
          contractId: submittedContract.id,
          isProxyReceipt: false,
          failedChecks: 0
        }

      } else {
        receipt = {
          verifierInfo: { name: providerName, apiUrl: verifier?.apiUrl || 'N/A' },
          status: 'failed',
          message: e.message,
          contractId: submittedContract.id,
          isProxyReceipt: false,
          failedChecks: 0
        }
        await this.call('terminal', 'log', { type: 'error', value: `${providerName} verification failed: ${e.message}` })
      }

    } finally {
      if (receipt) {
        submittedContract.receipts.push(receipt)
      }
    }
  }

  private getUserSettingsFromLocalStorage(): ContractVerificationSettings {
    const fallbackSettings = { chains: {} }
    try {
      const settings = window.localStorage.getItem("contract-verification:settings")
      return settings ? JSON.parse(settings) : fallbackSettings
    } catch (error) {
      console.error(error)
      return fallbackSettings
    }
  }
}
