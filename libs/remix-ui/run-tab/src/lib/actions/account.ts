import { shortenAddress } from "@remix-ui/helper"
import { RunTab } from "../types/run-tab"
import { trackMatomoEvent } from '@remix-api'
import { clearInstances, setAccount, setExecEnv } from "./actions"
import { displayNotification, fetchAccountsListFailed, fetchAccountsListRequest, fetchAccountsListSuccess, setMatchPassphrase, setPassphrase } from "./payload"
import { toChecksumAddress, bytesToHex, isZeroAddress } from '@ethereumjs/util'
import { aaSupportedNetworks, aaLocalStorageKey, getPimlicoBundlerURL, toAddress } from '@remix-project/remix-lib'
import { SmartAccount } from "../types"
import { BrowserProvider, BaseWallet, SigningKey, isAddress } from "ethers"
import "viem/window"
import { custom, createWalletClient, createPublicClient, http } from "viem"
import * as chains from "viem/chains"
import { entryPoint07Address } from "viem/account-abstraction"
const { createSmartAccountClient } = require("permissionless") /* eslint-disable-line  @typescript-eslint/no-var-requires */
const { toSafeSmartAccount } = require("permissionless/accounts") /* eslint-disable-line  @typescript-eslint/no-var-requires */
const { createPimlicoClient } = require("permissionless/clients/pimlico") /* eslint-disable-line  @typescript-eslint/no-var-requires */

export const updateAccountBalances = async (plugin: RunTab, dispatch: React.Dispatch<any>) => {
  const accounts = plugin.REACT_API.accounts.loadedAccounts

  for (const account of Object.keys(accounts)) {
    const balance = await plugin.blockchain.getBalanceInEther(account)
    const updated = shortenAddress(account, balance)
    accounts[account] = updated
  }
  dispatch(fetchAccountsListSuccess(accounts))
}

export const fillAccountsList = async (plugin: RunTab, dispatch: React.Dispatch<any>) => {
  try {
    dispatch(fetchAccountsListRequest())
    try {
      let accounts = await plugin.blockchain.getAccounts()
      const provider = plugin.blockchain.getProvider()
      let safeAddresses = []
      if (provider && provider.startsWith('injected') && accounts?.length) {
        await loadSmartAccounts(plugin)
        if (plugin.REACT_API.smartAccounts) {
          safeAddresses = Object.keys(plugin.REACT_API.smartAccounts)
          accounts.push(...safeAddresses)
        }
      }
      if (!accounts) accounts = []

      const loadedAccounts = {}

      for (const account of accounts) {
        const balance = await plugin.blockchain.getBalanceInEther(account)
        if (provider.startsWith('injected') && plugin.blockchain && plugin.blockchain['networkNativeCurrency'] && plugin.blockchain['networkNativeCurrency'].symbol)
          loadedAccounts[account] = shortenAddress(account, balance, plugin.blockchain['networkNativeCurrency'].symbol)
        else
          loadedAccounts[account] = shortenAddress(account, balance)
        if (safeAddresses.length && safeAddresses.includes(account)) loadedAccounts[account] = `[SMART] ${loadedAccounts[account]}`
      }
      dispatch(fetchAccountsListSuccess(loadedAccounts))
    } catch (e) {
      dispatch(fetchAccountsListFailed(e.message))
    }
  } catch (e) {
    plugin.call('notification', 'toast', `Cannot get account list: ${e}`)
    dispatch(fetchAccountsListFailed(e.message))
  }
}

export const setFinalContext = (plugin: RunTab, dispatch: React.Dispatch<any>) => {
  dispatch(fetchAccountsListRequest())
  // set the final context. Cause it is possible that this is not the one we've originally selected
  const value = _getProviderDropdownValue(plugin)

  setExecEnv(dispatch, value)
  clearInstances(dispatch)
}

const _getProviderDropdownValue = (plugin: RunTab): string => {
  return plugin.blockchain.getProvider()
}

export const setExecutionContext = (plugin: RunTab, dispatch: React.Dispatch<any>, executionContext: { context: string, fork: string }) => {
  if (executionContext.context && executionContext.context !== plugin.REACT_API.selectExEnv) {
    if (executionContext.context === 'walletconnect') {
      setWalletConnectExecutionContext(plugin, dispatch, executionContext)
    } else {
      plugin.blockchain.changeExecutionContext(executionContext, null, (alertMsg) => {
        plugin.call('notification', 'toast', alertMsg)
      }, async () => {})
    }
  }
}

