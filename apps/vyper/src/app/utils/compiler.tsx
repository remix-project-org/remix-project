import { ABIDescription } from '@remixproject/plugin-api'
import axios from 'axios'
import { remixClient } from './remix-client'
import _ from 'lodash'
import { VyperCompilationError , VyperCompilationOutput, VyperCompilationResult } from './types'

export interface Contract {
  name: string
  content: string
}

/** Check if the output is an error */
export const isCompilationError = (output: VyperCompilationOutput): output is VyperCompilationError => output.status === 'failed'

export function normalizeContractPath(contractPath: string): string[] {
  const paths = contractPath.split('/')
  const filename = paths[paths.length - 1].split('.')[0]
  let folders = ''
  for (let i = 0; i < paths.length - 1; i++) {
    if (i !== paths.length -1) {
      folders += `${paths[i]}/`
    }
  }
  const resultingPath = `${folders}${filename}`
  return [folders,resultingPath, filename]
}

const compileReturnType = (output, contract): VyperCompilationResult => {
  const t: any = toStandardOutput(contract, output)
  const temp = _.merge(t['contracts'][contract])
  const normal = normalizeContractPath(contract)[2]
  const abi = temp[normal]['abi']
  const evm = _.merge(temp[normal]['evm'])
  const methodIdentifiers = evm.methodIdentifiers
  // TODO: verify this is correct
  const version = output.version || '0.4.0'
  const optimized = output.optimize || true
  const evmVersion = ''

  const result: {
    contractName: any,
    abi: any,
    bytecode: any,
    runtimeBytecode: any,
    ir: '',
    methodIdentifiers: any,
    version?: '',
    evmVersion?: ''
    optimized?: boolean
  } = {
    contractName: normal,
    abi,
    bytecode: evm.bytecode,
    runtimeBytecode: evm.deployedBytecode,
    ir: '',
    methodIdentifiers,
    version,
    evmVersion,
    optimized
  }
  return result
}

/**
 * Compile the a contract
 * @param url The url of the compiler
 * @param contract The name and content of the contract
 */
export async function compile(url: string, contract: Contract): Promise<VyperCompilationOutput> {
  if (!contract.name) {
    throw new Error('Set your Vyper contract file.')
  }
  const extension = contract.name.split('.')[1]
  if (extension !== 'vy') {
    throw new Error('Use extension .vy for Vyper.')
  }

  let contractName = contract['name']
  const compilePackage = {
    manifest: 'ethpm/3',
    sources: {
      [contractName] : { content : contract.content }
    }
  }

  const compileEndpoint = `${url.endsWith('/') ? url + 'compile' : url + '/compile'}`
  // eslint-disable-next-line no-console
  console.info('[Vyper] Using compiler URL:', url, '→ POST', compileEndpoint)
  let response = await axios.post(compileEndpoint, compilePackage )
  if (response.status === 404) {
    throw new Error(`Vyper compiler not found at "${url}".`)
  }
  if (response.status === 400) {
    throw new Error(`Vyper compilation failed: ${response.statusText}`)
  }

  const compileCode = response.data
  contractName = null
  response = null
  let result: any

  const status = await (await axios.get(`${url.endsWith('/') ? url + 'status/' : url + '/status/'}`+ compileCode , {
    method: 'Get'
  })).data
  if (status === 'SUCCESS') {
    result = await(await axios.get(`${url.endsWith('/') ? url + 'artifacts/' : url + '/artifacts/'}` + compileCode , {
      method: 'Get'
    })).data

    return result
  } else if (status === 'FAILED') {
    const intermediate = await(await axios.get(`${url.endsWith('/') ? url + 'exceptions/' : url + '/exceptions/'}` + compileCode , {
      method: 'Get'
    })).data
    return intermediate
  }
  await new Promise((resolve) => setTimeout(() => resolve({}), 3000))
}

/**
 * Transform Vyper Output to Solidity-like Compiler output
 * @param name Name of the contract file
 * @param compilationResult Result returned by the compiler
 */
export function toStandardOutput(fileName: string, compilationResult: any): any {
  const contractName = normalizeContractPath(fileName)[2]
  const compiledAbi = compilationResult['contractTypes'][contractName].abi
  const deployedBytecode = compilationResult['contractTypes'][contractName].deploymentBytecode.bytecode.replace('0x', '')
  const bytecode = compilationResult['contractTypes'][contractName].runtimeBytecode.bytecode.replace('0x', '')
  const compiledAst = compilationResult['contractTypes'][contractName].ast
  const methodIds = compilationResult['contractTypes'][contractName].methodIdentifiers
  const methodIdentifiers = Object.entries(methodIds as Record<any,string>).map(([key, value]) => {
    return { [key]: value.replace('0x', '') }
  })
  return {
    sources: {
      [fileName]: {
        id: 1,
        ast: compiledAst
      }
    },
    contracts: {
      [fileName]: {
        // If the language used has no contract names, this field should equal to an empty string
        [contractName]: {
          // The Ethereum Contract ABI. If empty, it is represented as an empty array.
          // See https://github.com/ethereum/wiki/wiki/Ethereum-Contract-ABI
          abi: compiledAbi,
          contractName: contractName,
          evm: {
            bytecode: {
              linkReferences: {},
              object: deployedBytecode,
              opcodes: ''
            },
            deployedBytecode: {
              linkReferences: {},
              object: bytecode,
              opcodes: ''
            },
            methodIdentifiers: methodIdentifiers
          }
        }
      } as any
    }
  }
}

