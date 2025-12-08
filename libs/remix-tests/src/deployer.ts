import async from 'async'
import { execution } from '@remix-project/remix-lib'
import { compilationInterface } from './types'
import { BaseContract, BrowserProvider, Contract, ContractFactory, ethers, TransactionReceipt, TransactionResponse } from 'ethers'

/**
 * @dev Deploy all contracts from compilation result
 * @param compileResult compilation result
 * @param provider BrowserProvider object
 * @param withDoubleGas If true, try deployment with gas double of estimation (used for Out-of-gas error only)
 * @param callback Callback
 */

export function deployAll (compileResult: compilationInterface, provider: BrowserProvider, testsAccounts, withDoubleGas: boolean, deployCb, callback) {
  const compiledObject = {}
  const contracts = {}
  const accounts: string[] = testsAccounts

  async.waterfall([
    function getContractData (next) {
      for (const contractFile in compileResult) {
        for (const contractName in compileResult[contractFile]) {
          const contract = compileResult[contractFile][contractName]

          const className = contractName
          const filename = contractFile

          const abi = contract.abi
          const code = contract.evm.bytecode.object

          compiledObject[className] = {}
          compiledObject[className].abi = abi
          compiledObject[className].code = code
          compiledObject[className].filename = filename
          compiledObject[className].className = className
          compiledObject[className].raw = contract

          if (contractFile.endsWith('_test.sol')) {
            compiledObject[className].isTest = true
          }
        }
      }
      next()
    },
    function determineContractsToDeploy (next) {
      const contractsToDeploy: string[] = ['Assert']
      const allContracts = Object.keys(compiledObject)

      for (const contractName of allContracts) {
        if (contractName === 'Assert') {
          continue
        }
        if (compiledObject[contractName].isTest) {
          contractsToDeploy.push(contractName)
        }
      }
      next(null, contractsToDeploy)
    },
    function deployContracts (contractsToDeploy: string[], next) {
      const deployRunner = (deployObject, { abi, signer }, contractName, filename, callback) => {
        deployObject.getDeployTransaction().then((tx: TransactionResponse) => {
          provider.estimateGas(tx).then((gasValue) => {
            const gasBase = Math.ceil(Number(gasValue) * 1.2)
            let gasLimit = withDoubleGas ? gasBase * 2 : gasBase
            if (gasLimit > 16777216) gasLimit = 16777216 // Set to EIP-7825 Transaction Gas Limit Cap, 2^24
            deployObject.deploy({
              from: accounts[0],
              gasLimit
            }).then(async function (deployContractObj: BaseContract) {
              const deployTx = deployContractObj.deploymentTransaction()
              const receipt: TransactionReceipt = await provider.getTransactionReceipt(deployTx.hash)
              const contractObject: Contract = new ethers.Contract(receipt.contractAddress, abi, signer)
              compiledObject[contractName].deployedAddress = receipt.contractAddress

              contracts[contractName] = contractObject
              contracts[contractName].filename = filename

              if (deployCb) await deployCb(filename, receipt.contractAddress)
              callback(null, { receipt: { contractAddress: receipt.contractAddress } }) // TODO this will only work with JavaScriptV VM
            })
          }).catch((err) => {
            const error = new Error(err)
            console.error('Error while estimating gas: ', error.message)
            callback(error.message)
          })
        }).catch((err) => {
          console.error('Error while getting deployment transaction: ', err)
          callback(err)
        })
      }

      async.eachOfLimit(contractsToDeploy, 1, function (contractName, index, nextEach) {
        const contract = compiledObject[contractName]
        const encodeDataFinalCallback = (error, contractDeployData) => {
          if (error) return nextEach(error)
          provider.getSigner().then((signer) => {
            const deployObject: ContractFactory = new ethers.ContractFactory(contract.abi, '0x' + contractDeployData.dataHex, signer)
            deployRunner(deployObject, { abi: contract.abi, signer }, contractName, contract.filename, (error) => { nextEach(error) })
          })
        }

        const encodeDataStepCallback = (msg) => { console.dir(msg) }

        const encodeDataDeployLibraryCallback = (libData, callback) => {
          const abi = compiledObject[libData.data.contractName].abi
          const code = compiledObject[libData.data.contractName].code
          provider.getSigner().then((signer) => {
            const deployObject: ContractFactory = new ethers.ContractFactory(abi, '0x' + code, signer)
            deployRunner(deployObject, { abi, signer }, libData.data.contractName, contract.filename, callback)
          })
        }

        const funAbi = null // no need to set the abi for encoding the constructor
        const params = '' // we suppose that the test contract does not have any param in the constructor
        execution.txFormat.encodeConstructorCallAndDeployLibraries(contractName, contract.raw, compileResult, params, funAbi, encodeDataFinalCallback, encodeDataStepCallback, encodeDataDeployLibraryCallback)
      }, function (err) {
        if (err) return next(err)
        next(null, contracts)
      })
    }
  ], callback)
}