export const createNewBlockchainAccount = async (plugin: RunTab, dispatch: React.Dispatch<any>, cbMessage: JSX.Element) => {
  plugin.blockchain.newAccount(
    '',
    (cb) => {
      dispatch(displayNotification('Enter Passphrase', cbMessage, 'OK', 'Cancel', async () => {
        if (plugin.REACT_API.passphrase === plugin.REACT_API.matchPassphrase) {
          cb(plugin.REACT_API.passphrase)
        } else {
          dispatch(displayNotification('Error', 'Passphrase does not match', 'OK', null))
        }
        setPassphrase('')
        setMatchPassphrase('')
      }, () => {}))
    },
    async (error, address) => {
      if (error) {
        return plugin.call('notification', 'toast', 'Cannot create an account: ' + error)
      }
      plugin.call('notification', 'toast', `account ${address} created`)
      await fillAccountsList(plugin, dispatch)
    }
  )
}

export const delegationAuthorization = async (contractAddress: string, plugin: RunTab) => {
  try {
    if (!isAddress(toChecksumAddress(contractAddress))) {
      await plugin.call('terminal', 'log', { type: 'info', value: `Please use an ethereum address of a contract deployed in the current chain.` })
      return
    }
  } catch (e) {
    throw new Error(`Error while validating the provided contract address. \n ${e.message}`)
  }

  const provider = {
    request: async (query) => {
      const ret = await plugin.call('web3Provider', 'sendAsync', query)
      return ret.result
    }
  }

  plugin.call('terminal', 'log', { type: 'info', value: !isZeroAddress(contractAddress) ? 'Signing and activating delegation...' : 'Removing delegation...' })

  const ethersProvider = new BrowserProvider(provider)
  const pKey = await ethersProvider.send('eth_getPKey', [plugin.REACT_API.accounts.selectedAccount])
  const authSignerPKey = new BaseWallet(new SigningKey(bytesToHex(pKey)), ethersProvider)
  const auth = await authSignerPKey.authorize({ address: contractAddress, chainId: 0 });

  const signerForAuth = Object.keys(plugin.REACT_API.accounts.loadedAccounts).find((a) => a !== plugin.REACT_API.accounts.selectedAccount)
  const signer = await ethersProvider.getSigner(signerForAuth)
  let tx

  try {
    tx = await signer.sendTransaction({
      type: 4,
      to: plugin.REACT_API.accounts.selectedAccount,
      authorizationList: [auth]
    });
  } catch (e) {
    console.error(e)
    throw e
  }

  let receipt
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
      plugin.call('udapp', 'addInstance', plugin.REACT_API.accounts.selectedAccount, artefact.contract.abi, 'Delegated ' + artefact.name, contractObject)
      await plugin.call('compilerArtefacts', 'addResolvedContract', plugin.REACT_API.accounts.selectedAccount, data)
      plugin.call('terminal', 'log', { type: 'info',
        value: `Contract interation with ${plugin.REACT_API.accounts.selectedAccount} has been added to the deployed contracts. Please make sure the contract is pinned.` })
    }
    plugin.call('terminal', 'log', { type: 'info',
      value: `Delegation for ${plugin.REACT_API.accounts.selectedAccount} activated. This account will be running the code located at ${contractAddress} .` })
  } else {
    plugin.call('terminal', 'log', { type: 'info',
      value: `Delegation for ${plugin.REACT_API.accounts.selectedAccount} removed.` })
  }

  await plugin.call('blockchain', 'dumpState')

  return { txHash: receipt.hash }
}

