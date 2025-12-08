import * as packageJson from '../../../../../package.json'
import { BasicVMProvider } from './vm-provider'

export class MainnetForkVMProvider extends BasicVMProvider {
  nodeUrl: string
  blockNumber: number | 'latest'
  constructor(blockchain) {
    super(
      {
        name: 'vm-mainnet-fork',
        displayName: 'Mainnet fork - Remix VM (Osaka)',
        kind: 'provider',
        description: 'Remix VM (Osaka)',
        methods: ['sendAsync', 'init'],
        version: packageJson.version
      },
      blockchain
    )
    this.blockchain = blockchain
    this.fork = 'osaka'
    this.nodeUrl = 'https://go.getblock.us/1552e4e35bcf4efe8a78897cba5557f9'
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
