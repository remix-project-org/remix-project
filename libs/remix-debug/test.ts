// TODO: this file should be removed at some point
const CmdLine = require('./src/cmdline/index')
// var compilation = require('./compilation.json')

const solc = require('solc')
const fs = require('fs')

const filename = 'test/sol/simple_storage.sol'
const shortFilename = 'simple_storage.sol'

const inputJson = {
  language: 'Solidity',
  sources: {},
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    outputSelection: {
      '*': {
        '': ['ast'],
        '*': ['abi', 'metadata', 'devdoc', 'userdoc', 'evm.legacyAssembly', 'evm.bytecode', 'evm.deployedBytecode', 'evm.methodIdentifiers', 'evm.gasEstimates']
      }
    }
  }
}

inputJson.sources[shortFilename] = {
  content: fs.readFileSync(filename).toString()
}

console.dir(inputJson)

console.log('compiling...')

const compilationData = JSON.parse(solc.compileStandardWrapper(JSON.stringify(inputJson)))
console.dir(Object.keys(compilationData))
const compilation = {}
compilation['data'] = compilationData
compilation['source'] = { sources: inputJson.sources }
console.dir(compilation)
console.dir(compilation['data'].errors)

const cmdLine = new CmdLine()
cmdLine.connect('http', 'http://localhost:8545')
cmdLine.loadCompilationResult(compilation)
cmdLine.initDebugger()
const tx = '0xf510c4f0b1d9ee262d7b9e9e87b4262f275fe029c2c733feef7dfa1e2b1e32aa'

//  deployContract((err, tx) => {
cmdLine.startDebug(tx, shortFilename)

cmdLine.events.on('source', () => {
  cmdLine.getSource().forEach(console.dir)
})
// })
// })

const repl = require('repl')

repl.start({
  prompt: '> ',
  eval: (cmd, context, filename, cb) => {
    const command = cmd.trim()
    if (command === 'next' || command === 'n') {
      cmdLine.stepOverForward(true)
    }
    if (command === 'previous' || command === 'p' || command === 'prev') {
      cmdLine.stepOverBack(true)
    }
    if (command === 'step' || command === 's') {
      cmdLine.stepIntoForward(true)
    }
    if (command === 'stepback' || command === 'sb') {
      cmdLine.stepIntoBack(true)
    }
    if (command === 'exit' || command === 'quit') {
      process.exit(0)
    }
    if (command === 'var local' || command === 'v l' || command === 'vl') {
      cmdLine.displayLocals()
    }
    if (command === 'var global' || command === 'v g' || command === 'vg') {
      cmdLine.displayGlobals()
    }
    if (command.split(' ')[0] === 'jump') {
      const stepIndex = parseInt(command.split(' ')[1], 10)
      cmdLine.jumpTo(stepIndex)
    }
    cb(null, '')
  }
})

module.exports = cmdLine
