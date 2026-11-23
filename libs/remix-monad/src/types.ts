import type { Engine } from 'monad-evm2js'

export type { MonadSpec, AccountState, ExecutionResult as EngineResult } from 'monad-evm2js'
export type MonadEngine = Pick<Engine, 'fund' | 'account' | 'execute' | 'snapshot' | 'restore' | 'set_block_hash' | 'free'>

export interface RpcRequest {
  method: string
  params?: any[]
  id?: number
  jsonrpc?: string
}

export class RpcError extends Error {
  constructor(message: string, public code = -32602, public data?: string) {
    super(message)
  }
}
