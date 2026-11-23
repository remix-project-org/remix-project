import { Mainnet, createCustomCommon } from '@ethereumjs/common'
import { createEOACode7702Tx, createEOACode7702TxFromRLP, EOACode7702Tx } from '@ethereumjs/tx'
import type { EOACode7702AuthorizationListBytesItem } from '@ethereumjs/util'
import { getBytes, hexlify, toBeArray, toBeHex } from 'ethers'
import type { ExecuteRequest } from 'monad-evm2js'
import { RpcError } from './types'

export interface SignedEnvelope {
  hash: string
  signature: { r: string; s: string; v: number; yParity: number; networkV?: bigint }
}

// Prague enables type-4 envelopes without imposing Ethereum Osaka's EIP-7825 gas cap.
// Monad gas and authorization rules stay in the provider and Rust engine.
const common = (chainId: number) => createCustomCommon({ chainId }, Mainnet, { hardfork: 'prague' })
const envelope = (tx: EOACode7702Tx): SignedEnvelope => ({
  hash: hexlify(tx.hash()), signature: { r: toBeHex(tx.r, 32), s: toBeHex(tx.s, 32), v: Number(tx.v) + 27, yParity: Number(tx.v) }
})

type DelegatedInput = Pick<ExecuteRequest, 'nonce' | 'to' | 'data' | 'value' | 'gas' | 'gasPrice' | 'priorityFee' | 'accessList' | 'authorizationList'>

export function signDelegatedTransaction(input: DelegatedInput, privateKey: string, chainId: number): SignedEnvelope {
  const tx = createEOACode7702Tx({
    chainId: BigInt(chainId), nonce: BigInt(input.nonce), to: getBytes(input.to), data: getBytes(input.data),
    value: BigInt(input.value), gasLimit: BigInt(input.gas), maxFeePerGas: BigInt(input.gasPrice), maxPriorityFeePerGas: BigInt(input.priorityFee),
    accessList: input.accessList.map(entry => [getBytes(entry.address), entry.storageKeys.map(key => getBytes(key))]),
    authorizationList: input.authorizationList.map<EOACode7702AuthorizationListBytesItem>(auth => [toBeArray(auth.chainId), getBytes(auth.address), toBeArray(auth.nonce),
      toBeArray(auth.yParity), toBeArray(auth.r), toBeArray(auth.s)])
  }, { common: common(chainId) }).sign(getBytes(privateKey))
  return envelope(tx)
}

export function decodeDelegatedTransaction(raw: string, chainId: number) {
  // Unlike ethers' Signature objects, this codec preserves tuples that the engine must skip.
  const tx = createEOACode7702TxFromRLP(getBytes(raw), { common: common(chainId) })
  if (!tx.isSigned() || !tx.verifySignature()) throw new RpcError('Invalid signed transaction')
  if (hexlify(tx.serialize()) !== hexlify(getBytes(raw))) throw new RpcError('Noncanonical signed transaction encoding')
  const json = tx.toJSON()
  const quantity = (value: string) => value === '0x' ? '0x0' : value
  return { signed: envelope(tx), input: { ...json, from: tx.getSenderAddress().toString(),
    authorizationList: json.authorizationList.map(auth => ({ ...auth, chainId: quantity(auth.chainId), nonce: quantity(auth.nonce),
      yParity: quantity(auth.yParity), r: quantity(auth.r), s: quantity(auth.s) })) } }
}
