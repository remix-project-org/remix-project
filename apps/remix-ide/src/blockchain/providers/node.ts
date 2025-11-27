import { hashPersonalMessage, isHexString, bytesToHex } from '@ethereumjs/util'
import { ExecutionContext } from '../execution-context'
import Config from '../../config'
import { formatUnits, hexlify, toUtf8Bytes, ethers } from 'ethers'

export class NodeProvider {
  executionContext: ExecutionContext
  config: Config

  constructor (executionContext: ExecutionContext, config: Config) {
    this.executionContext = executionContext
    this.config = config
  }

  getAccounts (cb) {
    if (!this.executionContext.isConnected) {
      return cb('Not connected to a node')
    }
    this.executionContext.web3().send("eth_accounts", []).then(res => cb(null, res)).catch(err => cb(err))
  }

  newAccount (passwordPromptCb, cb) {
    if (!this.executionContext.isConnected) {
      return cb('Not connected to a node')
    }
    if (!this.config.get('settings/personal-mode')) {
      return cb('Not running in personal mode')
    }
    passwordPromptCb((passphrase) => {
      const wallet = ethers.Wallet.createRandom(this.executionContext.web3())
      wallet.encrypt(passphrase).then(jsonWallet => cb(null, wallet.address)).catch(err => cb(err))
    })
  }

  async resetEnvironment () {
    /* Do nothing. */
  }

  async getBalanceInEther (address) {
    const balance = await this.executionContext.web3().getBalance(address)
    const balInString = balance.toString(10)
    return balInString === '0' ? balInString : formatUnits(balInString, 'ether')
  }

  getGasPrice (cb) {
    this.executionContext.web3().getFeeData().then((result => cb(null, result.gasPrice))).catch(err => cb(err))
  }

  signMessage (message, account, passphrase, cb) {
    if (!this.executionContext.isConnected) {
      return cb('Not connected to a node')
    }
    const messageHash = hashPersonalMessage(Buffer.from(message))
    try {
      this.executionContext.web3().getSigner(account).then((signer) => {
        message = isHexString(message) ? message : hexlify(toUtf8Bytes(message))
        signer.sign(message, passphrase || '')
          .then(signedData => cb(undefined, bytesToHex(messageHash), signedData))
          .catch(error => cb(error, bytesToHex(messageHash), undefined))
      })

    } catch (e) {
      cb(e.message)
    }
  }
}
