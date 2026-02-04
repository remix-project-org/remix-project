## Remix Lib
[![npm version](https://badge.fury.io/js/%40remix-project%2Fremix-lib.svg)](https://www.npmjs.com/package/@remix-project/remix-lib)
[![npm](https://img.shields.io/npm/dt/@remix-project/remix-lib.svg?label=Total%20Downloads)](https://www.npmjs.com/package/@remix-project/remix-lib)
[![npm](https://img.shields.io/npm/dw/@remix-project/remix-lib.svg)](https://www.npmjs.com/package/@remix-project/remix-lib)
[![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/remix-project-org/remix-project/tree/master/libs/remix-lib)
[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](https://github.com/remix-project-org/remix-project/issues)

`@remix-project/remix-lib` is a common library to various remix tools. It is used in `remix-astwalker`, `remix-analyzer`, `remix-debug`, `remix-simulator`, `remix-solidity`, `remix-tests` libraries and in Remix IDE codebase.

### Installation
`@remix-project/remix-lib` is an NPM package and can be installed using NPM as:

`yarn add @remix-project/remix-lib`

### How to use

`@remix-project/remix-lib` exports:

```
{
    EventManager: EventManager,
    helpers: {
      ui: uiHelper,
      compiler: compilerHelper
    },
    Storage: Storage,
    util: util,
    execution: {
      EventsDecoder: EventsDecoder,
      txExecution: txExecution,
      txHelper: txHelper,
      executionContext: new ExecutionContext(),
      txFormat: txFormat,
      txListener: TxListener,
      txRunner: TxRunner,
      typeConversion: typeConversion
    },
    UniversalDApp: UniversalDApp
}
```

### Contribute

Please feel free to open an issue or a pull request. 

In case you want to add some code, do have a look at our contribution guidelines [here](https://github.com/remix-project-org/remix-project/blob/master/CONTRIBUTING.md). Reach us on [Discord](https://discord.gg/qhpCQGWkmf) in case of any queries.

### License
MIT © 2018-21 Remix Team
