import { CompilerAbstract } from '@remix-project/remix-solidity'
import { AbstractVerifier } from './AbstractVerifier'
import type { LookupResponse, SourceFile, SubmittedContract, VerificationResponse, VerificationStatus } from '../types'
import { sourcify } from 'explorer-verify/clients/sourcify'
import { type ExplorerVerifyRoute, poll, submit, toVerifyInput } from './explorerVerify'

type SourcifyVerificationStatus = 'exact_match' | 'match' | null

interface SourcifyErrorResponse {
  customCode: string
  errorId: string
  message: string
}

type Sources = Record<string, { content: string }>

interface SourcifyLookupResponse {
  match: SourcifyVerificationStatus
  creationMatch: SourcifyVerificationStatus
  runtimeMatch: SourcifyVerificationStatus
  chainId: string
  address: string
  verifiedAt: string
  matchId: string
  sources: Sources
  compilation: {
    fullyQualifiedName: string
  }
}

export class SourcifyVerifier extends AbstractVerifier {
  LOOKUP_STORE_DIR = 'sourcify-verified'

  constructor(apiUrl: string, explorerUrl: string, protected receiptsUrl?: string) {
    super(apiUrl, explorerUrl)
  }

  /** The explorer-verify route for this verifier's settings. */
  protected explorerVerifyRoute(): ExplorerVerifyRoute {
    return { backend: 'sourcify', clients: [sourcify()], route: { backend: 'sourcify', apiUrl: this.apiUrl } }
  }

  async verify(submittedContract: SubmittedContract, compilerAbstract: CompilerAbstract): Promise<VerificationResponse> {
    const { jobId, ...response } = await submit(this.explorerVerifyRoute(), toVerifyInput(submittedContract, compilerAbstract))
    const lookupUrl = this.getContractCodeUrl(submittedContract.address, submittedContract.chainId)
    return jobId ? { ...response, lookupUrl, receiptLookupUrl: this.receiptLookupUrl(jobId) } : { ...response, lookupUrl }
  }

  receiptLookupUrl(receiptId: string): string {
    return `${this.receiptsUrl}/${receiptId}`
  }

  async checkVerificationStatus(receiptId: string, chainId: string): Promise<VerificationResponse> {
    return poll(this.explorerVerifyRoute(), receiptId)
  }

  async lookup(contractAddress: string, chainId: string): Promise<LookupResponse> {
    const url = new URL(this.apiUrl + `/v2/contract/${chainId}/${contractAddress}`)
    url.searchParams.set('fields', 'sources,compilation.fullyQualifiedName')

    const response = await fetch(url.href, { method: 'GET' })

    if (!response.ok) {
      if (response.status === 404) {
        return { status: 'not verified' }
      }

      const errorResponse: SourcifyErrorResponse = await response.json()
      console.error('Error on Sourcify lookup at ' + this.apiUrl + '\nStatus: ' + response.status + '\nResponse: ' + JSON.stringify(errorResponse))
      throw new Error(errorResponse.message || 'Lookup failed')
    }

    const lookupResponse: SourcifyLookupResponse = await response.json()

    let status: VerificationStatus = 'unknown'
    let lookupUrl: string | undefined = undefined
    if (lookupResponse.match === 'exact_match') {
      status = 'exactly verified'
      lookupUrl = this.getContractCodeUrl(contractAddress, chainId)
    } else if (lookupResponse.match === 'match') {
      status = 'verified'
      lookupUrl = this.getContractCodeUrl(contractAddress, chainId)
    }

    let sourceFiles: SourceFile[] = []
    let targetFilePath: string | undefined = undefined

    if (lookupResponse.sources && Object.keys(lookupResponse.sources).length > 0) {
      const processed = this.processReceivedFiles(lookupResponse.sources, lookupResponse.compilation.fullyQualifiedName, contractAddress, chainId)
      sourceFiles = processed.sourceFiles
      targetFilePath = processed.targetFilePath
    }

    return { status, lookupUrl, sourceFiles, targetFilePath }
  }

  getContractCodeUrl(address: string, chainId: string): string {
    const url = new URL(this.explorerUrl + `/${chainId}/${address}/`)
    return url.href
  }

  processReceivedFiles(sources: Sources, fullyQualifiedName: string, contractAddress: string, chainId: string): { sourceFiles: SourceFile[]; targetFilePath?: string } {
    const result: SourceFile[] = []
    let targetFilePath: string
    const filePrefix = `/${this.LOOKUP_STORE_DIR}/${chainId}/${contractAddress}`

    // Extract contract path from fully qualified name (path can include colons)
    const splitIdentifier = fullyQualifiedName.split(':')
    const contractPath = splitIdentifier.slice(0, -1).join(':')
    for (const [filePath, fileData] of Object.entries(sources)) {
      if (filePath.startsWith('..')) {
        if (filePath === contractPath) targetFilePath = `${filePrefix}/sources/targetFile.sol`
        else continue
      }
      const path = `${filePrefix}/sources/${filePath}`
      result.push({ path, content: fileData.content })
      if (filePath === contractPath) targetFilePath = path
    }

    return { sourceFiles: result, targetFilePath }
  }
}
