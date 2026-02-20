import React from "react"
import { Plugin } from "@remixproject/engine"
import { Actions, Provider, SmartAccount, WidgetState, Account } from "../types"
import { trackMatomoEvent } from "@remix-api"
import { IntlShape } from "react-intl"
import { addFVSProvider } from "./providers"
import { aaLocalStorageKey, aaSupportedNetworks, getPimlicoBundlerURL, toAddress } from "@remix-project/remix-lib"
import * as chains from "viem/chains"
import { custom, createWalletClient, createPublicClient, http } from "viem"
import { BrowserProvider, BaseWallet, SigningKey, isAddress } from "ethers"
import { toChecksumAddress, bytesToHex, isZeroAddress } from '@ethereumjs/util'
import { isAccountDeleted, getAccountAlias, deleteAccount as deleteAccountFromStorage, setAccountAlias, clearAccountPreferences } from '../utils/accountStorage'
import { eip7702Constants } from '@remix-project/remix-lib'
export * from "./providers"
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { EnvironmentPlugin } from 'apps/remix-ide/src/app/udapp/udappEnv'
import { entryPoint07Address } from "viem/account-abstraction"
const { createSmartAccountClient } = require("permissionless") /* eslint-disable-line  @typescript-eslint/no-var-requires */
const { toSafeSmartAccount } = require("permissionless/accounts") /* eslint-disable-line  @typescript-eslint/no-var-requires */
const { createPimlicoClient } = require("permissionless/clients/pimlico") /* eslint-disable-line  @typescript-eslint/no-var-requires */

export async function resetVmState (plugin: EnvironmentPlugin, widgetState: WidgetState, dispatch: React.Dispatch<Actions>) {
  const context = widgetState.providers.selectedProvider
  const contextExists = await plugin.call('fileManager', 'exists', `.states/${context}/state.json`)

  if (!contextExists) {
    plugin.call('notification', 'toast', `State not available to reset, as no transactions have been made for selected environment & selected workspace.`)
    throw new Error('State not available to reset')
  }

  const currentProvider = await plugin.call('blockchain', 'getCurrentProvider')
  // Reset environment blocks and account data
  await currentProvider.resetEnvironment()
  // Remove deployed and pinned contracts from UI
  await plugin.call('udapp', 'clearAllInstances')
  // Delete environment state file
  await plugin.call('fileManager', 'remove', `.states/${context}/state.json`)
  // If there are pinned contracts, delete pinned contracts folder
  const isPinnedContracts = await plugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${context}`)
  if (isPinnedContracts) await plugin.call('fileManager', 'remove', `.deploys/pinned-contracts/${context}`)
  // Clear account preferences (aliases and deleted accounts)
  clearAccountPreferences()
  // Refresh account list to show default names and all accounts
  await getAccountsList(plugin, dispatch)
  plugin.call('notification', 'toast', `VM state reset successfully.`)
  trackMatomoEvent(plugin, { category: 'udapp', action: 'deleteState', name: 'VM state reset', isClick: false })
}

export async function forkState (plugin: EnvironmentPlugin, dispatch: React.Dispatch<Actions>, currentProvider: Provider, forkName: string) {
  const provider = currentProvider

  if (!provider) {
    plugin.call('notification', 'toast', `Provider not found.`)
    throw new Error('Provider not found')
  }
  let context = provider.name
  context = context.replace('vm-fs-', '')

  let currentStateDb
  try {
    currentStateDb = JSON.parse(await plugin.call('blockchain', 'getStateDetails'))
  } catch (e) {
    plugin.call('notification', 'toast', `State not available to fork.`)
    throw e
  }

  if (Object.keys(currentStateDb.db).length === 0) {
    plugin.call('notification', 'toast', `State not available to fork, as no transactions have been made for selected environment & selected workspace.`)
    throw new Error('State not available to fork')
  }

  currentStateDb.stateName = forkName
  currentStateDb.forkName = provider.config.fork
  currentStateDb.nodeUrl = provider.config.nodeUrl
  currentStateDb.savingTimestamp = Date.now()
  await plugin.call('fileManager', 'writeFile', `.states/forked_states/${currentStateDb.stateName}.json`, JSON.stringify(currentStateDb, null, 2))
  await addFVSProvider(`.states/forked_states/${currentStateDb.stateName}.json`, 20, plugin, dispatch)
  const name = `vm-fs-${currentStateDb.stateName}`

  // trackMatomoEvent(plugin, { category: 'blockchain', action: 'providerPinned', name: name, isClick: false })
  // this.emit('providersChanged')
  await plugin.call('blockchain', 'changeExecutionContext', { context: name })
  plugin.call('notification', 'toast', `New environment '${currentStateDb.stateName}' created with forked state.`)

  // we also need to copy the pinned contracts:
  if (await plugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${provider.name}`)) {
    const files = await plugin.call('fileManager', 'readdir', `.deploys/pinned-contracts/${provider.name}`)
    if (files && Object.keys(files).length) {
      await plugin.call('fileManager', 'copyDir', `.deploys/pinned-contracts/${provider.name}`, `.deploys/pinned-contracts`, 'vm-fs-' + currentStateDb.stateName)
    }
  }
  trackMatomoEvent(plugin, { category: 'udapp', action: 'forkState', name: `forked from ${context}`, isClick: false })
}

