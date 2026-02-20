import { SolcInput, SolcOutput } from "@openzeppelin/upgrades-core"
export interface FuncABI {
    name: string,
    type: string,
    inputs: { name: string, type: string }[],
    stateMutability: string,
    payable?: boolean,
    constant?: any
}

export type OverSizeLimit = {
    overSizeEip3860: boolean,
    overSizeEip170: boolean
}

export interface ContractData {
    name: string,
    contract: any,
    compiler: any,
    abi: FuncABI[],
    bytecodeObject: any,
    bytecodeLinkReferences: any,
    object: any,
    deployedBytecode: any,
    getConstructorInterface: () => FuncABI,
    getConstructorInputs: () => any,
    isOverSizeLimit: (args: string) => Promise<OverSizeLimit>,
    metadata: any,
    contractName?: string
}

export interface ContractAST {
    id: number,
    absolutePath: string,
    exportedSymbols: {
        [key: string]: number[]
    },
    license: string,
    nodeType: string,
    src: string,
    nodes: {
        id: number,
        literals: string[],
        nodeType: string,
        src: string,
        absolutePath?: string,
        file?: string,
        nameLocation?: string,
        scope?: number,
        srcUnit?: number,
        unitAlias?: string,
        symbolAliases?: any[],
        abstract?: boolean,
        baseContracts?: any[],
        contractDependencies?: any[],
        contractKind?: string,
        fullyImplemented?: boolean,
        linearizedBaseContracts?: number[],
        name?: string,
        usedErrors?: any[]
    }[]
}

export type ContractABI = {
    inputs: [];
    stateMutability: string;
    type: string;
    anonymous?: undefined;
    name?: string;
    outputs?: undefined;
} | {
    anonymous: boolean;
    inputs: {
        indexed: boolean;
        internalType: string;
        name: string;
        type: string;
    }[];
    name: string;
    type: string;
    stateMutability?: undefined;
    outputs?: undefined;
} | {
    inputs: {
        internalType: string;
        name: string;
        type: string;
    }[];
    name: string;
    outputs: {
        internalType: string;
        name: string;
        type: string;
    }[];
    stateMutability: string;
    type: string;
    anonymous?: undefined;
}

export type DeployMode = 'Deploy with Proxy' | 'Upgrade with Proxy'

export type DeployOption = {
  initializeInputs: string,
  inputs: {
    inputs: {
      internalType?: string,
      name: string,
      type: string
    }[],
    name: "initialize",
    outputs?: any[],
    stateMutability: string,
    type: string,
    payable?: boolean,
    constant?: any
  }
}
export interface DeployOptions {
  initializeOptions: DeployOption,
  options: { title: DeployMode, active: boolean }[]
}

export interface ContractSources {
    contracts: {
      [path: string]: {
        [contractName: string]: {
          abi: ContractABI[],
            devdoc: {
                kind: string
                methods: {
                    [key: string]: {
                        [key: string]: string
                    }
                };
                version: number
            }
            evm: any
            metadata: string
            storageLayout: {
                storage: {
                    astId: number
                    contract: string
                    label: string
                    offset: number
                    slot: string
                    type: string
                }[]
                types: {
                    [key: string]: {
                        base: string
                        encoding: string
                        label: string
                        numberOfBytes: string
                        members?: {
                            astId: number
                            contract: string
                            label: string
                            offset: number
                            slot: string
                            type: string
                        }[]
                    }
                }
            }
                userdoc: {
                    kind: string
                    methods: any
                    version: number
                }
            }
        }
    },
    error: {
      component: string,
      errorCode: string,
      formattedMessage: string,
      message: string,
      severity: string,
      sourceLocation: {
        end: number,
        file: string,
        start: number
      },
      type: string
    }[],
    sources: {
      [path: string]: {
        ast: ContractAST,
        id: number
      }
    }
  }

export interface NetworkDeploymentFile {
        id: string,
        network: string,
        deployments: {
            [proxyAddress: string]: {
                date: Date,
                contractName: string,
                fork: string,
                implementationAddress: string
            }
        }[]
  }

export interface SolcBuildFile {
    solcInput: SolcInput,
    solcOutput: SolcOutput
  }
