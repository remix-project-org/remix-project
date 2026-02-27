'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },

  'Run Scenario using editor play button #group1': ' ' + function (browser: NightwatchBrowser) {
    let addressRef
    browser
      .openFile('remix.config.json')
      .setEditorValue(configFile)
      .addFile('scenario.json', { content: records })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//*[contains(@class, 'view-lines') and contains(.,'0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c')]"
      })
      .clickLaunchIcon('udapp')
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c') // this account will be used for this test suite
      .waitForElementVisible('[data-id="compile_group"]')
      .click('[data-id="compile_group"]')
      .clickInstance(0)
      .clickInstance(1)
      .clickFunction(1, 0)
      .clickFunction(1, 1)
      .clickFunction(1, 2)
      .waitForElementPresent('[data-id="contractItem-1"] > [data-id="udapp_tree_value"]')
      .scrollInto('[data-id="contractItem-1"] > [data-id="udapp_tree_value"]')
      .getAddressAtPosition(1, (address) => {
        console.log('Test Recorder ' + address)
        addressRef = address
      })
      .perform((done) => {
        browser.verifyCallReturnValue(addressRef, ['0:uint256: 1', '0:uint256: 3456', '0:address: 0xbBF289D846208c16EDc8474705C748aff07732dB'])
          .perform(() => done())
      })
      .clickLaunchIcon('udapp')
      .clearDeployedContracts()
      .clearTransactionsRecorder()
  },
  'Save scenario #group1': ' ' + function (browser: NightwatchBrowser) {
    browser.testContracts('testRecorder.sol', sources[0]['testRecorder.sol'], ['testRecorder'])
      .clickLaunchIcon('udapp')
      .createContract('12')
      .clickInstance(0)
      .clickFunction(0, 0, { types: 'uint256 _p', values: '34' })
      .execute(function () {
        const saveScenarioBtn = document.querySelector('[data-id="save-transactions"]') as HTMLElement
        if (saveScenarioBtn) {
          saveScenarioBtn.scrollIntoView({ behavior: 'auto', block: 'center' })
        }
      })
      .click('[data-id="save-transactions"]')
      .waitForElementVisible('[data-id="save-transaction-dialog-btn"]')
      .click('[data-id="save-transaction-dialog-btn"]')
      .pause(2000)
      .getEditorValue(function (result) {
        const parsed = JSON.parse(result)
        browser.assert.equal(JSON.stringify(parsed.transactions[0].record.parameters), JSON.stringify(scenario.transactions[0].record.parameters))
        browser.assert.equal(JSON.stringify(parsed.transactions[0].record.name), JSON.stringify(scenario.transactions[0].record.name))
        browser.assert.equal(JSON.stringify(parsed.transactions[0].record.type), JSON.stringify(scenario.transactions[0].record.type))
        browser.assert.equal(JSON.stringify(parsed.transactions[0].record.from), JSON.stringify(scenario.transactions[0].record.from))
        browser.assert.equal(JSON.stringify(parsed.transactions[0].record.contractName), JSON.stringify(scenario.transactions[0].record.contractName))

        browser.assert.equal(JSON.stringify(parsed.transactions[1].record.parameters), JSON.stringify(scenario.transactions[1].record.parameters))
        browser.assert.equal(JSON.stringify(parsed.transactions[1].record.name), JSON.stringify(scenario.transactions[1].record.name))
        browser.assert.equal(JSON.stringify(parsed.transactions[1].record.type), JSON.stringify(scenario.transactions[1].record.type))
        browser.assert.equal(JSON.stringify(parsed.transactions[1].record.from), JSON.stringify(scenario.transactions[1].record.from))
      })
  },

  'Record more than one contract #group2': ' ' + function (browser: NightwatchBrowser) {
    // deploy 2 contracts (2 different ABIs), save the record, reexecute and test one of the function.
    browser
      .testContracts('multipleContracts.sol', sources[1]['multipleContracts.sol'], ['t1est', 't2est'])
      .clickLaunchIcon('udapp')
      .selectContract('t1est')
      .pause(1000)
      .createContract('')
      .clickInstance(0)
      .selectContract('t2est')
      .pause(1000)
      .createContract('')
      .execute(function () {
        const saveScenarioBtn = document.querySelector('[data-id="save-transactions"]') as HTMLElement
        if (saveScenarioBtn) {
          saveScenarioBtn.scrollIntoView({ behavior: 'auto', block: 'center' })
        }
      })
      .click('[data-id="save-transactions"]')
      .waitForElementVisible('[data-id="save-transaction-dialog-btn"]')
      .click('[data-id="save-transaction-dialog-btn"]')
      .clickLaunchIcon('udapp')
      .clearDeployedContracts()
      .click('*[data-id="terminalClearConsole"]') // clear terminal
      .click('[data-id="compile_group"]')
      .clickInstance(1)
      .pause(1000)
      .clickFunction(1, 0, { types: 'uint256 _po', values: '10' })
      .testFunction('last', {
        status: '1 Transaction mined and execution succeed',
        'decoded input': { 'uint256 _po': '10' }
      })
  },

  'Run with live "mode" #group2': '' + function (browser: NightwatchBrowser) {
    let addressRef: string
    browser.addFile('scenario_live_mode.json', { content: JSON.stringify(liveModeScenario, null, '\t') })
      .addFile('scenario_live_mode_storage.sol', { content: testStorageForLiveMode })
      .clickLaunchIcon('solidity')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .openFile('scenario_live_mode.json')
      .clickLaunchIcon('udapp')
      .click('*[data-id="deployAndRunClearInstances"]')
      .click('*[data-id="runtabLivemodeInput"]')
      .click('.runtransaction')
      .pause(1000)
      .clickInstance(0)
      .getAddressAtPosition(0, (address) => {
        addressRef = address
      })
      .clickFunction('retrieve - call')
      .perform((done) => {
        browser.verifyCallReturnValue(addressRef, ['0:uint256: 350'])
          .perform(() => done())
      })
      // change the init state and recompile the same contract.
      .openFile('scenario_live_mode_storage.sol')
      .setEditorValue(testStorageForLiveMode.replace('number = 350', 'number = 300'))
      .pause(5000)
      .clickLaunchIcon('solidity')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .openFile('scenario_live_mode.json')
      .clickLaunchIcon('udapp')
      .click('*[data-id="deployAndRunClearInstances"]')
      .click('.runtransaction')
      .pause(5000)
      .clickInstance(0)
      .getAddressAtPosition(0, (address) => {
        addressRef = address
      })
      .clickFunction('retrieve - call')
      .perform((done) => {
        browser.verifyCallReturnValue(addressRef, ['0:uint256: 300'])
          .perform(() => done())
      })
      .end()
  }
}

