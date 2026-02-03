## Remix Analyzer
[![npm version](https://badge.fury.io/js/%40remix-project%2Fremix-analyzer.svg)](https://www.npmjs.com/package/@remix-project/remix-analyzer)
[![npm](https://img.shields.io/npm/dt/@remix-project/remix-analyzer.svg?label=Total%20Downloads)](https://www.npmjs.com/package/@remix-project/remix-analyzer)
[![npm](https://img.shields.io/npm/dw/@remix-project/remix-analyzer.svg)](https://www.npmjs.com/package/@remix-project/remix-analyzer)
[![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/remix-project-org/remix-project/tree/master/libs/remix-analyzer)
[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](https://github.com/remix-project-org/remix-project/issues)

`@remix-project/remix-analyzer` is a tool to perform static analysis on Solidity smart contracts to check security vulnerabilities and bad development practices. It works underneath Remix IDE "SOLIDITY STATIC ANALYSIS" plugin which is used to run analysis for a compiled contract according to selected modules.

### Installation
`@remix-project/remix-analyzer` is an NPM package and can be installed using NPM as:

`yarn add @remix-project/remix-analyzer`

### How to use

`@remix-project/remix-analyzer` exports below interface:

```
import { CompilationResult, AnalyzerModule, AnalysisReport } from 'types';
declare type ModuleObj = {
    name: string;
    mod: AnalyzerModule;
};
export default class staticAnalysisRunner {
    /**
     * Run analysis (Used by IDE)
     * @param compilationResult contract compilation result
     * @param toRun module indexes (compiled from remix IDE)
     * @param callback callback
     */
    run(compilationResult: CompilationResult, toRun: number[], callback: ((reports: AnalysisReport[]) => void)): void;
    
    /**
     * Run analysis passing list of modules to run
     * @param compilationResult contract compilation result
     * @param modules analysis module
     * @param callback callback
     */
    runWithModuleList(compilationResult: CompilationResult, modules: ModuleObj[], callback: ((reports: AnalysisReport[]) => void)): void;
    
    /**
     * Get list of all analysis modules
     */
    modules(): any[];
}
```
One can import the module and use the available methods to run analysis. Related type descriptions can be seen [here](https://github.com/remix-project-org/remix-project/blob/master/libs/remix-analyzer/src/types.ts).

Details of modules are explained in [official remix-ide documentation](https://remix-ide.readthedocs.io/en/latest/static_analysis.html).

### Contribute

Please feel free to open an issue or a pull request. 

In case you want to add some code, do have a look at our contribution guidelines [here](https://github.com/remix-project-org/remix-project/blob/master/CONTRIBUTING.md). Reach us on [Discord](https://discord.gg/qhpCQGWkmf) in case of any queries.

### License
MIT © 2018-21 Remix Team

