import { execution } from '@remix-project/remix-lib'
const { txFormat } = execution
import { Plugin } from '@remixproject/engine';
import { ContractData } from '../types/contract';

const profileDeployLibraries = {
  name: 'deploy-libraries',
  displayName: 'deploy-libraries',
  description: 'deploy-libraries',
  methods: ['isConcerned', 'execute']
};

const profileLinkLibraries = {
  name: 'link-libraries',
  displayName: 'link-libraries',
  description: 'link-libraries',
  methods: ['isConcerned', 'execute']
};

export class DeployLibraries extends Plugin {
  blockchain: any

  constructor(blockchain) {
    super(profileDeployLibraries)
    this.blockchain = blockchain
  }

  async isConcerned(contractData: ContractData): Promise<boolean> {
    return Object.keys(contractData.bytecodeLinkReferences).length > 0;
  }

  async execute(contractData: ContractData, contractMetadata: any, compiledContracts: any) {
    // we deploy libraries
    // and return the linked bytecode
    const bytecode = await txFormat.linkBytecode(contractData.object, compiledContracts, (data) => {
      // deploy library Callback
      // called for libraries deployment
      this.blockchain.runTx(data)
    })
    return bytecode
  }
}

export class LinkLibraries extends Plugin {
  blockchain: any
  constructor(blockchain) {
    super(profileLinkLibraries)
    this.blockchain = blockchain
  }

  async isConcerned(contractData: ContractData): Promise<boolean> {
    return Object.keys(contractData.bytecodeLinkReferences).length > 0;
  }

  async execute(contractData: ContractData, contractMetadata: any, compiledContracts: any) {
    // we just link libraries
    // and return the linked bytecode
    const bytecode = txFormat.linkLibraries(contractData, contractMetadata.linkReferences, contractData.bytecodeLinkReferences)
    return bytecode
  }
}
