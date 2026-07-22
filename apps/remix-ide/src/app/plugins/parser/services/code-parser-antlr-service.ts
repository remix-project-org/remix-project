'use strict'

import { AstNode } from "@remix-project/remix-solidity"
import { CodeParser } from "../code-parser"
import { antlr } from '../types'
import { pathToFileURL } from 'url'
import { Registry } from '@remix-project/remix-lib'

const SolidityParser = (window as any).SolidityParser = (window as any).SolidityParser || []

interface BlockDefinition {
    end: number
    endColumn: number
    endLine: number
    name: string
    parent: string
    start: number
    startColumn: number
    startLine: number
    type: string
}

export default class CodeParserAntlrService {
  plugin: CodeParser
  worker: Worker
  parserStartTime: number = 0
  workerTimer: NodeJS.Timer
  parserThreshold: number = 10
  parserThresholdSampleAmount = 3
  cache: {
        [name: string]: {
            text: string,
            ast: antlr.ParseResult | null,
            duration?: number,
            parsingEnabled?: boolean,
            blocks?: BlockDefinition[],
            blockDurations?: number[]
        }
    } = {};
  constructor(plugin: CodeParser) {
    this.plugin = plugin
    this.createWorker()
  }

  createWorker() {
    this.worker = new Worker(new URL('./antlr-worker', import.meta.url))
    this.worker.postMessage({
      cmd: 'load',
      url: Registry.getInstance().get('platform').api.isDesktop() ? 'assets/js/parser/antlr.js' : document.location.protocol + '//' + document.location.host + '/assets/js/parser/antlr.js',
    })
    const self = this

    this.worker.addEventListener('message', function (ev) {
      switch (ev.data.cmd) {
      case 'parsed':
        if (ev.data.ast && self.parserStartTime === ev.data.timestamp) {
          self.cache[ev.data.file] = {
            ...self.cache[ev.data.file],
            text: ev.data.text,
            ast: ev.data.ast,
            duration: ev.data.duration,
            blocks: ev.data.blocks,
            blockDurations: self.cache[ev.data.file].blockDurations? [...self.cache[ev.data.file].blockDurations.slice(-self.parserThresholdSampleAmount), ev.data.blockDuration]: [ev.data.blockDuration]
          }
          self.setFileParsingState(ev.data.file)
        }
        break;
      }

    });
  }

  setFileParsingState(file: string) {
    if (this.cache[file]) {
      if (this.cache[file].blockDurations && this.cache[file].blockDurations.length > this.parserThresholdSampleAmount) {
        // calculate average of durations to determine if the parsing should be disabled
        const values = [...this.cache[file].blockDurations]
        const average = values.reduce((a, b) => a + b, 0) / values.length
        if (average > this.parserThreshold) {
          this.cache[file].parsingEnabled = false
        } else {
          this.cache[file].parsingEnabled = true
        }
      }
    }
  }

  enableWorker() {
    if (!this.workerTimer) {
      this.workerTimer = setInterval(() => {
        this.setCurrentFileAST()
      }, 5000)
    }
  }

  disableWorker() {
    clearInterval(this.workerTimer as any)
  }

  async parseWithWorker(text: string, file: string) {
    this.parserStartTime = Date.now()
    this.worker.postMessage({
      cmd: 'parse',
      text,
      timestamp: this.parserStartTime,
      file,
      parsingEnabled: (this.cache[file] && this.cache[file].parsingEnabled) || true
    });

  }

  async parseSolidity(text: string) {
    const ast: antlr.ParseResult = (SolidityParser as any).parse(text, { loc: true, range: true, tolerant: true })
    return ast
  }

  /**
     * Tries to parse the current file or the given text and returns the AST
     * If the parsing fails it returns the last successful AST for this file
     * @param text
     * @returns
     */
  async setCurrentFileAST(text: string | null = null) {
    try {
      this.plugin.currentFile = await this.plugin.call('fileManager', 'file')
      if (this.plugin.currentFile && this.plugin.currentFile.endsWith('.sol')) {
        const fileContent = text || await this.plugin.call('fileManager', 'readFile', this.plugin.currentFile)
        if (!this.cache[this.plugin.currentFile]) {
          this.cache[this.plugin.currentFile] = {
            text: '',
            ast: null,
            parsingEnabled: true,
            blockDurations: []
          }
        }
        if (this.cache[this.plugin.currentFile] && this.cache[this.plugin.currentFile].text !== fileContent) {
          try {
            await this.parseWithWorker(fileContent, this.plugin.currentFile)
          } catch (e) {
            // do nothing
          }
        }
      }
    } catch (e) {
      // do nothing
    }
  }

