## Remix Url Resolver
[![npm version](https://badge.fury.io/js/%40remix-project%2Fremix-url-resolver.svg)](https://www.npmjs.com/package/@remix-project/remix-url-resolver)
[![npm](https://img.shields.io/npm/dt/@remix-project/remix-url-resolver.svg?label=Total%20Downloads)](https://www.npmjs.com/package/@remix-project/remix-url-resolver)
[![npm](https://img.shields.io/npm/dw/@remix-project/remix-url-resolver.svg)](https://www.npmjs.com/package/@remix-project/remix-url-resolver)
[![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/remix-project-org/remix-project/tree/master/libs/remix-url-resolver)
[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](https://github.com/remix-project-org/remix-project/issues)


`@remix-project/remix-url-resolver` is a tool to handle import from different sources and resolve the content. It is used in Remix IDE to handle imports from `GitHub`, `Swarm`, `IPFS` and other URLs. 

### Installation

`@remix-project/remix-url-resolver` is an NPM package and can be installed using NPM as:

`yarn add @remix-project/remix-url-resolver`

### How to use

`@remix-project/remix-url-resolver` exports:

```

export declare class RemixURLResolver {
    private previouslyHandled;
    gistAccessToken: string;
    constructor(gistToken?: string);
    /**
    * Handle an import statement based on github
    * @param root The root of the github import statement
    * @param filePath path of the file in github
    */
    handleGithubCall(root: string, filePath: string): Promise<HandlerResponse>;
    /**
    * Handle an import statement based on http
    * @param url The url of the import statement
    * @param cleanUrl
    */
    handleHttp(url: string, cleanUrl: string): Promise<HandlerResponse>;
    /**
    * Handle an import statement based on https
    * @param url The url of the import statement
    * @param cleanUrl
    */
    handleHttps(url: string, cleanUrl: string): Promise<HandlerResponse>;
    handleSwarm(url: string, cleanUrl: string): Promise<HandlerResponse>;
    /**
    * Handle an import statement based on IPFS
    * @param url The url of the IPFS import statement
    */
    handleIPFS(url: string): Promise<HandlerResponse>;
    getHandlers(): Handler[];
    resolve(filePath: string, customHandlers?: Handler[]): Promise<Imported>;
}

```

**Usage**

`resolve(url, customHandlers)` function should be called from within `handleImportCb` function of `solc.compile(input, handleImportCb)`.

```ts
import { RemixURLResolver } from 'remix-url-resolver'

const urlResolver = new RemixURLResolver()
const fileName: string = '../greeter.sol'
urlResolver.resolve(fileName, urlHandler)
	.then((sources: object) => {
		console.log(sources)
	})
	.catch((e: Error) => {
		throw e
	})
```

#### References

* [TypeScript Publishing](http://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html)
* [DefinitelyTyped 'Create a new package' guide](https://github.com/DefinitelyTyped/DefinitelyTyped#create-a-new-package)

### Contribute

Please feel free to open an issue or a pull request. 

In case you want to add some code, do have a look at our contribution guidelines [here](https://github.com/remix-project-org/remix-project/blob/master/CONTRIBUTING.md). Reach us on [Discord](https://discord.gg/qhpCQGWkmf) in case of any queries.   

### License
MIT © 2018-21 Remix Team