export async function setExecutionContext (provider: Provider, plugin: EnvironmentPlugin, widgetState: WidgetState, dispatch: React.Dispatch<Actions>) {
  if (provider.name === 'walletconnect') {
    await plugin.call('walletconnect', 'openModal')
    plugin.on('walletconnect', 'connectionSuccessful', async () => {
      await plugin.call('blockchain', 'changeExecutionContext', { context: provider.name, fork: provider.config.fork })
      dispatch({ type: 'SET_CURRENT_PROVIDER', payload: provider.name })
      plugin.emit('providersChanged', provider)
    })
    plugin.on('walletconnect', 'connectionFailed', (msg) => {
      plugin.call('notification', 'toast', msg)
      cleanupWalletConnectEvents(plugin)
    })
    plugin.on('walletconnect', 'connectionDisconnected', (msg) => {
      plugin.call('notification', 'toast', msg)
      cleanupWalletConnectEvents(plugin)
    })
  } else {
    await plugin.call('blockchain', 'changeExecutionContext', { context: provider.name, fork: provider.config.fork })
    dispatch({ type: 'SET_CURRENT_PROVIDER', payload: provider.name })
    plugin.emit('providersChanged', provider)
    if (provider.category === 'Browser Extension') {
      await plugin.call('layout', 'maximiseSidePanel', 0.25)
    } else {
      await plugin.call('layout', 'resetSidePanel')
    }
  }
}

function cleanupWalletConnectEvents (plugin: Plugin) {
  plugin.off('walletconnect', 'connectionFailed')
  plugin.off('walletconnect', 'connectionDisconnected')
  plugin.off('walletconnect', 'connectionSuccessful')
}