export const createSmartAccount = async (plugin: RunTab, dispatch: React.Dispatch<any>) => {
  plugin.call('notification', 'toast', `Preparing tx to sign...`)
  const { chainId } = plugin.REACT_API
  const chain = chains[aaSupportedNetworks[chainId].name]
  const PUBLIC_NODE_URL = aaSupportedNetworks[chainId].publicNodeUrl
  const BUNDLER_URL = getPimlicoBundlerURL(chainId)

  const safeAddresses: string[] = Object.keys(plugin.REACT_API.smartAccounts)
  let salt

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

  if (safeAddresses.length) {
    const lastSafeAddress: string = safeAddresses[safeAddresses.length - 1]
    const lastSmartAccount: SmartAccount = plugin.REACT_API.smartAccounts[lastSafeAddress]
    salt = lastSmartAccount.salt + 1
  } else salt = 0

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

    // To verify creation, check if there is a contract code at this address
    const safeAddress = safeAccount.address
    const sAccount: SmartAccount = {
      address : safeAccount.address,
      salt,
      ownerEOA: account,
      timestamp: Date.now()
    }
    plugin.REACT_API.smartAccounts[safeAddress] = sAccount
    // Save smart accounts in local storage
    const smartAccountsStr = localStorage.getItem(aaLocalStorageKey)
    if (!smartAccountsStr) await loadSmartAccounts(plugin) // In case, localstorage is cleared or not well loaded, load smart accounts again
    const smartAccountsObj = JSON.parse(smartAccountsStr)
    smartAccountsObj[chainId] = plugin.REACT_API.smartAccounts
    localStorage.setItem(aaLocalStorageKey, JSON.stringify(smartAccountsObj))
    await fillAccountsList(plugin, dispatch)
    await trackMatomoEvent(plugin, { category: 'udapp', action: 'safeSmartAccount', name: `createdSuccessfullyForChainID:${chainId}`, isClick: false })
    return plugin.call('notification', 'toast', `Safe account ${safeAccount.address} created for owner ${account}`)
  } catch (error) {
    await trackMatomoEvent(plugin, { category: 'udapp', action: 'safeSmartAccount', name: `creationFailedWithError:${error.message}`, isClick: false })
    console.error('Failed to create safe smart account: ', error)
    if (error.message.includes('User rejected the request')) return plugin.call('notification', 'toast', `User rejected the request to create safe smart account !!!`)
    else return plugin.call('notification', 'toast', `Failed to create safe smart account !!!`)
  }
}

export const loadSmartAccounts = async (plugin) => {
  const { chainId } = plugin.REACT_API
  const smartAccountsStr = localStorage.getItem(aaLocalStorageKey)
  if (smartAccountsStr) {
    const smartAccountsObj = JSON.parse(smartAccountsStr)
    if (smartAccountsObj[chainId]) {
      plugin.REACT_API.smartAccounts = smartAccountsObj[chainId]
    } else {
      smartAccountsObj[chainId] = {}
      localStorage.setItem(aaLocalStorageKey, JSON.stringify(smartAccountsObj))
    }
  } else {
    const objToStore = {}
    objToStore[chainId] = {}
    localStorage.setItem(aaLocalStorageKey, JSON.stringify(objToStore))
  }
}

export const signMessageWithAddress = (plugin: RunTab, dispatch: React.Dispatch<any>, account: string, message: string, modalContent: (hash: string, data: string) => JSX.Element, passphrase?: string) => {
  plugin.blockchain.signMessage(message, account, passphrase, (err, msgHash, signedData) => {
    if (err) {
      console.error(err)
      return plugin.call('notification', 'toast', typeof err === 'string' ? err : err.message)
    }
    dispatch(displayNotification('Signed Message', modalContent(msgHash, signedData), 'OK', null, () => {}, null))
  })
}

export const addFileInternal = async (plugin: RunTab, path: string, content: string) => {
  const file = await plugin.call('fileManager', 'writeFileNoRewrite', path, content)
  await plugin.call('fileManager', 'open', file.newPath)
}

const setWalletConnectExecutionContext = (plugin: RunTab, dispatch: React.Dispatch<any>, executionContext: { context: string, fork: string }) => {
  plugin.call('walletconnect', 'openModal').then(() => {
    plugin.on('walletconnect', 'connectionSuccessful', () => {
      plugin.blockchain.changeExecutionContext(executionContext, null, (alertMsg) => {
        plugin.call('notification', 'toast', alertMsg)
      }, async () => {})
    })
    plugin.on('walletconnect', 'connectionFailed', (msg) => {
      plugin.call('notification', 'toast', msg)
      cleanupWalletConnectEvents(plugin)
    })
    plugin.on('walletconnect', 'connectionDisconnected', (msg) => {
      plugin.call('notification', 'toast', msg)
      cleanupWalletConnectEvents(plugin)
    })
  })
}

const cleanupWalletConnectEvents = (plugin: RunTab) => {
  plugin.off('walletconnect', 'connectionFailed')
  plugin.off('walletconnect', 'connectionDisconnected')
  plugin.off('walletconnect', 'connectionSuccessful')
}