const sources = [{
  'testRecorder.sol': {
    content: `contract testRecorder {
  constructor(uint p) public {
      
  }
  function set (uint _p) public {
          
  }
}`
  }
},
{
  'multipleContracts.sol': {
    content: `contract t1est {
  uint p;
  t2est t;
  constructor () public {
      t = new t2est();
      t.set2(34);
  }
  
  function set(uint _p) public {
      p = _p;
      t.set2(12);
  }
}

contract t2est {
  uint p;
  function set2(uint _po) public {
      p = _po;
  }
}`
  }
}
]

const records = `{
  "accounts": {
    "account{10}": "0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c"
  },
  "linkReferences": {
    "testLib": "created{1512830014773}"
  },
  "transactions": [
    {
      "timestamp": 1512830014773,
      "record": {
        "value": "0",
        "parameters": [],
        "abi": "0xbc36789e7a1e281436464229828f817d6612f7b477d66591ff96a9e064bcc98a",
        "contractName": "testLib",
        "bytecode": "60606040523415600e57600080fd5b60968061001c6000396000f300606060405260043610603f576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff1680636d4ce63c146044575b600080fd5b604a6060565b6040518082815260200191505060405180910390f35b6000610d809050905600a165627a7a7230582022d123b15248b8176151f8d45c2dc132063bcc9bb8d5cd652aea7efae362c8050029",
        "linkReferences": {},
        "inputs": "()",  
        "type": "constructor",
        "from": "account{10}"
      }
    },
    {
      "timestamp": 1512830015080,
      "record": {
        "value": "100",
        "parameters": [
          11
        ],
        "abi": "0xc41589e7559804ea4a2080dad19d876a024ccb05117835447d72ce08c1d020ec",
        "contractName": "test",
        "bytecode": "60606040526040516020806102b183398101604052808051906020019091905050806000819055505061027a806100376000396000f300606060405260043610610062576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff1680632f30c6f61461006757806338cc48311461009e57806362738998146100f357806387cc10e11461011c575b600080fd5b61009c600480803590602001909190803573ffffffffffffffffffffffffffffffffffffffff16906020019091905050610145565b005b34156100a957600080fd5b6100b1610191565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b34156100fe57600080fd5b6101066101bb565b6040518082815260200191505060405180910390f35b341561012757600080fd5b61012f6101c4565b6040518082815260200191505060405180910390f35b8160008190555080600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505050565b6000600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b60008054905090565b600073__browser/ballot.sol:testLib____________636d4ce63c6000604051602001526040518163ffffffff167c010000000000000000000000000000000000000000000000000000000002815260040160206040518083038186803b151561022e57600080fd5b6102c65a03f4151561023f57600080fd5b505050604051805190509050905600a165627a7a72305820e0b2510bb2890a0334bfe5613d96db3e72442e63b514cdeaee8fc2c6bbd19d3a0029",
        "linkReferences": {
          "ballot.sol": {
            "testLib": [
              {
                "length": 20,
                "start": 511
              }
            ]
          }
        },
        "name": "",
        "type": "constructor",
        "inputs": "(uint256)",
        "from": "account{10}"
      }
    },
    {
      "timestamp": 1512830034180,
      "record": {
        "value": "1000000000000000000",
        "parameters": [
          1,
          "created{1512830015080}"
        ],
        "to": "created{1512830015080}",
        "abi": "0xc41589e7559804ea4a2080dad19d876a024ccb05117835447d72ce08c1d020ec",
        "name": "set",
        "inputs": "(uint256,address)",
        "type": "function",
        "from": "account{10}"
      }
    }
  ],
  "abis": {
    "0xbc36789e7a1e281436464229828f817d6612f7b477d66591ff96a9e064bcc98a": [
      {
        "constant": true,
        "inputs": [],
        "name": "get",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
      }
    ],
    "0xc41589e7559804ea4a2080dad19d876a024ccb05117835447d72ce08c1d020ec": [
      {
        "constant": true,
        "inputs": [],
        "name": "getInt",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getFromLib",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getAddress",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_t",
            "type": "uint256"
          },
          {
            "name": "_add",
            "type": "address"
          }
        ],
        "name": "set",
        "outputs": [],
        "payable": true,
        "stateMutability": "payable",
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "_r",
            "type": "uint256"
          }
        ],
        "payable": true,
        "stateMutability": "payable",
        "type": "constructor"
      }
    ]
  }
}`

