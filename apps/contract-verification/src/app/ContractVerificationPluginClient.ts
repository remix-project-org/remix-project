import { PluginClient } from '@remixproject/plugin'
import { createClient } from '@remixproject/plugin-webview'
import EventManager from 'events'
import { VERIFIERS, type ChainSettings, Chain, type ContractVerificationSettings, type LookupResponse, type VerifierIdentifier, SubmittedContract, SubmittedContracts, VerificationReceipt } from './types'
import { mergeChainSettingsWithDefaults, validConfiguration } from './utils'
import { getVerifier } from './Verifiers'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import { AbiCoder } from 'ethers'

export class ContractVerificationPluginClient extends PluginClient {
  public internalEvents: EventManager
  private _isActivated: boolean = false

  constructor() {
    super()
    this.methods = ['lookupAndSave', 'verifyOnDeploy', 'isVerificationSupportedForChain']
    this.internalEvents = new EventManager()
    createClient(this)
    this.onload()
  }

  onActivation(): void {
    this._isActivated = true
    this.internalEvents.emit('verification_activated')
  }

  isActivated(): boolean {
    return this._isActivated
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
      } catch (err: any) {
        throw new Error(`Error while creating file ${source.path}: ${err.message}`)
      }
    }
    try {
      await this.call('fileManager', 'open', lookupResponse.targetFilePath)
    } catch (err: any) {
      throw new Error(`Error focusing file ${lookupResponse.targetFilePath}: ${err.message}`)
    }
  }

  verifyOnDeploy = async (payload: any): Promise<void> => {
    const { contractName, filePath, address, chainId, args } = payload

    if (!contractName || !filePath || !address || !chainId) {
      console.error('Missing deployment data. Verification skipped.')
      return
    }

    await this.call('terminal', 'log', { type: 'info', value: `[Verification] Contract deployed. Checking explorers for registration...` })

    await new Promise(resolve => setTimeout(resolve, 5000))

    try {
      const allArtifacts = await this.call('compilerArtefacts' as any, 'getAllCompilerAbstracts')
      const compilerAbstract = allArtifacts ? allArtifacts[filePath] : undefined

      if (!compilerAbstract) {
        await this.call('terminal', 'log', { type: 'warn', value: `[Verification] Artifacts not found for ${contractName}.` })
        return
      }

      let abiEncodedConstructorArgs = ''
      try {
        const contractData = compilerAbstract.data.contracts[filePath][contractName]
        const abi = contractData.abi
        const constructor = abi.find((item: any) => item.type === 'constructor')

        if (constructor && constructor.inputs.length > 0 && args && args.length > 0) {
          const abiCoder = new AbiCoder()
          const types = constructor.inputs.map((input: any) => input.type)
          abiEncodedConstructorArgs = abiCoder.encode(types, args).replace('0x', '')
        }
      } catch (err: any) {
        console.warn(`Encoding Warning: ${err.message}`)
      }

      const userSettings = this.getUserSettingsFromLocalStorage()
      const chainSettings = mergeChainSettingsWithDefaults(chainId.toString(), userSettings)

      let globalApiKey = ''
      try {
        globalApiKey = await this.call('config' as any, 'getAppParameter', 'etherscan-access-token') || ''
      } catch (e) { }

      const pluginApiKey = chainSettings.verifiers['Etherscan']?.apiKey || ''

      let etherscanApiKeySource = ''
      if (pluginApiKey) {
        etherscanApiKeySource = 'plugin'
      } else if (globalApiKey) {
        etherscanApiKeySource = 'global'
        if (!chainSettings.verifiers['Etherscan']) chainSettings.verifiers['Etherscan'] = {}
        chainSettings.verifiers['Etherscan'].apiKey = globalApiKey
      }

      const contractId = `${chainId}-${address}-${new Date().getTime()}`
      const submittedContract: SubmittedContract = {
        id: contractId,
        address: address,
        chainId: chainId.toString(),
        filePath: filePath,
        contractName: contractName,
        abiEncodedConstructorArgs: abiEncodedConstructorArgs,
        date: new Date().toUTCString(),
        receipts: []
      }
      const verifiers: VerifierIdentifier[] = ['Sourcify', 'Etherscan', 'Blockscout', 'Routescan']
      const activeVerifiers: VerifierIdentifier[] = []

      for (const verifierId of verifiers) {
        if (verifierId === 'Etherscan') {
          const hasApiUrl = !!chainSettings.verifiers['Etherscan']?.apiUrl

          if (hasApiUrl && !etherscanApiKeySource) {
            await this.call('terminal', 'log', { type: 'warn', value: 'Etherscan verification skipped: API key not provided.' })
            await this.call('terminal', 'log', { type: 'warn', value: `Please input the API key in Remix Settings - Connected Services OR Contract Verification Plugin Settings.` })
            continue
          }
          if (hasApiUrl && etherscanApiKeySource === 'global') {
            await this.call('terminal', 'log', { type: 'log', value: '[Etherscan] Using API key from Remix global settings.' })
          }
        }

        if (validConfiguration(chainSettings, verifierId)) {
          activeVerifiers.push(verifierId)
          submittedContract.receipts.push({
            verifierInfo: { name: verifierId, apiUrl: chainSettings.verifiers[verifierId].apiUrl },
            status: 'pending',
            contractId: contractId,
            isProxyReceipt: false,
            failedChecks: 0
          })
        }
      }

      if (activeVerifiers.length === 0) {
        await this.call('terminal', 'log', { type: 'warn', value: `[Verification] No valid verifiers configured for chain ${chainId}.` })
        return
      }

      const saveInitialState = () => {
        const currentData = JSON.parse(window.localStorage.getItem('contract-verification:submitted-contracts') || '{}')
        currentData[contractId] = submittedContract
        window.localStorage.setItem('contract-verification:submitted-contracts', JSON.stringify(currentData))
        this.internalEvents.emit('submissionUpdated')
        setTimeout(() => {
          this.internalEvents.emit('submissionUpdated')
        }, 1000)
      }
      saveInitialState()

      const runSingleVerification = async (verifierId: VerifierIdentifier) => {
        try {
          const verifierSettings = chainSettings.verifiers[verifierId]
          const verifier = getVerifier(verifierId, verifierSettings)

          let isExplorerReady = false
          let checkAttempts = 0
          const maxCheckAttempts = 10

          while (checkAttempts < maxCheckAttempts) {
            checkAttempts++
            try {
              await verifier.lookup(address, chainId)
              isExplorerReady = true
              break
            } catch (lookupError: any) {
              let errMsg = lookupError.message || ''

              if (errMsg.trim().startsWith('<') || errMsg.includes('<!DOCTYPE html>')) {
                errMsg = 'Explorer API Error (500)'
              }

              if (errMsg.includes('does not exist') || errMsg.includes('Unable to locate ContractCode') || errMsg.includes('not found') || errMsg.includes('500') || errMsg.includes('404')) {
                await new Promise(r => setTimeout(r, 3000))
                continue
              }
              break
            }
          }

          if (!isExplorerReady) {
            const msg = `Contract not found on ${verifierId} after 30s. Explorer indexing timed out.`
            await this.call('terminal', 'log', { type: 'warn', value: `[${verifierId}] ${msg}` })
            await this.updateReceiptStatus(contractId, verifierId, { status: 'failed', message: msg })
            return
          }

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout (15s limit exceeded)')), 15000)
          )

          // @ts-ignore
          const verificationTask = verifier.verify(submittedContract, compilerAbstract)
          const result: any = await Promise.race([verificationTask, timeoutPromise])

          await this.updateReceiptStatus(contractId, verifierId, {
            status: result.status,
            message: result.message,
            receiptId: result.receiptId,
            lookupUrl: result.lookupUrl
          })

          const successStatuses = ['verified', 'partially verified', 'already verified', 'exactly verified', 'fully verified']

          if (successStatuses.includes(result.status)) {
            if (result.lookupUrl) {
              const htmlContent = `<span class="text-success">[${verifierId}] Verification Successful!</span> &nbsp;<a href="${result.lookupUrl}" target="_blank">View Code</a>`;
              await this.call('terminal' as any, 'logHtml', { value: htmlContent });
            } else {
              const htmlContent = `<span class="text-success">[${verifierId}] Verification Successful!</span>`;
              await this.call('terminal' as any, 'logHtml', { value: htmlContent });
            }
          } else if (result.status === 'failed') {
            const msg = result.message || 'Unknown failure'
            await this.call('terminal', 'log', { type: 'warn', value: `[${verifierId}] Verification Failed: ${msg}` })
            await this.call('terminal', 'log', { type: 'warn', value: `[${verifierId}] Please open the "Contract Verification" plugin to retry.` })

            if (verifierId === 'Etherscan' && !pluginApiKey) {
              await this.call('terminal', 'log', { type: 'info', value: `Note: To retry Etherscan verification in the plugin, you must save your API key in the plugin settings.` })
            }
          } else if (result.status === 'pending' && result.receiptId) {
            await this.call('terminal', 'log', { type: 'log', value: `[${verifierId}] Verification submitted. Awaiting confirmation...` })
          }

        } catch (error: any) {
          let errorMsg = error.message || 'Unknown error'

          if (errorMsg.trim().startsWith('<') || errorMsg.includes('<!DOCTYPE html>')) {
            errorMsg = 'Explorer API Error (500)'
          }

          await this.updateReceiptStatus(contractId, verifierId, {
            status: 'failed',
            message: errorMsg
          })

          await this.call('terminal', 'log', { type: 'warn', value: `[${verifierId}] Verification Error: ${errorMsg}` })
          await this.call('terminal', 'log', { type: 'warn', value: `[${verifierId}] Please open the "Contract Verification" plugin to retry.` })

          if (verifierId === 'Etherscan' && !pluginApiKey) {
            await this.call('terminal', 'log', { type: 'info', value: `Note: To retry Etherscan verification in the plugin, you must save your API key in the plugin settings.` })
          }
        }
      }

      activeVerifiers.forEach(verifierId => runSingleVerification(verifierId))

    } catch (e) {
      console.error(e)
    }
  }

  private async updateReceiptStatus(contractId: string, verifierId: VerifierIdentifier, updates: any) {
    const data = JSON.parse(window.localStorage.getItem('contract-verification:submitted-contracts') || '{}')
    const contract = data[contractId]
    if (!contract) return

    const receiptIndex = contract.receipts.findIndex((r: any) => r.verifierInfo.name === verifierId)
    if (receiptIndex !== -1) {
      contract.receipts[receiptIndex] = { ...contract.receipts[receiptIndex], ...updates }

      window.localStorage.setItem('contract-verification:submitted-contracts', JSON.stringify(data))
      this.internalEvents.emit('submissionUpdated')
    }
  }

  async isVerificationSupportedForChain(chainId: string): Promise<boolean> {
    try {
      const userSettings = this.getUserSettingsFromLocalStorage()
      const chainSettings = mergeChainSettingsWithDefaults(chainId, userSettings)

      for (const verifierId of VERIFIERS) {
        if (validConfiguration(chainSettings, verifierId as VerifierIdentifier)) {
          return true
        }
      }
      return false
    } catch (e) {
      console.error(e)
      return false
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