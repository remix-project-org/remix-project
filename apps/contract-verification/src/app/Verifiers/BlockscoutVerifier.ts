import { blockscout, blockscoutProxyLink } from 'explorer-verify/clients/blockscout'
import { EtherscanVerifier } from './EtherscanVerifier'
import { type ExplorerVerifyRoute, joinApiUrl, link } from './explorerVerify'
import type { SourceFile, SubmittedContract, VerificationResponse } from '../types'

// Etherscan and Blockscout return different objects from the getsourcecode method
interface BlockscoutSource {
  AdditionalSources: Array<{ SourceCode: string; Filename: string }>
  ConstructorArguments: string
  OptimizationRuns: number
  IsProxy: string
  SourceCode: string
  ABI: string
  ContractName: string
  CompilerVersion: string
  OptimizationUsed: string
  Runs: string
  EVMVersion: string
  FileName: string
  Address: string
}

export class BlockscoutVerifier extends EtherscanVerifier {
  LOOKUP_STORE_DIR = 'blockscout-verified'

  constructor(apiUrl: string) {
    // apiUrl and explorerUrl are the same for Blockscout
    super(apiUrl, apiUrl, undefined)
  }

  protected explorerVerifyRoute(): ExplorerVerifyRoute {
    return { backend: 'blockscout', clients: [blockscout()], route: { backend: 'blockscout', apiUrl: joinApiUrl(this.apiUrl, '/api') } }
  }

  async verifyProxy(submittedContract: SubmittedContract): Promise<VerificationResponse> {
    const { route, fetch } = this.explorerVerifyRoute()
    return link({ backend: 'blockscout', clients: [blockscoutProxyLink()], route, fetch }, submittedContract)
  }

  getContractCodeUrl(address: string, chainId: string): string {
    const url = new URL(this.explorerUrl + `/address/${address}`)
    url.searchParams.append('tab', 'contract')
    return url.href
  }

  processReceivedFiles(source: unknown, contractAddress: string, chainId: string): { sourceFiles: SourceFile[]; targetFilePath?: string } {
    const blockscoutSource = source as BlockscoutSource

    const result: SourceFile[] = []
    const filePrefix = `/${this.LOOKUP_STORE_DIR}/${chainId}/${contractAddress}`

    let targetFilePath
    if (!blockscoutSource.FileName.startsWith('..')) targetFilePath = `${filePrefix}/${blockscoutSource.FileName}`
    else targetFilePath = `${filePrefix}/targetFile.sol`

    result.push({ content: blockscoutSource.SourceCode, path: targetFilePath })

    for (const additional of blockscoutSource.AdditionalSources ?? []) {
      if (!additional.Filename.startsWith('..')) result.push({ content: additional.SourceCode, path: `${filePrefix}/${additional.Filename}` })
    }

    return { sourceFiles: result, targetFilePath }
  }
}
