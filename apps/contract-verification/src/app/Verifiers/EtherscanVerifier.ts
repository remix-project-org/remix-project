import { CompilerAbstract } from '@remix-project/remix-solidity'
import { AbstractVerifier } from './AbstractVerifier'
import type { LookupResponse, SourceFile, SubmittedContract, VerificationResponse } from '../types'
import { etherscanV2, etherscanV2ProxyLink } from 'explorer-verify/clients/etherscan-v2'
import { type ExplorerVerifyRoute, joinApiUrl, link, poll, submit, toVerifyInput } from './explorerVerify'

interface EtherscanRpcResponse {
  status: '0' | '1'
  message: string
  result: string
}

interface EtherscanSource {
  SourceCode: string
  ABI: string
  ContractName: string
  CompilerVersion: string
  OptimizationUsed: string
  Runs: string
  ConstructorArguments: string
  EVMVersion: string
  Library: string
  LicenseType: string
  Proxy: string
  Implementation: string
  SwarmSource: string
}

interface EtherscanGetSourceCodeResponse {
  status: '0' | '1'
  message: string
  result: EtherscanSource[]
}

export class EtherscanVerifier extends AbstractVerifier {
  LOOKUP_STORE_DIR = 'etherscan-verified'

  constructor(apiUrl: string, explorerUrl: string, protected apiKey?: string) {
    super(apiUrl, explorerUrl)
  }

  /** The explorer-verify route for this verifier's settings. */
  protected explorerVerifyRoute(): ExplorerVerifyRoute {
    // The key goes only to this API URL, as before. explorer-verify removes it from errors and logs.
    return {
      backend: 'etherscan-v2',
      clients: [etherscanV2()],
      route: { backend: 'etherscan-v2', apiUrl: joinApiUrl(this.apiUrl, '/api'), apiKey: this.apiKey || undefined },
    }
  }

  async verify(submittedContract: SubmittedContract, compilerAbstract: CompilerAbstract): Promise<VerificationResponse> {
    const { jobId, ...response } = await submit(this.explorerVerifyRoute(), toVerifyInput(submittedContract, compilerAbstract))
    return { ...response, lookupUrl: this.getContractCodeUrl(submittedContract.address, submittedContract.chainId) }
  }

  async verifyProxy(submittedContract: SubmittedContract): Promise<VerificationResponse> {
    const { route, fetch } = this.explorerVerifyRoute()
    return link({ backend: 'etherscan-v2', clients: [etherscanV2ProxyLink()], route, fetch }, submittedContract)
  }

  async checkVerificationStatus(receiptId: string, chainId: string): Promise<VerificationResponse> {
    return poll(this.explorerVerifyRoute(), receiptId)
  }

  async lookup(contractAddress: string, chainId: string): Promise<LookupResponse> {
    const url = new URL(this.apiUrl + '/api')
    url.searchParams.append('chainid', chainId)
    url.searchParams.append('module', 'contract')
    url.searchParams.append('action', 'getsourcecode')
    url.searchParams.append('address', contractAddress)
    if (this.apiKey) {
      url.searchParams.append('apikey', this.apiKey)
    }

    const response = await fetch(url.href, { method: 'GET' })

    if (!response.ok) {
      const responseText = await response.text()
      console.error('Error on Etherscan API lookup at ' + this.apiUrl + '\nStatus: ' + response.status + '\nResponse: ' + responseText)
      throw new Error(responseText)
    }

    const lookupResponse: EtherscanGetSourceCodeResponse = await response.json()

    if (lookupResponse.result[0].ABI === 'Contract source code not verified' || !lookupResponse.result[0].SourceCode || (lookupResponse.result as unknown as string) === 'Contract source code not verified') {
      return { status: 'not verified' }
    }

    if (lookupResponse.status !== '1' || !lookupResponse.message.startsWith('OK')) {
      const errorResponse = lookupResponse as unknown as EtherscanRpcResponse
      console.error('Error on Etherscan API lookup at ' + this.apiUrl + '\nStatus: ' + errorResponse.status + '\nMessage: ' + errorResponse.message + '\nResult: ' + errorResponse.result)
      throw new Error(errorResponse.result)
    }

    const lookupUrl = this.getContractCodeUrl(contractAddress, chainId)
    const { sourceFiles, targetFilePath } = this.processReceivedFiles(lookupResponse.result[0], contractAddress, chainId)

    return { status: 'verified', lookupUrl, sourceFiles, targetFilePath }
  }

  getContractCodeUrl(address: string, chainId: string): string {
    const url = new URL(this.explorerUrl + `/address/${address}#code`)
    return url.href
  }

  processReceivedFiles(source: EtherscanSource, contractAddress: string, chainId: string): { sourceFiles: SourceFile[]; targetFilePath?: string } {
    const filePrefix = `/${this.LOOKUP_STORE_DIR}/${chainId}/${contractAddress}`

    // Covers the cases:
    // SourceFile: {[FileName]: [content]}
    // SourceFile: {{sources: {[FileName]: [content]}}}
    let parsedFiles: any
    try {
      parsedFiles = JSON.parse(source.SourceCode)
    } catch (e) {
      try {
        // Etherscan wraps the Object in one additional bracket
        parsedFiles = JSON.parse(source.SourceCode.substring(1, source.SourceCode.length - 1)).sources
      } catch (e) {}
    }
    if (parsedFiles) {
      const result: SourceFile[] = []
      let targetFilePath = ''
      for (const [fileName, fileObj] of Object.entries<any>(parsedFiles)) {
        if (fileName.startsWith('..')) {
          if (fileName.endsWith(`/${source.ContractName}.sol`)) targetFilePath = `${filePrefix}/targetFile.sol`
          else continue
        }
        const path = `${filePrefix}/${fileName}`

        result.push({ path, content: fileObj.content })

        if (path.endsWith(`/${source.ContractName}.sol`)) targetFilePath = path
      }
      return { sourceFiles: result, targetFilePath }
    }
    // Parsing to JSON failed, SourceCode is the code itself
    const targetFilePath = `${filePrefix}/${source.ContractName}.sol`
    const sourceFiles: SourceFile[] = [{ content: source.SourceCode, path: targetFilePath }]
    return { sourceFiles, targetFilePath }
  }
}
