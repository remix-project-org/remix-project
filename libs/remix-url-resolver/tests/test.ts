import { RemixURLResolver } from '../src'
import * as fs from 'fs'
import * as path from 'path'
import * as assert from 'assert'

describe('testRunner', () => {
  describe('# RemixResolve.resolve()', () => {
    describe('* test without AppManager', () => {
      // Local Imports Handler should be rather added in source code and tested here

      // describe('test example_1 [local imports]', () => {
      //   const urlResolver = new RemixURLResolver()
      //   const fileName: string = '../remix-url-resolver/tests/example_1/greeter.sol'
      //   let results: object = {}

      //   before(done => {
      //     function handleLocal(pathString: string, filePath: string) {
      //       // if no relative/absolute path given then search in node_modules folder
      //       if (pathString && pathString.indexOf('.') !== 0 && pathString.indexOf('/') !== 0) {
      //         // return handleNodeModulesImport(pathString, filePath, pathString)
      //         return
      //       } else {
      //         const o = { encoding: 'UTF-8' }
      //         const p = pathString ? path.resolve(pathString, filePath) : path.resolve(pathString, filePath)
      //         const content = fs.readFileSync(p, o)
      //         return content
      //       }
      //     }
      //     const localFSHandler = [
      //       {
      //         type: 'local',
      //         match: (url: string) => { return /(^(?!(?:http:\/\/)|(?:https:\/\/)?(?:www.)?(?:github.com)))(^\/*[\w+-_/]*\/)*?(\w+\.sol)/g.exec(url) },
      //         handle: (match: Array<string>) => { return handleLocal(match[2], match[3]) }
      //       }
      //     ]
      //     urlResolver.resolve(fileName, localFSHandler)
      //       .then((sources: object) => {
      //         results = sources
      //         done()
      //       })
      //       .catch((e: Error) => {
      //         throw e
      //       })
      //   })

      //   it('should have 3 items', () => {
      //     assert.equal(Object.keys(results).length, 3)
      //   })
      //   it('should return contract content of given local path', () => {
      //     const expt = {
      //       content: 'pragma solidity ^0.5.0;\nimport "./mortal.sol";\n\ncontract Greeter is Mortal {\n    /* Define variable greeting of the type string */\n    string greeting;\n\n    /* This runs when the contract is executed */\n    constructor(string memory _greeting) public {\n        greeting = _greeting;\n    }\n\n    /* Main function */\n    function greet() public view returns (string memory) {\n        return greeting;\n    }\n}\n',
      //       cleanUrl: '../remix-url-resolver/tests/example_1/greeter.sol',
      //       type: 'local'
      //     }
      //     assert.deepEqual(results, expt)
      //   })
      // })

      // Test github import
      describe('test getting github imports', () => {
        const urlResolver = new RemixURLResolver()
        const fileName: string = 'github.com/ethential/solidity-examples/solidity-features-check/greeter.sol'
        let results: object = {}

        before(done => {
          urlResolver.resolve(fileName)
            .then((sources: object) => {
              results = sources
              done()
            })
            .catch((e: Error) => {
              throw e
            })
        })

        it('should have 3 items', () => {
          assert.equal(Object.keys(results).length, 3)
        })
        it('should return contract content of given github path', () => {
          const expt: object = {
            cleanUrl: 'ethential/solidity-examples/solidity-features-check/greeter.sol',
            content: 'pragma solidity >=0.7.0;\nimport "./mortal.sol";\n// SPDX-License-Identifier: GPL-3.0\n\ncontract Greeter is Mortal {\n    /* Define variable greeting of the type string */\n    string greeting;\n\n    /* This runs when the contract is executed */\n    constructor(string memory _greeting) {\n        greeting = _greeting;\n    }\n\n    /* Main function */\n    function greet() public view returns (string memory) {\n        return greeting;\n    }\n}\n\n// 0x37aA58B2cE3Bb9576EEBCD51315070eA8806b7c4\n',
            type: 'github'
          }
          assert.deepEqual(results, expt)
        })
      })

      // Test github import for specific branch
      describe('test getting github imports for specific branch', () => {
        const urlResolver = new RemixURLResolver()
        const fileName: string = 'https://github.com/ethereum/remix-project/blob/remix_beta/libs/remix-url-resolver/tests/example_1/greeter.sol'
        let results: object = {}

        before(done => {
          urlResolver.resolve(fileName)
            .then((sources: object) => {
              results = sources
              done()
            })
            .catch((e: Error) => {
              throw e
            })
        })

        it('should have 3 items', () => {
          assert.equal(Object.keys(results).length, 3)
        })
        it('should return contract content of given github path', () => {
          const expt: object = {
            cleanUrl: 'ethereum/remix-project/libs/remix-url-resolver/tests/example_1/greeter.sol',
            content: fs.readFileSync(__dirname + '/example_1/greeter.sol', { encoding: 'utf8' }),
            type: 'github'
          }
          assert.deepEqual(results, expt)
        })
      })

      // Test github import for specific tag
      describe('test getting github imports for specific tag', () => {
        const urlResolver = new RemixURLResolver()
        const fileName: string = 'https://github.com/ethereum/remix-project/blob/v0.10.7/libs/remix-url-resolver/tests/example_1/greeter.sol'
        let results: object = {}

        before(done => {
          urlResolver.resolve(fileName)
            .then((sources: object) => {
              results = sources
              done()
            })
            .catch((e: Error) => {
              throw e
            })
        })

        it('should have 3 items', () => {
          assert.equal(Object.keys(results).length, 3)
        })
        it('should return contract content of given github path', () => {
          const expt: object = {
            cleanUrl: 'ethereum/remix-project/libs/remix-url-resolver/tests/example_1/greeter.sol',
            content: fs.readFileSync(__dirname + '/example_1/greeter.sol', { encoding: 'utf8' }) + '\n',
            type: 'github'
          }
          assert.deepEqual(results, expt)
        })
      })

      // Test github import for specific commit id
      describe('test getting github imports for specific commit id', () => {
        const urlResolver = new RemixURLResolver()
        const fileName: string = 'https://github.com/ethereum/remix-project/blob/d95b20d77bb3d41da4a86f3ff486879edb386a5b/libs/remix-url-resolver/tests/example_1/greeter.sol'
        let results: object = {}

        before(done => {
          urlResolver.resolve(fileName)
            .then((sources: object) => {
              results = sources
              done()
            })
            .catch((e: Error) => {
              throw e
            })
        })

        it('should have 3 items', () => {
          assert.equal(Object.keys(results).length, 3)
        })
        it('should return contract content of given github path', () => {
          const expt: object = {
            cleanUrl: 'ethereum/remix-project/libs/remix-url-resolver/tests/example_1/greeter.sol',
            content: fs.readFileSync(__dirname + '/example_1/greeter.sol', { encoding: 'utf8' }),
            type: 'github'
          }
          assert.deepEqual(results, expt)
        })
      })

      // Test https imports
      describe('test getting https imports', () => {
        const urlResolver = new RemixURLResolver()
        const fileName: string = 'https://gist.githubusercontent.com/roneilr/7901633d7c2f52957d22/raw/d9b9d54760f6e4f4cfbac4b321bee6a6983a1048/greeter.sol'
        let results: object = {}

        before(done => {
          urlResolver.resolve(fileName)
            .then((sources: object) => {
              results = sources
              done()
            })
            .catch((e: Error) => {
              throw e
            })
        })

        it('should have 3 items', () => {
          assert.equal(Object.keys(results).length, 3)
        })
        it('should return contract content from raw github url', () => {
          const expt: object = {
            content: 'contract mortal {\n    /* Define variable owner of the type address*/\n    address owner;\n\n    /* this function is executed at initialization and sets the owner of the contract */\n    function mortal() { owner = msg.sender; }\n\n    /* Function to recover the funds on the contract */\n    function kill() { if (msg.sender == owner) suicide(owner); }\n}\n\ncontract greeter is mortal {\n    /* define variable greeting of the type string */\n    string greeting;\n\n    /* this runs when the contract is executed */\n    function greeter(string _greeting) public {\n        greeting = _greeting;\n    }\n\n    /* main function */\n    function greet() constant returns (string) {\n        return greeting;\n    }\n}',
            cleanUrl: 'gist.githubusercontent.com/roneilr/7901633d7c2f52957d22/raw/d9b9d54760f6e4f4cfbac4b321bee6a6983a1048/greeter.sol',
            type: 'https'
          }
          assert.deepEqual(results, expt)
        })
      })

      // Test http imports
      describe('test getting http imports', () => {
        const urlResolver = new RemixURLResolver()
        const fileName: string = 'http://gist.githubusercontent.com/roneilr/7901633d7c2f52957d22/raw/d9b9d54760f6e4f4cfbac4b321bee6a6983a1048/greeter.sol'
        let results: object = {}

        before(done => {
          urlResolver.resolve(fileName)
            .then((sources: object) => {
              results = sources
              done()
            })
            .catch((e: Error) => {
              throw e
            })
        })

        it('should have 3 items', () => {
          assert.equal(Object.keys(results).length, 3)
        })
        it('should return contract content from raw github url', () => {
          const expt: object = {
            content: 'contract mortal {\n    /* Define variable owner of the type address*/\n    address owner;\n\n    /* this function is executed at initialization and sets the owner of the contract */\n    function mortal() { owner = msg.sender; }\n\n    /* Function to recover the funds on the contract */\n    function kill() { if (msg.sender == owner) suicide(owner); }\n}\n\ncontract greeter is mortal {\n    /* define variable greeting of the type string */\n    string greeting;\n\n    /* this runs when the contract is executed */\n    function greeter(string _greeting) public {\n        greeting = _greeting;\n    }\n\n    /* main function */\n    function greet() constant returns (string) {\n        return greeting;\n    }\n}',
            cleanUrl: 'gist.githubusercontent.com/roneilr/7901633d7c2f52957d22/raw/d9b9d54760f6e4f4cfbac4b321bee6a6983a1048/greeter.sol',
            type: 'http'
          }
          assert.deepEqual(results, expt)
        })
      })

      // Test IPFS imports
      describe('test getting IPFS imports', () => {
        const urlResolver = new RemixURLResolver()
        const fileName = 'ipfs://QmcuCKyokk9Z6f65ADAADNiS2R2xCjfRkv7mYBSWDwtA7M'
        let results: object = {}

        before(done => {
          urlResolver.resolve(fileName)
            .then((sources: object) => {
              results = sources
              done()
            })
            .catch((e: Error) => {
              throw e
            })
        })

        it('should have 3 items', () => {
          assert.equal(Object.keys(results).length, 3)
        })
        it('should return contract content from IPFS url', () => {
          const content = fs.readFileSync(__dirname + '/example_1/greeter.sol', { encoding: 'utf8' })
          const expt: object = {
            content: content,
            cleanUrl: 'QmcuCKyokk9Z6f65ADAADNiS2R2xCjfRkv7mYBSWDwtA7M',
            type: 'ipfs'
          }
          assert.deepEqual(results, expt)
        })
      })

      // Test npm import whose version is pinned to a github repo
      describe('test getting npm imports pinned to a github repo', () => {
        const getDependencies: any = async () => ({
          deps: { '@openzeppelin/contracts': 'github:OpenZeppelin/openzeppelin-contracts#v5.0.0' },
          yarnLock: null,
          packageLock: null
        })
        const urlResolver = new RemixURLResolver(getDependencies)
        const fileName: string = '@openzeppelin/contracts/token/ERC20/ERC20.sol'
        let results: any = {}

        before(done => {
          urlResolver.resolve(fileName)
            .then((sources: object) => {
              results = sources
              done()
            })
            .catch((e: Error) => {
              throw e
            })
        })

        it('should have 3 items', () => {
          assert.equal(Object.keys(results).length, 3)
        })
        it('should resolve the file from github instead of the npm gateways', () => {
          assert.equal(results.cleanUrl, 'OpenZeppelin/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol')
        })
        it('should return the content of the pinned tag', () => {
          assert.ok(results.content.includes('(last updated v5.0.0)'))
        })
      })

      // Test SWARM imports
      /*
      describe('test getting SWARM imports', () => {
        const urlResolver = new RemixURLResolver()
        const fileName = 'bzz-raw://a728627437140f2b0b46c1bcfb0de2126d18b40e9b61c3e31bd96abebf714619'
        let results: object = {}

        before(done => {
          urlResolver.resolve(fileName)
            .then((sources: object) => {
              results = sources
              done()
            })
            .catch((e: Error) => {
              throw e
            })
        })

        it('should have 3 items', () => {
          assert.equal(Object.keys(results).length, 3)
        })
        it('should return contract content from SWARM url', () => {
          const content = fs.readFileSync(__dirname + '/example_1/greeter.sol', { encoding: 'utf8'})
          const expt: object = {
            content: content,
            cleanUrl: 'a728627437140f2b0b46c1bcfb0de2126d18b40e9b61c3e31bd96abebf714619',
            type: 'swarm'
          }
          assert.deepEqual(results, expt)
        })
      })
      */
    })
  })
})
