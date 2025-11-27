import { Engine } from '@remixproject/engine'
import { EventEmitter } from 'events'

export class RemixEngine extends Engine {
  constructor () {
    super()
    this.event = new EventEmitter()
  }

  setPluginOption ({ name, kind }) {
    if (kind === 'provider') return { queueTimeout: 60000 * 2 }
    if (name === 'LearnEth') return { queueTimeout: 60000 }
    if (name === 'dgitApi') return { queueTimeout: 60000 * 4 }
    if (name === 'slither') return { queueTimeout: 60000 * 4 } // Requires when a solc version is installed
    if (name === 'hardhat') return { queueTimeout: 60000 * 4 }
    if (name === 'truffle') return { queueTimeout: 60000 * 4 }
    if (name === 'localPlugin') return { queueTimeout: 60000 * 4 }
    if (name === 'notification') return { queueTimeout: 60000 * 10 }
    if (name === 'sourcify') return { queueTimeout: 60000 * 4 }
    if (name === 'fetchAndCompile') return { queueTimeout: 60000 * 4 }
    if (name === 'walletconnect') return { queueTimeout: 60000 * 4 }
    if (name === 'udapp') return { queueTimeout: 60000 * 4 }
    if (name === 'fs') return { queueTimeout: 60000 * 4 }
    if (name === 'isogit') return { queueTimeout: 60000 * 4 }
    if (name === 'circuit-compiler') return { queueTimeout: 60000 * 4 }
    if (name === 'compilerloader') return { queueTimeout: 60000 * 4 }
    if (name === 'filePanel') return { queueTimeout: 60000 * 20 }
    if (name === 'fileManager') return { queueTimeout: 60000 * 20 }
    if (name === 'remixAID') return { queueTimeout: 60000 * 20 }
    if (name === 'remixAI') return { queueTimeout: 60000 * 20 }
    if (name === 'cookbookdev') return { queueTimeout: 60000 * 3 }
    if (name === 'contentImport') return { queueTimeout: 60000 * 3 }
    if (name === 'circom') return { queueTimeout: 60000 * 4 }
    if (name === 'noir-compiler') return { queueTimeout: 60000 * 4 }
    return { queueTimeout: 60000 * 4 }
  }

  onRegistration (plugin) {
    this.event.emit('onRegistration', plugin)
  }
}