const scenario = {
  accounts: {
    'account{10}': '0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c'
  },
  linkReferences: {},
  transactions: [
    {
      timestamp: 1512912691086,
      record: {
        value: '0',
        parameters: [
          "12" // eslint-disable-line
        ],
        abi: '0x54a8c0ab653c15bfb48b47fd011ba2b9617af01cb45cab344acd57c924d56798',
        contractName: 'testRecorder',
        bytecode: '6060604052341561000f57600080fd5b6040516020806100cd833981016040528080519060200190919050505060938061003a6000396000f300606060405260043610603f576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff16806360fe47b1146044575b600080fd5b3415604e57600080fd5b606260048080359060200190919050506064565b005b505600a165627a7a723058204839660366b94f5f3c8c6da233a2c5fe95ad5635b5c8a2bb630a8b845d68ecdd0029',
        linkReferences: {},
        name: '',
        type: 'constructor',
        inputs: '(uint256)',
        from: 'account{10}'
      }
    },
    {
      timestamp: 1512912696128,
      record: {
        value: '0',
        parameters: [
          "34" // eslint-disable-line
        ],
        to: 'created{1512912691086}',
        abi: '0x54a8c0ab653c15bfb48b47fd011ba2b9617af01cb45cab344acd57c924d56798',
        name: 'set',
        inputs: '(uint256)',
        type: 'function',
        from: 'account{10}'
      }
    }
  ],
  abis: {
    '0x54a8c0ab653c15bfb48b47fd011ba2b9617af01cb45cab344acd57c924d56798': [
      {
        constant: false,
        inputs: [
          {
            name: '_p',
            type: 'uint256'
          }
        ],
        name: 'set',
        outputs: [],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
      },
      {
        inputs: [
          {
            name: 'p',
            type: 'uint256'
          }
        ],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'constructor'
      }
    ]
  }
}

const liveModeScenario = {
  "accounts": {
    "account{0}": "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4"
  },
  "linkReferences": {},
  "transactions": [
    {
      "timestamp": 1656329164297,
      "record": {
        "value": "0",
        "parameters": [],
        "abi": "0x8b8c9c14c8e1442e90dd6ff82bb9889ccfe5a54d88ef30776f11047ecce5fedb",
        "contractName": "Storage",
        "bytecode": "608060405234801561001057600080fd5b5060c88061001f6000396000f3fe6080604052348015600f57600080fd5b5060043610604e577c010000000000000000000000000000000000000000000000000000000060003504632e64cec1811460535780636057361d146068575b600080fd5b60005460405190815260200160405180910390f35b60786073366004607a565b600055565b005b600060208284031215608b57600080fd5b503591905056fea264697066735822122091f1bc250ccda7caf2b0d9f67b0314d92233fdb5952b72cece72bd2a5d43cfc264736f6c63430008070033",
        "linkReferences": {},
        "name": "",
        "inputs": "()",
        "type": "constructor",
        "from": "account{0}"
      }
    }
  ],
  "abis": {
    "0x8b8c9c14c8e1442e90dd6ff82bb9889ccfe5a54d88ef30776f11047ecce5fedb": [
      {
        "inputs": [
          {
            "internalType": "uint256",
            "name": "num",
            "type": "uint256"
          }
        ],
        "name": "store",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "retrieve",
        "outputs": [
          {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      }
    ]
  }
}

const testStorageForLiveMode = `// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

/**
 * @title Storage
 * @dev Store & retrieve value in a variable
 * @custom:dev-run-script ./scripts/deploy_with_ethers.ts
 */
contract Storage {

    uint256 number;

    constructor () {
        number = 350;
    }

    /**
     * @dev Store value in variable
     * @param num value to store
     */
    function store(uint256 num) public {
        number = num;
    }

    /**
     * @dev Return value 
     * @return value of 'number'
     */
    function retrieve() public view returns (uint256){
        return number;
    }
}`

const configFile = `
{
  "project": "remixDefault",
  "version": "1.6.0-dev",
  "IDE": "127.0.0.1",
  "scenarios": {
    "lastSavedScenario": "scenario.json"
  }
}
`
