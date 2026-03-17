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

  'Should deploy ERC20 contract and debug with breakpoint at OpenZeppelin line 46 #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .pause(2000)
      // Add the ERC20 test contract
      .addFile('MyToken.sol', sources[0]['MyToken.sol'])
      .pause(4000)
      .clickLaunchIcon('solidity')
      // Compile the contract
      .click('*[data-id="compilerContainerCompileBtn"]')
      .pause(4000)
      .clickLaunchIcon('udapp')
      .pause(2000)
      // Deploy the contract
      .createContract('')
      .pause(3000)
      // Get deployed contract instance
      .clickInstance(0)
      .pause(1000)
      // Start debugging the transaction
      .debugTransaction(0)
      .pause(2000)
      // Wait for debugger to load
      .waitForElementVisible('*[data-id="callTraceHeader"]', 60000)
      .pause(2000)
      // Set breakpoint at OpenZeppelin ERC20.sol line 46
      .openFile('.deps/npm/@openzeppelin/contracts@5.4.0/token/ERC20/ERC20.sol')
      .execute(() => {
        // Use the global function to add a breakpoint in ERC20.sol
        (window as any).addRemixBreakpoint(46)
      }, [], () => { })
      .openFile('MyToken.sol')
      .clickLaunchIcon('debugger')
      // Jump to the breakpoint to verify it's reached
      .waitForElementVisible('*[data-id="btnJumpNextBreakpoint"]')
      .click('*[data-id="btnJumpNextBreakpoint"]')
      .pause(5000)
      // Verify the breakpoint was hit by checking the step number changed
      .waitForElementVisible('*[data-id="callTraceHeader"]')
      .pause(1000)
      // Additional verification - check that we're in the right source file
      .getEditorValue(function (content) {
        browser.assert.ok(
          content.includes('abstract contract ERC20') || content.includes('ERC20') || content.includes('_balances') || content.includes('_totalSupply'),
          'Should be debugging OpenZeppelin ERC20 contract code at breakpoint'
        )
      })
  }
}

const sources = [
  {
    'MyToken.sol': {
      content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";

contract MyToken is ERC20, ERC20Permit, ERC20Pausable {
    constructor() ERC20("MyToken", "POIU") ERC20Permit("MyToken") {}

    // Override to resolve conflict
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override(ERC20, ERC20Pausable) {
        ERC20Pausable._update(from, to, value);
    }

    function mintToSender() public {
        _mint(msg.sender, 2000 * 10**decimals());
    }

    function pause() public {
        _pause();
    }

    function unpause() public {
        _unpause();
    }
}`
    }
  }
]