export async function getAccountsList (plugin: EnvironmentPlugin, dispatch: React.Dispatch<Actions>) {
  let accounts = await plugin.call('blockchain', 'getAccounts')
  const provider = await plugin.call('blockchain', 'getProvider')
  let safeAddresses = []

  if (provider && provider.startsWith('injected') && accounts?.length) {
    const smartAccountsStr = localStorage.getItem(aaLocalStorageKey)
    let smartAccounts = []
    const networkStatus = await plugin.call('blockchain', 'getCurrentNetworkStatus')
    const currentChainId = networkStatus?.network?.id
    if (smartAccountsStr) {
      const smartAccountsObj = JSON.parse(smartAccountsStr)
      if (smartAccountsObj[currentChainId]) {
        smartAccounts = smartAccountsObj[currentChainId]
      } else {
        smartAccountsObj[currentChainId] = {}
        localStorage.setItem(aaLocalStorageKey, JSON.stringify(smartAccountsObj))
      }
    } else {
      const objToStore = {}
      objToStore[currentChainId] = {}
      localStorage.setItem(aaLocalStorageKey, JSON.stringify(objToStore))
    }
    if (Object.keys(smartAccounts).length) {
      safeAddresses = smartAccounts.map(account => account.account)
      accounts.push(...safeAddresses)
    }
  }
  if (!accounts) accounts = []

  // Filter out deleted accounts
  accounts = accounts.filter((account: string) => !isAccountDeleted(account))
  const defaultAccounts = []
  const smartAccounts = []
  let index = 1
  for (const account of accounts) {
    const balance = await plugin.blockchain.getBalanceInEther(account)
    // Get custom alias or use default
    const customAlias = getAccountAlias(account)
    const alias = customAlias || `Account ${index}`

    if (provider.startsWith('injected') && plugin.blockchain && plugin.blockchain['networkNativeCurrency'] && plugin.blockchain['networkNativeCurrency'].symbol)
      defaultAccounts.push({
        alias: alias,
        account: account,
        balance: parseFloat(balance).toFixed(3),
        symbol: plugin.blockchain['networkNativeCurrency'].symbol
      })
    else
      defaultAccounts.push({
        alias: alias,
        account: account,
        balance: parseFloat(balance).toFixed(3),
        symbol: plugin.blockchain['networkNativeCurrency'].symbol
      })
    if (safeAddresses.length && safeAddresses.includes(account)) smartAccounts.push({
      alias: alias,
      account: account,
      balance: parseFloat(balance).toFixed(3)
    })
    index++
  }
  dispatch({ type: 'SET_ACCOUNTS', payload: defaultAccounts })
  dispatch({ type: 'SET_SMART_ACCOUNTS', payload: smartAccounts })
}

export async function loadAllDelegations (plugin: EnvironmentPlugin, accounts: Account[], currentProvider: string, dispatch: React.Dispatch<Actions>) {
  // Only load delegations for EIP-7702 compatible environments
  if (currentProvider !== 'vm-prague' && currentProvider !== 'vm-osaka' && !currentProvider.includes('mainnet-fork')) {
    return
  }

  try {
    const web3 = await plugin.call('blockchain', 'web3')
    if (!web3) {
      return
    }

    for (const account of accounts) {
      try {
        const code = await web3.getCode(account.account)
        if (code && code.startsWith(eip7702Constants.EIP7702_CODE_INDICATOR_FLAG)) {
          const address = '0x' + code.replace(eip7702Constants.EIP7702_CODE_INDICATOR_FLAG, '')
          if (address !== '0x0000000000000000000000000000000000000000') {
            dispatch({ type: 'SET_DELEGATION', payload: { account: account.account, address } })
          }
        }
      } catch (error) {
        console.error(`Error loading delegation for account ${account.account}:`, error)
      }
    }
  } catch (error) {
    console.error('Error loading delegations:', error)
  }
}

export async function createNewAccount (plugin: EnvironmentPlugin, dispatch: React.Dispatch<Actions>) {
  try {
    const address = await plugin.call('blockchain', 'newAccount')

    plugin.call('notification', 'toast', `account ${address} created`)
    await getAccountsList(plugin, dispatch)
  } catch (error) {
    return plugin.call('notification', 'toast', 'Cannot create an account: ' + error)
  }
}

