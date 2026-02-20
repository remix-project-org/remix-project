'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  '@sources': function () {
    return ''
  },

  'Execute a call that retrieve previous block hashes #group1': function (browser: NightwatchBrowser) {
    const code = `
      contract A {
        function foo(uint p) public view returns(bytes32) {
            return blockhash(p);
        }
      }`
    browser.testContracts('test.sol',{ content: code } , ['A'])
      .clickLaunchIcon('udapp')
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c') // this account will be used for this test suite
      .createContract('')
      .clickInstance(0)
      .clickFunction(0, 0, { types: 'uint256 p', values: '0' })      
      .perform((done) => {
        browser.getAddressAtPosition(0, (address) => {
          browser
            .verifyCallReturnValue(address, (values: string[]) => {
              // should be looking like: ['0:bytes32: 0x0391a96b0b74805e5fbb79a18840548c5b6c0f1c5e933fc5e3ee015823856e00']
              const value = values[0].replace('0:bytes32: ', '')
              let pass = value !== '0x0000000000000000000000000000000000000000000000000000000000000000' && value !== '0x'
              return {
                pass,
                message: pass ? 'pass' : 'a non empty blockhash should be returned'
              }
            })
            .perform(() => done())
        })
      })
      .clickFunction(0, 0, { types: 'uint256 p', values: '1' })      
      .perform((done) => {
        browser.getAddressAtPosition(0, (address) => {
          browser
          .verifyCallReturnValue(address, (values: string[]) => {
            // should be looking like: ['0:bytes32: 0x0391a96b0b74805e5fbb79a18840548c5b6c0f1c5e933fc5e3ee015823856e00']
            const value = values[0].replace('0:bytes32: ', '')
            let pass = value !== '0x0000000000000000000000000000000000000000000000000000000000000000' && value !== '0x'
            return {
              pass,
              message: pass ? 'pass' : 'a non empty blockhash should be returned'
            }
          })
          .perform(() => done())
        })
      }).end()
  }
}
