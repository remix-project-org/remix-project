import { hashPersonalMessage, isHexString, bytesToHex } from '@ethereumjs/util'
import { ExecutionContext } from '../execution-context'
import { formatUnits, hexlify, toUtf8Bytes } from 'ethers'

export class InjectedProvider {
  executionContext: ExecutionContext

  constructor (executionContext) {
    this.executionContext = executionContext
  }

  getAccounts (cb) {
    return this.executionContext.web3().send("eth_requestAccounts", [])
      .then(accounts => cb(null, accounts))
      .catch(err => {
        cb(err.message)
      })
  }

  newAccount (passwordPromptCb, cb) {
    /* Do nothing. On UI too, this feature is not supported*/
    // passwordPromptCb((passphrase) => {
    //   this.executionContext.web3().eth.personal.newAccount(passphrase).then((result) => cb(null, result)).catch(error => cb(error))
    // })
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
    this.executionContext.web3().getFeeData().then((result => cb(null, result.gasPrice)))
  }

  signMessage (message, account, _passphrase, cb) {
    const messageHash = hashPersonalMessage(Buffer.from(message))
    try {
      this.executionContext.web3().getSigner(account).then((signer) => {
        message = isHexString(message) ? message : hexlify(toUtf8Bytes(message))
        // see https://docs.metamask.io/wallet/reference/json-rpc-methods/personal_sign/
        signer.signMessage(message)
          .then(signedData => cb(undefined, bytesToHex(messageHash), signedData))
          .catch(error => cb(error, bytesToHex(messageHash), undefined))
      })
    } catch (e) {
      cb(e.message)
    }
  }
}