export async function createSmartAccount (plugin: EnvironmentPlugin, widgetState: WidgetState, dispatch: React.Dispatch<Actions>) {
  plugin.call('notification', 'toast', `Preparing tx to sign...`)
  const chainId = widgetState.network.chainId
  const chain = chains[aaSupportedNetworks[chainId].name]
  const PUBLIC_NODE_URL = aaSupportedNetworks[chainId].publicNodeUrl
  const BUNDLER_URL = getPimlicoBundlerURL(chainId)
  const safeAddresses: string[] = widgetState.accounts.smartAccounts.map(account => account.account)
  let salt: number = 0

  // @ts-ignore
  const [account] = await window.ethereum!.request({ method: 'eth_requestAccounts' })

  const walletClient = createWalletClient({
    account,
    chain,
    transport: custom(window.ethereum!),
  })

  const publicClient = createPublicClient({
    chain,
    transport: http(PUBLIC_NODE_URL) // choose any provider here
  })

  const safeAddressesLength = safeAddresses.length
  if (safeAddressesLength) {
    const lastSafeAddress: string = safeAddresses[safeAddressesLength - 1]
    const lastSmartAccount = widgetState.accounts.smartAccounts.find(acc => acc.account === lastSafeAddress)
    salt = lastSmartAccount?.salt != null ? lastSmartAccount.salt + 1 : 0
  }

  try {
    const safeAccount = await toSafeSmartAccount({
      client: publicClient,
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
      owners: [walletClient],
      saltNonce: salt,
      version: "1.4.1"
    })

    const paymasterClient = createPimlicoClient({
      transport: http(BUNDLER_URL),
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
    })

    const saClient = createSmartAccountClient({
      account: safeAccount,
      chain,
      paymaster: paymasterClient,
      bundlerTransport: http(BUNDLER_URL),
      userOperation: {
        estimateFeesPerGas: async () => (await paymasterClient.getUserOperationGasPrice()).fast,
      }
    })

    // Make a dummy tx to force smart account deployment
    const useropHash = await saClient.sendUserOperation({
      calls: [{
        to: toAddress,
        value: 0
      }]
    })
    plugin.call('notification', 'toast', `Waiting for tx confirmation, can take 5-10 seconds...`)
    await saClient.waitForUserOperationReceipt({ hash: useropHash })

    console.log('safeAccount: ', safeAccount)

    const sAccount: SmartAccount = {
      alias: `Smart Account ${safeAddressesLength + 1}`,
      account : safeAccount.address,
      balance: '0',
      salt,
      ownerEOA: account,
      timestamp: Date.now()
    }
    const smartAccounts = [...widgetState.accounts.smartAccounts, sAccount]
    // Save smart accounts in local storage
    const smartAccountsStr = localStorage.getItem(aaLocalStorageKey)
    if (!smartAccountsStr) {
      const objToStore = {}
      objToStore[chainId] = smartAccounts
      localStorage.setItem(aaLocalStorageKey, JSON.stringify(objToStore))
    } else {
      const smartAccountsObj = JSON.parse(smartAccountsStr)
      smartAccountsObj[chainId] = smartAccounts
      localStorage.setItem(aaLocalStorageKey, JSON.stringify(smartAccountsObj))
    }
    await getAccountsList(plugin, dispatch)
    await trackMatomoEvent(plugin, { category: 'udapp', action: 'safeSmartAccount', name: `createdSuccessfullyForChainID:${chainId}`, isClick: false })
    return plugin.call('notification', 'toast', `Safe account ${safeAccount.address} created for owner ${account}`)
  } catch (error) {
    await trackMatomoEvent(plugin, { category: 'udapp', action: 'safeSmartAccount', name: `creationFailedWithError:${error.message}`, isClick: false })
    console.error('Failed to create safe smart account: ', error)
    if (error.message.includes('User rejected the request')) return plugin.call('notification', 'toast', `User rejected the request to create safe smart account !!!`)
    else return plugin.call('notification', 'toast', `Failed to create safe smart account !!!`)
  }
}