export async function compileContract(contract: string, compilerUrl: string, setOutput?: any, setLoadingSpinnerState?: React.Dispatch<React.SetStateAction<boolean>>, spinner?: boolean) {
  remixClient.eventEmitter.emit('resetCompilerState', {})
  spinner && spinner === true ? setLoadingSpinnerState && setLoadingSpinnerState(true) : null

  try {
    // await remixClient.discardHighlight()
    let _contract: any
    try {
      _contract = await remixClient.getContract()
    } catch (e: any) {
      const errorGettingContract: VyperCompilationError = {
        status: 'failed',
        message: e.message,
        error_type: 'fetch_contract'
      }

      remixClient.eventEmitter.emit('setOutput', { status: 'failed', errors: [errorGettingContract] } )
      return
    }
    remixClient.changeStatus({
      key: 'loading',
      type: 'info',
      title: 'Compiling'
    })
    // try {
    const output = await compile(compilerUrl, _contract)
    if (output && output[0] && output[0].status === 'failed') {
      remixClient.changeStatus({
        key: 'failed',
        type: 'error',
        title: 'Compilation failed...'
      })

      setLoadingSpinnerState && setLoadingSpinnerState(false)
      remixClient.eventEmitter.emit('setOutput', { status: 'failed', errors: output })
      return
    }

    // SUCCESS
    remixClient.changeStatus({
      key: 'succeed',
      type: 'success',
      title: 'success'
    })

    setLoadingSpinnerState && setLoadingSpinnerState(false)
    const data = toStandardOutput(_contract.name, output)
    remixClient.compilationFinish(_contract.name, _contract.content, data)
    const contractName = _contract['name']
    const compileResult = compileReturnType(output, contractName)
    if (setOutput === null || setOutput === undefined) {
      remixClient.eventEmitter.emit('setOutput', { status: 'success', contractName, compileResult })
    } else {
      remixClient.eventEmitter.emit('setOutput', { status: 'success', contractName, compileResult })
    }
  } catch (err: any) {
    remixClient.changeStatus({
      key: 'failed',
      type: 'error',
      title: `1 error occurred ${err.message}`
    })

    const errorGettingContract: VyperCompilationError = {
      status: 'failed',
      message: err.message,
      error_type: 'unknown_error'
    }

    setLoadingSpinnerState && setLoadingSpinnerState(false)
    remixClient.eventEmitter.emit('setOutput', { status: 'failed', errors: [errorGettingContract] })
  }
}

export type StandardOutput = {
  sources: {
    [fileName: string]: {
      id: number,
      ast: AST
    }
  },
  contracts: {
    [fileName: string]: {
      [contractName: string]: {
        abi: ABI,
        contractName: string,
        evm: {
          bytecode: BytecodeObject,
          deployedBytecode: BytecodeObject,
          methodIdentifiers: {
            [method: string]: string
          }
        }
      }
    }
  }
}

type AST = any // Replace with the actual AST type
type ABI = ABIDescription[] // Replace with the actual ABI type
type BytecodeObject = {
  linkReferences: Record<string, any>,
  object: string,
  opcodes: string
}

/*
export function createCompilationResultMessage(name: string, result: any) {
  if(result.status == 'success') {
    return {
      bytecode: this.state.compilationResult['bytecode'],
      bytecode_runtime: this.state.compilationResult['bytecode_runtime'],
      abi: JSON.stringify(this.state.compilationResult['abi'], null , "\t"),
      ir: this.state.compilationResult['ir']
    }
  } else if(result.status == 'failed' && result.column && result.line) {
    const header = `${name}:${result.line}:${result.column}`
    const body = this.state.compilationResult.message.split(/\r\n|\r|\n/)
    const arr = [header].concat(body).join("\n")
    return {
      bytecode: arr,
      bytecode_runtime: arr,
      abi: arr,
      ir: arr
    }
  } else if(result.status == 'failed') {
    const message = this.state.compilationResult.message
    return {
      bytecode: message,
      bytecode_runtime: message,
      abi: message,
      ir: message
    }
  }
  return {
    bytecode: "",
    bytecode_runtime: "",
    abi: "",
    ir: ""
  }
}
*/