  /**
    * Lists the AST nodes from the current file parser
    * These nodes need to be changed to match the node types returned by the compiler
    * @returns
    */
  async listAstNodes() {
    this.plugin.currentFile = await this.plugin.call('fileManager', 'file')
    if (!this.cache[this.plugin.currentFile]) return
    const nodes: AstNode[] = [];
    (SolidityParser as any).visit(this.cache[this.plugin.currentFile].ast, {
      StateVariableDeclaration: (node: antlr.StateVariableDeclaration) => {
        if (node.variables) {
          for (const variable of node.variables) {
            nodes.push({ ...variable, nodeType: 'VariableDeclaration', id: null, src: null })
          }
        }
      },
      VariableDeclaration: (node: antlr.VariableDeclaration) => {
        nodes.push({ ...node, nodeType: node.type, id: null, src: null })
      },
      UserDefinedTypeName: (node: antlr.UserDefinedTypeName) => {
        nodes.push({ ...node, nodeType: node.type, id: null, src: null })
      },
      FunctionDefinition: (node: antlr.FunctionDefinition) => {
        nodes.push({ ...node, nodeType: node.type, id: null, src: null })
      },
      ContractDefinition: (node: antlr.ContractDefinition) => {
        nodes.push({ ...node, nodeType: node.type, id: null, src: null })
      },
      MemberAccess: function (node: antlr.MemberAccess) {
        nodes.push({ ...node, nodeType: node.type, id: null, src: null })
      },
      Identifier: function (node: antlr.Identifier) {
        nodes.push({ ...node, nodeType: node.type, id: null, src: null })
      },
      EventDefinition: function (node: antlr.EventDefinition) {
        nodes.push({ ...node, nodeType: node.type, id: null, src: null })
      },
      ModifierDefinition: function (node: antlr.ModifierDefinition) {
        nodes.push({ ...node, nodeType: node.type, id: null, src: null })
      },
      InvalidNode: function (node: antlr.InvalidNode) {
        nodes.push({ ...node, nodeType: node.type, id: null, src: null })
      },
      EnumDefinition: function (node: antlr.EnumDefinition) {
        nodes.push({ ...node, nodeType: node.type, id: null, src: null })
      },
      StructDefinition: function (node: antlr.StructDefinition) {
        nodes.push({ ...node, nodeType: node.type, id: null, src: null })
      }

    })
    return nodes
  }

  /**
     *
     * @param ast
     * @returns
     */
  async getLastNodeInLine(ast: string) {
    let lastNode: any
    const checkLastNode = (node: antlr.MemberAccess | antlr.Identifier) => {
      if (lastNode && lastNode.range && lastNode.range[1]) {
        if (node.range[1] > lastNode.range[1]) {
          lastNode = node
        }
      } else {
        lastNode = node
      }
    }

    (SolidityParser as any).visit(ast, {
      MemberAccess: function (node: antlr.MemberAccess) {
        checkLastNode(node)
      },
      Identifier: function (node: antlr.Identifier) {
        checkLastNode(node)
      }
    })
    if (lastNode && lastNode.expression) {
      return lastNode.expression
    }
    return lastNode
  }
  /*
    * get the code blocks of the current file
    */
  async getCurrentFileBlocks(text: string | null = null) {
    this.plugin.currentFile = await this.plugin.call('fileManager', 'file')
    if (this.cache[this.plugin.currentFile]) {
      if (!this.cache[this.plugin.currentFile].parsingEnabled) {
        return
      }
    }
    if (this.plugin.currentFile && this.plugin.currentFile.endsWith('.sol')) {
      const fileContent = text || await this.plugin.call('fileManager', 'readFile', this.plugin.currentFile)
      try {
        const startTime = Date.now()
        const blocks = (SolidityParser as any).parseBlock(fileContent, { loc: true, range: true, tolerant: true })
        if (this.cache[this.plugin.currentFile] && this.cache[this.plugin.currentFile].blockDurations){
          this.cache[this.plugin.currentFile].blockDurations = [...this.cache[this.plugin.currentFile].blockDurations.slice(-this.parserThresholdSampleAmount), Date.now() - startTime]
          this.setFileParsingState(this.plugin.currentFile)
        }
        if (blocks) this.cache[this.plugin.currentFile].blocks = blocks
        return blocks
      } catch (e) {
        // do nothing
      }
    }
  }

  /**
    * Returns the block surrounding the given position
    * For example if the position is in the middle of a function, it will return the function
    * @param {position} position
    * @param {string} text // optional
    * @return {any}
    * */
  async getANTLRBlockAtPosition(position: any, text: string = null) {
    const blocks: any[] = await this.getCurrentFileBlocks(text)

    const walkAst = (blocks) => {
      let nodeFound = null
      for (const object of blocks) {
        if (object.start <= position) {
          nodeFound = object
          break
        }
      }
      return nodeFound
    }
    if (!blocks) return
    blocks.reverse()
    const block = walkAst(blocks)
    return block
  }
}
