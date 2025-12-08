import * as packageJson from '../../../../../package.json'
import { BasicVMProvider } from './vm-provider'

export class SepoliaForkVMProvider extends BasicVMProvider {
  nodeUrl: string
  blockNumber: number | 'latest'
  constructor(blockchain) {
    super(
      {
        name: 'vm-sepolia-fork',
        displayName: 'Sepolia fork - Remix VM (Osaka)',
        kind: 'provider',
        description: 'Remix VM (Osaka)',
        methods: ['sendAsync', 'init'],
        version: packageJson.version
      },
      blockchain
    )
    this.blockchain = blockchain
    this.fork = 'osaka'
    this.nodeUrl = 'https://go.getblock.io/7fbe62b139884d2c9c1616ca0de8b5b2'
    this.blockNumber = 'latest'
  }

  async init() {
    return {
      fork: this.fork,
      nodeUrl: this.nodeUrl,
      blockNumber: this.blockNumber
    }
  }
}
