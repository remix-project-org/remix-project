'use strict'

import { CompilationResult, visitContractsCallbackParam, visitContractsCallbackInterface } from './types'

export default {

  /**
   * @dev Get contract obj of given contract name from last compilation result.
   * @param name contract name
   * @param contracts 'contracts' object from last compilation result
   */

  getContract: (contractName: string, contracts: CompilationResult['contracts']) : any | null => {
    for (const file in contracts) {
      if (contracts[file][contractName]) {
        return { object: contracts[file][contractName], file: file }
      }
    }
    return null
  },

  /**
   * @dev call the given callback for all contracts from last compilation result, stop visiting when cb return true
   * @param contracts - 'contracts' object from last compilation result
   * @param cb    - callback
   */

  visitContracts: (contracts: CompilationResult['contracts'], cb: visitContractsCallbackInterface) : void => {
    for (const file in contracts) {
      for (const name in contracts[file]) {
        const param: visitContractsCallbackParam = {
          name: name,
          object: contracts[file][name],
          file: file
        }
        if (cb(param)) return
      }
    }
  },

  // ^ e.g:
  // browser/gm.sol: Warning: Source file does not specify required compiler version! Consider adding "pragma solidity ^0.6.12
  // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v3.2.0/contracts/introspection/IERC1820Registry.sol: ParserError: Source file requires different compiler version (current compiler is 0.7.4+commit.3f05b770.Emscripten.clang) - note that nightly builds are considered to be strictly less than the released version
  getPositionDetails: (msg: string) => {
    const result = { } as Record<string, number | string>

    // To handle some compiler warning without location like SPDX license warning etc
    if (!msg.includes(':')) return { errLine: -1, errCol: -1, errFile: '' }

    if (msg.includes('-->')) msg = msg.split('-->')[1].trim()

    // extract line / column
    let pos = msg.match(/^(.*?):([0-9]*?):([0-9]*?)?/)
    result.errLine = pos ? parseInt(pos[2]) - 1 : -1
    result.errCol = pos ? parseInt(pos[3]) : -1

    // extract file
    pos = msg.match(/^(https:.*?|http:.*?|.*?):/)
    result.errFile = pos ? pos[1] : msg
    return result
  }
}
