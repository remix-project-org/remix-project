## Remix-Solidity
[![npm version](https://badge.fury.io/js/%40remix-project%2Fremix-solidity.svg)](https://www.npmjs.com/package/@remix-project/remix-solidity)
[![npm](https://img.shields.io/npm/dt/@remix-project/remix-solidity.svg?label=Total%20Downloads)](https://www.npmjs.com/package/@remix-project/remix-solidity)
[![npm](https://img.shields.io/npm/dw/@remix-project/remix-solidity.svg)](https://www.npmjs.com/package/@remix-project/remix-solidity)
[![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/remix-project-org/remix-project/tree/master/libs/remix-solidity)
[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](https://github.com/remix-project-org/remix-project/issues)


`@remix-project/remix-solidity` is a tool to load and run solidity compiler. It works underneath Remix IDE  "Solidity Compiler" plugin which is used to load different versions of compiler and compile the smart contracts. 

### Installation

`@remix-project/remix-solidity` is an NPM package and can be installed using NPM as:

`yarn add @remix-project/remix-solidity`

### How to use

`@remix-project/remix-solidity` exports:
```
    {
        Compiler: Compiler,
        CompilerInput: CompilerInput
    }
```
`CompilerInput` can be used to form the [compiler input](https://github.com/remix-project-org/remix-project/blob/master/libs/remix-solidity/src/compiler/types.ts#L1) by passing the [options](https://github.com/remix-project-org/remix-project/blob/master/libs/remix-solidity/src/compiler/types.ts#L144)

`Compiler` is a class containing various methods to perform compiler related actions. Have a look at `Compiler` interface:

```
class Compiler {
    handleImportCall: (fileurl: string, cb: Function) => void;
    event: EventManager;
    state: CompilerState;
    constructor(handleImportCall: (fileurl: string, cb: Function) => void);
    /**
     * @dev Setter function for CompilerState's properties (used by IDE)
     * @param key key
     * @param value value of key in CompilerState
     */
    set<K extends keyof CompilerState>(key: K, value: CompilerState[K]): void;
    /**
     * @dev Internal function to compile the contract after gathering imports
     * @param files source file
     * @param missingInputs missing import file path list
     */
    internalCompile(files: Source, missingInputs?: string[]): void;
    /**
     * @dev Compile source files (used by IDE)
     * @param files source files
     * @param target target file name (This is passed as it is to IDE)
     */
    compile(files: Source, target: string): void;
    /**
     * @dev Called when compiler is loaded, set current compiler version
     * @param version compiler version
     */
    onCompilerLoaded(version: string): void;
    /**
     * @dev Called when compiler is loaded internally (without worker)
     */
    onInternalCompilerLoaded(): void;
    /**
     * @dev Called when compilation is finished
     * @param data compilation result data
     * @param missingInputs missing imports
     * @param source Source
     */
    onCompilationFinished(data: CompilationResult, missingInputs?: string[], source?: SourceWithTarget): void;
    /**
     * @dev Load compiler using given URL (used by IDE)
     * @param usingWorker if true, load compiler using worker
     * @param url URL to load compiler from
     */
    loadVersion(usingWorker: boolean, url: string): void;
    /**
     * @dev Load compiler using 'script' element (without worker)
     * @param url URL to load compiler from
     */
    loadInternal(url: string): void;
    /**
     * @dev Load compiler using web worker
     * @param url URL to load compiler from
     */
    loadWorker(url: string): void;
    /**
     * @dev Gather imports for compilation
     * @param files file sources
     * @param importHints import file list
     * @param cb callback
     */
    gatherImports(files: Source, importHints?: string[], cb?: gatherImportsCallbackInterface): void;
    /**
     * @dev Truncate version string
     * @param version version
     */
    truncateVersion(version: string): string;
    /**
     * @dev Update ABI according to current compiler version
     * @param data Compilation result
     */
    updateInterface(data: CompilationResult): CompilationResult;
    /**
     * @dev Get contract obj of the given contract name from last compilation result.
     * @param name contract name
     */
    getContract(name: string): Record<string, any> | null;
    /**
     * @dev Call the given callback for all the contracts from last compilation result
     * @param cb callback
     */
    visitContracts(cb: visitContractsCallbackInterface): void | null;
    /**
     * @dev Get the compiled contracts data from last compilation result
     */
    getContracts(): CompilationResult['contracts'] | null;
    /**
     * @dev Get sources from last compilation result
     */
    getSources(): Source | null | undefined;
    /**
     * @dev Get sources of passed file name from last compilation result
     * @param fileName file name
     */
    getSource(fileName: string): Source['filename'] | null;
    /**
     * @dev Get source name at passed index from last compilation result
     * @param index    - index of the source
     */
    getSourceName(index: number): string | null;
}
```

### Contribute

Please feel free to open an issue or a pull request. 

In case you want to add some code, do have a look at our contribution guidelines [here](https://github.com/remix-project-org/remix-project/blob/master/CONTRIBUTING.md). Reach us on [Discord](https://discord.gg/qhpCQGWkmf) in case of any queries.   

### License
MIT © 2018-21 Remix Team
