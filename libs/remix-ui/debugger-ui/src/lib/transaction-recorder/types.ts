export interface ContractDeployment {
  address: string
  name: string
  abi: any[]
  timestamp: number
  from: string
  transactionHash: string
  blockHash: string
  blockNumber: number
  gasUsed: number
  status: string
}

export interface ContractInteraction {
  transactionHash: string
  from: string
  to: string
  timestamp: number
  blockNumber: number
  gasUsed: number
  status: string
  methodName?: string
  value?: string
}

export type SortOrder = 'newest' | 'oldest'
export type TabType = 'contract-call' | 'transaction-list'
