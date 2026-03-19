import { CompilerAbstract } from '@remix-project/remix-solidity'
import { AbstractVerifier } from './AbstractVerifier'
import type { LookupResponse, SourceFile, SubmittedContract, VerificationResponse, VerificationStatus } from '../types'
import { getAddress } from 'ethers'

interface SourcifyVerificationRequest {
  stdJsonInput: any
  compilerVersion: string
  contractIdentifier: string
  creationTransactionHash?: string
}

type SourcifyVerificationStatus = 'exact_match' | 'match' | null

interface SourcifyVerificationResponse {
  verificationId: string
}

interface SourcifyCheckStatusResponse {
  isJobCompleted: boolean
  verificationId: string
  jobStartTime: string
  jobFinishTime: string
  contract: {
    match: SourcifyVerificationStatus
    creationMatch: SourcifyVerificationStatus
    runtimeMatch: SourcifyVerificationStatus
    chainId: string
    address: string
  }
  error?: SourcifyErrorResponse
}

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

  async verify(submittedContract: SubmittedContract, compilerAbstract: CompilerAbstract): Promise<VerificationResponse> {
    const metadata = JSON.parse(compilerAbstract.data.contracts[submittedContract.filePath][submittedContract.contractName].metadata)
    const compilerVersion = `v${metadata.compiler.version}`
    const contractIdentifier = `${submittedContract.filePath}:${submittedContract.contractName}`

    let stdJsonInput: any
    if (typeof compilerAbstract.input === 'string') {
      stdJsonInput = JSON.parse(compilerAbstract.input)
    } else {
      stdJsonInput = compilerAbstract.input
    }

    const body: SourcifyVerificationRequest = {
      stdJsonInput,
      compilerVersion,
      contractIdentifier,
    }

    const response = await fetch(`${this.apiUrl}/v2/verify/${submittedContract.chainId}/${submittedContract.address}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      if (response.status === 409) {
        return { status: 'already verified', receiptId: null, lookupUrl: this.getContractCodeUrl(submittedContract.address, submittedContract.chainId) }
      }

      const errorResponse: SourcifyErrorResponse = await response.json()
      console.error('Error on Sourcify verification at ' + this.apiUrl + '\nStatus: ' + response.status + '\nResponse: ' + JSON.stringify(errorResponse))
      throw new Error(errorResponse.message || 'Verification failed')
    }

    const verificationResponse: SourcifyVerificationResponse = await response.json()

    return {
      status: 'pending',
      receiptId: verificationResponse.verificationId,
      receiptLookupUrl: this.receiptLookupUrl(verificationResponse.verificationId),
      lookupUrl: this.getContractCodeUrl(submittedContract.address, submittedContract.chainId),
    }
  }

  receiptLookupUrl(receiptId: string): string {
    return `${this.receiptsUrl}/${receiptId}`
  }

  async checkVerificationStatus(receiptId: string, chainId: string): Promise<VerificationResponse> {
    const response = await fetch(`${this.apiUrl}/v2/verify/${receiptId}`, {
      method: 'GET',
    })

    if (!response.ok) {
      let errorResponse: SourcifyErrorResponse
      try {
        errorResponse = await response.json()
      } catch {
        //pass
      }
      if (errorResponse) {
        console.error('Error checking Sourcify verification status at ' + this.apiUrl + '\nStatus: ' + response.status + '\nResponse: ' + JSON.stringify(errorResponse))
        throw new Error(errorResponse.message || 'Status check failed')
      } else {
        const responseText = await response.text()
        console.error('Error checking Sourcify verification status at ' + this.apiUrl + '\nStatus: ' + response.status + '\nResponse: ' + responseText)
        throw new Error(responseText)
      }
    }

    const checkStatusResponse: SourcifyCheckStatusResponse = await response.json()

    if (!checkStatusResponse.isJobCompleted) {
      return { status: 'pending', receiptId }
    }

    if (checkStatusResponse.error) {
      if (checkStatusResponse.error.customCode === 'already_verified') {
        return { status: 'already verified', receiptId, message: checkStatusResponse.error.message }
      }
      const message = checkStatusResponse.error.message || 'Unknown error'
      return { status: 'failed', receiptId, message }
    }

    let status: VerificationStatus
    switch (checkStatusResponse.contract.match) {
    case 'exact_match':
      status = 'exactly verified'
      break
    case 'match':
      status = 'verified'
      break
    default:
      status = 'not verified'
      break
    }
    return {
      status,
      receiptId,
    }
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
