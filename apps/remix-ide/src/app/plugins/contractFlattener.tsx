/* eslint-disable prefer-const */
import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import { PluginViewWrapper } from '@remix-ui/helper'
import { trackMatomoEvent } from '@remix-api'
import type { CompilerInput, CompilationSource } from '@remix-project/remix-solidity'
import { Plugin } from '@remixproject/engine'
import { customAction } from '@remixproject/plugin-api'
import { concatSourceFiles, getDependencyGraph, normalizeContractPath } from '@remix-ui/solidity-compiler'

const profile = {
  name: 'contractflattener',
  displayName: 'Contract Flattener',
  description: 'Flatten solidity contracts',
  methods: ['flattenAContract', 'flattenContract'],
  events: [],
  maintainedBy: 'Remix'
}

export class ContractFlattener extends Plugin {
  triggerFlattenContract: boolean = false
  constructor() {
    super(profile)
  }

  onActivation(): void {
    this.on('solidity', 'compilationFinished', async (file, source, languageVersion, data, input, version) => {
      if (data.sources && Object.keys(data.sources).length > 1) {
        if (this.triggerFlattenContract) {
          this.triggerFlattenContract = false
          await this.flattenContract(source, file, data, JSON.parse(input))
        }
      }
    })
    trackMatomoEvent(this, { category: 'plugin', action: 'activated', name: 'contractFlattener', isClick: false })
  }

  onDeactivation(): void {
    this.off('solidity', 'compilationFinished')
  }

  async flattenAContract(action: customAction) {
    this.triggerFlattenContract = true
    await this.call('solidity', 'compile', action.path[0])
  }

  /**
   * Takes currently compiled contract that has a bunch of imports at the top
   * and flattens them ready, ideally for UML creation or for other purposes.
   * Takes the flattened result, writes it to a file and returns the result.
   * @returns {Promise<string>}
   */
  async flattenContract(source: {sources: any; target: string}, filePath: string, data: {contracts: any; sources: any}, input: CompilerInput): Promise<string> {
    const appendage = '_flattened.sol'
    const normalized = normalizeContractPath(filePath)
    const path = `${normalized[normalized.length - 2]}${appendage}`
    const ast: { [contractName: string]: CompilationSource } = data.sources
    let dependencyGraph
    let sorted
    let result
    let sources
    let order: string[] = []
    try {
      dependencyGraph = getDependencyGraph(ast, filePath, input.settings.remappings, order)
      sorted = dependencyGraph.isEmpty() ? [filePath] : dependencyGraph.sort().reverse()
      sources = source.sources
      result = concatSourceFiles(sorted, sources, order)
    } catch (err) {
      console.warn(err)
    }
    await this.call('fileManager', 'writeFile', path, result)
    trackMatomoEvent(this, { category: 'plugin', action: 'contractFlattener', name: 'flattenAContract', isClick: false })
    // clean up memory references & return result
    sorted = null
    sources = null
    dependencyGraph = null
    return result
  }
}