export async function authorizeDelegation (contractAddress: string, plugin: EnvironmentPlugin, selectedAccount: string, allAccounts: Account[], dispatch?: React.Dispatch<Actions>) {
  try {
    if (!isAddress(toChecksumAddress(contractAddress))) {
      await plugin.call('terminal', 'log', { type: 'info', value: `Please use an ethereum address of a contract deployed in the current chain.` })
      throw new Error('Invalid contract address')
    }
  } catch (e) {
    throw new Error(`Error while validating the provided contract address. \n ${e.message}`)
  }

  const provider = {
    request: async (query: any) => {
      const ret = await plugin.call('web3Provider', 'sendAsync', query)
      return ret.result
    }
  }

  plugin.call('terminal', 'log', { type: 'info', value: !isZeroAddress(contractAddress) ? 'Signing and activating delegation...' : 'Removing delegation...' })

  const ethersProvider = new BrowserProvider(provider)
  const pKey = await ethersProvider.send('eth_getPKey', [selectedAccount])
  const authSignerPKey = new BaseWallet(new SigningKey(bytesToHex(pKey)), ethersProvider)
  const auth = await authSignerPKey.authorize({ address: contractAddress, chainId: 0 });
  const signerForAuth = allAccounts.find((a) => a.account !== selectedAccount)?.account
  const signer = await ethersProvider.getSigner(signerForAuth)
  let tx: any

  try {
    tx = await signer.sendTransaction({
      type: 4,
      to: selectedAccount,
      authorizationList: [auth]
    });
  } catch (e) {
    console.error(e)
    throw e
  }

  let receipt: any
  try {
    receipt = await tx.wait()
  } catch (e) {
    console.error(e)
    throw e
  }

  if (!isZeroAddress(contractAddress)) {
    const artefact = await plugin.call('compilerArtefacts', 'getContractDataFromAddress', contractAddress)
    if (artefact) {
      const data = await plugin.call('compilerArtefacts', 'getCompilerAbstract', artefact.file)
      const contractObject = {
        name: artefact.name,
        abi: artefact.contract.abi,
        compiler: data,
        contract: {
          file : artefact.file,
          object: artefact.contract
        }
      }
      await plugin.call('udappDeployedContracts', 'addInstance', selectedAccount, artefact.contract.abi, 'Delegated ' + artefact.name, contractObject)
      await plugin.call('compilerArtefacts', 'addResolvedContract', selectedAccount, data)
      plugin.call('terminal', 'log', { type: 'info',
        value: `Contract interation with ${selectedAccount} has been added to the deployed contracts. Please make sure the contract is pinned.` })
    }
    plugin.call('terminal', 'log', { type: 'info',
      value: `Delegation for ${selectedAccount} activated. This account will be running the code located at ${contractAddress} .` })

    // Update delegation state
    if (dispatch) {
      dispatch({ type: 'SET_DELEGATION', payload: { account: selectedAccount, address: contractAddress } })
    }
  } else {
    plugin.call('terminal', 'log', { type: 'info',
      value: `Delegation for ${selectedAccount} removed.` })

    // Remove delegation from state
    if (dispatch) {
      dispatch({ type: 'REMOVE_DELEGATION', payload: selectedAccount })
    }
  }

  await plugin.call('blockchain', 'dumpState')

  return { txHash: receipt.hash }
}

export async function signMessageWithAddress (
  plugin: EnvironmentPlugin,
  account: string,
  message: string,
  passphrase?: string
): Promise<{ msgHash: string, signedData: string }> {
  try {
    const result = await plugin.call('blockchain', 'signMessage', message, account, passphrase)
    return result
  } catch (err) {
    console.error(err)
    const errorMsg = typeof err === 'string' ? err : err.message
    plugin.call('notification', 'toast', errorMsg)
    throw err
  }
}

export async function deleteAccountAction (
  accountAddress: string,
  plugin: EnvironmentPlugin,
  widgetState: WidgetState,
  dispatch: React.Dispatch<Actions>
) {
  // If this is the selected account, switch to the first available account
  if (widgetState.accounts.selectedAccount === accountAddress) {
    const remainingAccounts = widgetState.accounts.defaultAccounts.filter(
      acc => acc.account !== accountAddress
    )
    if (remainingAccounts.length > 0) {
      dispatch({ type: 'SET_SELECTED_ACCOUNT', payload: remainingAccounts[0].account })
    }
  }

  // Mark account as deleted in localStorage
  deleteAccountFromStorage(accountAddress)

  // Refresh accounts list
  await getAccountsList(plugin, dispatch)

  plugin.call('notification', 'toast', `Account ${accountAddress} deleted`)
}

export async function updateAccountAlias (
  accountAddress: string,
  newAlias: string,
  plugin: EnvironmentPlugin,
  dispatch: React.Dispatch<Actions>
) {
  // Save alias to localStorage
  setAccountAlias(accountAddress, newAlias)

  // Refresh accounts list to show updated alias
  await getAccountsList(plugin, dispatch)

  plugin.call('notification', 'toast', `Account alias updated to "${newAlias}"`)
}
