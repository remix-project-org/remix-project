'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },

  'Test Signature': '' + function (browser: NightwatchBrowser) {
    let hash, signature
    browser
      .clickLaunchIcon('udapp')
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c') // this account will be used for this test suite
      .signMessage('test message', (h, s) => {
        hash = h
        signature = s
        console.log('hash', hash)
        console.log('signature', signature)
        browser.assert.ok(typeof hash.value === 'string', 'type of hash.value must be String')
        browser.assert.ok(typeof signature.value === 'string', 'type of signature.value must be String')
        // we check here that the input is strictly "test message"
        browser.assert.equal(signature.value, '0xaa8873317ebf3f34fbcc0eab3e9808d851352674c28a3d6b88dc84db6e10fc183a45bcec983a105964a13b54f18e43eceae29d982bf379826fb7ecfe0d42c6ba1b', 'signature should be tied to the input "test message"')
      })
      .addFile('signMassage.sol', sources[0]['signMassage.sol'])
      .openFile('signMassage.sol')
      .clickLaunchIcon('solidity')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('udapp')
      .pause(5000)
      .selectContract('ECVerify')
      .createContract('')
      .clickInstance(0)
      .perform((done) => {
        browser.getAddressAtPosition(0, (address) => {
          // skip 'instance' part of e.g. 'instance0x692a70d2e424a56d2c6c27aa97d1a86395877b3a'
          console.log('Test Signature address', address)
          const inputs = `"${hash.value}","${signature.value}"`
          console.log('Test Signature Input', inputs)
          browser.clickFunction('ecrecovery - call', { types: 'bytes32 hash, bytes sig', values: inputs })
            .pause(5000)
            .verifyCallReturnValue(
              address,
              ['0:address: 0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c'])
            .perform(() => {
              done()
            })
        })
      })
  },

  'Test EIP 712 Signature': '' + function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('i[id="remixRunSignMsg"]')
      .click('i[id="remixRunSignMsg"]')
      .waitForElementVisible('*[data-id="signMessageTextarea"]', 120000)
      .click('*[data-id="sign-eip-712"]')
      .waitForElementVisible('*[data-id="udappNotify-modal-footer-ok-react"]')
      .modalFooterOKClick('udappNotify')
      .pause(1000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('"primaryType": "AuthRequest",') !== -1, 'EIP 712 data file must be opened')
      })
      .clickLaunchIcon('filePanel')
      .rightClick('li[data-id="treeViewLitreeViewItemEIP-712-data.json"]')
      .click('*[data-id="contextMenuItemsignTypedData"]')
      .pause(1000)
      .journalChildIncludes('0x8be3a81e17b7e4a40006864a4ff6bfa3fb1e18b292b6f47edec95cd8feaa53275b90f56ca02669d461a297e6bf94ab0ee4b7c89aede3228ed5aedb59c7e007501c')
  }
}

const sources = [
  {
    'signMassage.sol': {
      content: `
    pragma solidity >=0.4.22 <0.9.0;
    contract SignMassageTest {
      function testRecovery(bytes32 h, uint8 v, bytes32 r, bytes32 s) public pure returns (address) {
          return ecrecover(h, v, r, s);
      }
    }

    library ECVerify {
      function ecrecovery(bytes32 hash, bytes memory sig) public pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        if (sig.length != 65) {
          return address(0);
        }

        assembly {
          r := mload(add(sig, 32))
          s := mload(add(sig, 64))
          v := and(mload(add(sig, 65)), 255)
        }

        if (v < 27) {
          v += 27;
        }

        if (v != 27 && v != 28) {
          return address(0);
        }

        return ecrecover(hash, v, r, s);
      }

      function ecverify(bytes32 hash, bytes memory sig, address signer) public pure returns (bool) {
        return signer == ecrecovery(hash, sig);
      }
    }`
    }
  }
]
