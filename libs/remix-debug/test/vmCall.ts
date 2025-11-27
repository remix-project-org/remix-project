'use strict'
import { extendProvider } from '../src/init'
import { createAddressFromPrivateKey } from '@ethereumjs/util'
import { Provider } from '@remix-project/remix-simulator'
import { ethers } from 'ethers'

async function getWeb3 () {
  const remixSimulatorProvider = new Provider({ fork: 'cancun' })
  await remixSimulatorProvider.init()
  await remixSimulatorProvider.Accounts.resetAccounts()
  const provider = new ethers.BrowserProvider(remixSimulatorProvider as any)
  extendProvider(provider)
  return provider
}

async function sendTx (provider, from, to, value, data, cb) {
  try {
    cb = cb || (() => {})
    if (!data.startsWith('0x')) data = '0x' + data
    const signer = await provider.getSigner()
    const receipt = await signer.sendTransaction({
      from: createAddressFromPrivateKey(from.privateKey).toString(),
      to,
      value,
      data,
      gasLimit: 7000000
    })
    cb(null, receipt.hash)
    return receipt.hash
  } catch (e) {
    cb(e)
  }
}

module.exports = {
  sendTx,
  getWeb3
}
