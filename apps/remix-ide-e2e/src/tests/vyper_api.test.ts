/* eslint-disable @typescript-eslint/no-unused-vars */
'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

declare global {
  interface Window { testplugin: { name: string, url: string }; }
}

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Should connect to vyper plugin #group1': '' + function (browser: NightwatchBrowser) {
    browser.clickLaunchIcon('pluginManager')
      .scrollAndClick('[data-id="pluginManagerComponentActivateButtonvyper"]')
      .clickLaunchIcon('vyper')
      .frame(0)
  },

  'Should clone the Vyper repo #group1': '' + function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('button[data-id="add-repository"]')
      .click('button[data-id="add-repository"]')
      .frameParent()
      // .clickLaunchIcon('filePanel')
      .waitForElementVisible({
        selector: "//*[@data-id='workspacesSelect' and contains(.,'vyper')]",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible({
        selector: "//*[contains(., 'Vyper repository cloned')]",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(2000)
      .openFile('examples')
      .openFile('examples/auctions')
      .openFile('examples/auctions/blind_auction.vy')
  },

  // '@sources': () => sources,
  // 'Context menu click to compile blind_auction should succeed #group1': function (browser: NightwatchBrowser) {
  //   browser
  //     // .click('*[data-id="treeViewLitreeViewItemblind_auction.vy"]')
  //     // .rightClick('*[data-id="treeViewLitreeViewItemblind_auction.vy"]')
  //     // .waitForElementPresent('[data-id="contextMenuItemvyper"]')
  //     // .click('[data-id="contextMenuItemvyper"]')
  //     .clickLaunchIcon('vyper')
  //     // @ts-ignore
  //     .frame(0)
  //     .waitForElementVisible({
  //       selector:'[data-id="compilation-details"]',
  //       timeout: 120000
  //     })
  //     .click('[data-id="compilation-details"]')
  //     .frameParent()
  //     .waitForElementVisible('[data-id="copy-abi"]')
  //     .waitForElementVisible({
  //       selector: "//*[@class='variable-value' and contains(.,'highestBidder')]",
  //       locateStrategy: 'xpath',
  //     })
  // },

  'Compile blind_auction should success #group1': '' + function (browser: NightwatchBrowser) {
    browser
      // @ts-ignore
      .clickLaunchIcon('vyper')
      .frame(0)
      .click('[data-id="compile"]')
      .waitForElementVisible({
        selector:'[data-id="compilation-details"]',
        timeout: 120000
      })
      .click('[data-id="compilation-details"]')
      .frameParent()
      .waitForElementVisible('[data-id="copy-abi"]')
      .waitForElementVisible({
        selector: "//*[@class='variable-value' and contains(.,'highestBidder')]",
        locateStrategy: 'xpath',
      })
  },

  'Should copy abi after blind_auction compile #group1': '' + function (browser: NightwatchBrowser) {
    if (browser.browserName.indexOf('chrome') > -1) {
      const chromeBrowser = (browser as any).chrome
      chromeBrowser.setPermission('clipboard-read', 'granted')
      chromeBrowser.setPermission('clipboard-write', 'granted')
      browser
        .frame(0)
        .click('[data-id="compile"]')
        .waitForElementVisible({
          selector:'[data-id="compilation-details"]',
          timeout: 120000
        })
        .click('[data-id="compilation-details"]')
        .frameParent()
        .waitForElementVisible('[data-id="copy-abi"]')
        .click('[data-id="copy-abi"]')
        .executeAsyncScript(function (done) {
          navigator.clipboard.readText()
            .then(function (clippedText) {
              done(clippedText)
            }).catch(function (error) {
              console.log('Failed to read clipboard contents: ', error)
              done()
            })
        }, [], function (result) {
          console.log('clipboard result: ' + result)
          browser.assert.ok((result as any).value.length > 1, 'abi copied to clipboard')
        })
    }
  },

  'Should lead to a compilation error #group1': '' + function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .switchWorkspace('default_workspace')
      .addFile('test_error.vy', { content: wrongContract })
      .clickLaunchIcon('vyper')
      // @ts-ignore
      .frame(0)
      .waitForElementVisible('[data-id="compile"]')
      .click('[data-id="compile"]')
      .waitForElementVisible({
        selector:'[data-id="test_error.vy"]',
        timeout: 60000
      })
      .waitForElementContainsText('[data-id="test_error.vy"]', 'ERROR')
      .waitForElementContainsText('[data-id="test_error.vy"]', 'StructureException:Unsupported syntax for module namespace')
      .frameParent()
  },

  'Compile test contract and deploy to remix VM #group1': '' + function (browser: NightwatchBrowser) {
    let contractAddress
    browser
      .clickLaunchIcon('filePanel')
      .switchWorkspace('default_workspace')
      .addFile('test.vy', { content: testContract })
      .clickLaunchIcon('vyper')
      // @ts-ignore
      .frame(0)
      .waitForElementVisible('[data-id="compile"]')
      .click('[data-id="compile"]')
      .waitForElementVisible({
        selector:'[data-id="compilation-details"]',
        timeout: 60000
      })
      .click('[data-id="compilation-details"]')
      .frameParent()
      .waitForElementVisible('[data-id="copy-abi"]')
      .clickLaunchIcon('udapp')
      .createContract('')
      .clickInstance(0)
      .clickFunction('totalPokemonCount - call')
      .getAddressAtPosition(0, (address) => {
        console.log('Vyper contract ' + address)
        contractAddress = address
      })
      .perform((done) => {
        browser.verifyCallReturnValue(contractAddress, ['0:uint256: 0'])
          .perform(() => done())
      })
  },

  // 'Compile Ownable contract from snekmate #group1': function (browser: NightwatchBrowser) {
  //   let contractAddress
  //   browser
  //     .frameParent()
  //     .clickLaunchIcon('filePanel')
  //     .switchWorkspace('vyper')
  //     .openFile('src')
  //     .openFile('src/snekmate')
  //     .openFile('src/snekmate/auth')
  //     .openFile('src/snekmate/auth/Ownable.vy')
  //     .rightClick('*[data-id="treeViewLitreeViewItemsrc/snekmate/auth/Ownable.vy"]')
  //     .waitForElementVisible('*[data-id="contextMenuItemvyper"]')
  //     .click('*[data-id="contextMenuItemvyper"]')
  //     .clickLaunchIcon('vyper')
  //     // @ts-ignore
  //     .frame(0)
  //     .click('[data-id="compile"]')
  //     .waitForElementVisible({
  //       selector:'[data-id="compilation-details"]',
  //       timeout: 60000
  //     })
  //     .click('[data-id="compilation-details"]')
  //     .frameParent()
  //     .waitForElementVisible('[data-id="copy-abi"]')
  //     .end()
  // }
}

const testContract = `

DNA_DIGITS: constant(uint256) = 16
DNA_MODULUS: constant(uint256) = 10 ** DNA_DIGITS
# add HP_LIMIT

struct Pokemon:
    name: String[32]
    dna: uint256
    HP: uint256
    matches: uint256
    wins: uint256

totalPokemonCount: public(uint256)
pokemonList: HashMap[uint256, Pokemon]

@pure
@internal
def _generateRandomDNA(_name: String[32]) -> uint256:
    random: uint256 = convert(keccak256(_name), uint256)
    return random % DNA_MODULUS
# modify _createPokemon
@internal
def _createPokemon(_name: String[32], _dna: uint256, _HP: uint256):
    self.pokemonList[self.totalPokemonCount] = Pokemon({
        name: _name,
        dna: _dna,
        HP: _HP,
        matches: 0,
        wins: 0
    })
    self.totalPokemonCount += 1`

const wrongContract = `
DNA_DIGITS: constant(uint256) = 16
DNA_MODULUS: constant(uint256) = 10 ** DNA_DIGITS
# add HP_LIMIT
ERROR
struct Pokemon:
    name: String[32]
    dna: uint256
    HP: uint256
    matches: uint256
    wins: uint256

totalPokemonCount: public(uint256)
pokemonList: HashMap[uint256, Pokemon]

@pure
@internal
def _generateRandomDNA(_name: String[32]) -> uint256:
    random: uint256 = convert(keccak256(_name), uint256)
    return random % DNA_MODULUS
# modify _createPokemon
@internal
def _createPokemon(_name: String[32], _dna: uint256, _HP: uint256):
    self.pokemonList[self.totalPokemonCount] = Pokemon({
        name: _name,
        dna: _dna,
        HP: _HP,
        matches: 0,
        wins: 0
    })
    self.totalPokemonCount += 1`

const sources = [{

  'blindAuction' : { content: `
# Blind Auction. Adapted to Vyper from [Solidity by Example](https://github.com/ethereum/solidity/blob/develop/docs/solidity-by-example.rst#blind-auction-1)
#pragma version >0.3.10

struct Bid:
  blindedBid: bytes32
  deposit: uint256

# Note: because Vyper does not allow for dynamic arrays, we have limited the
# number of bids that can be placed by one address to 128 in this example
MAX_BIDS: constant(int128) = 128

# Event for logging that auction has ended
event AuctionEnded:
    highestBidder: address
    highestBid: uint256

# Auction parameters
beneficiary: public(address)
biddingEnd: public(uint256)
revealEnd: public(uint256)

# Set to true at the end of auction, disallowing any new bids
ended: public(bool)

# Final auction state
highestBid: public(uint256)
highestBidder: public(address)

# State of the bids
bids: HashMap[address, Bid[128]]
bidCounts: HashMap[address, int128]

# Allowed withdrawals of previous bids
pendingReturns: HashMap[address, uint256]



@external
def __init__(_beneficiary: address, _biddingTime: uint256, _revealTime: uint256):
    self.beneficiary = _beneficiary
    self.biddingEnd = block.timestamp + _biddingTime
    self.revealEnd = self.biddingEnd + _revealTime


# Place a blinded bid with:
#
# _blindedBid = keccak256(concat(
#       convert(value, bytes32),
#       convert(fake, bytes32),
#       secret)
# )
#
# The sent ether is only refunded if the bid is correctly revealed in the
# revealing phase. The bid is valid if the ether sent together with the bid is
# at least "value" and "fake" is not true. Setting "fake" to true and sending
# not the exact amount are ways to hide the real bid but still make the
# required deposit. The same address can place multiple bids.
@external
@payable
def bid(_blindedBid: bytes32):
    # Check if bidding period is still open
    assert block.timestamp < self.biddingEnd

    # Check that payer hasn't already placed maximum number of bids
    numBids: int128 = self.bidCounts[msg.sender]
    assert numBids < MAX_BIDS

    # Add bid to mapping of all bids
    self.bids[msg.sender][numBids] = Bid({
        blindedBid: _blindedBid,
        deposit: msg.value
        })
    self.bidCounts[msg.sender] += 1


# Returns a boolean value, 'True' if bid placed successfully, 'False' otherwise.
@internal
def placeBid(bidder: address, _value: uint256) -> bool:
    # If bid is less than highest bid, bid fails
    if (_value <= self.highestBid):
        return False

    # Refund the previously highest bidder
    if (self.highestBidder != empty(address)):
        self.pendingReturns[self.highestBidder] += self.highestBid

    # Place bid successfully and update auction state
    self.highestBid = _value
    self.highestBidder = bidder

    return True


# Reveal your blinded bids. You will get a refund for all correctly blinded
# invalid bids and for all bids except for the totally highest.
@external
def reveal(_numBids: int128, _values: uint256[128], _fakes: bool[128], _secrets: bytes32[128]):
    # Check that bidding period is over
    assert block.timestamp > self.biddingEnd

    # Check that reveal end has not passed
    assert block.timestamp < self.revealEnd

    # Check that number of bids being revealed matches log for sender
    assert _numBids == self.bidCounts[msg.sender]

    # Calculate refund for sender
    refund: uint256 = 0
    for i in range(MAX_BIDS):
        # Note that loop may break sooner than 128 iterations if i >= _numBids
        if (i >= _numBids):
            break

        # Get bid to check
        bidToCheck: Bid = (self.bids[msg.sender])[i]

        # Check against encoded packet
        value: uint256 = _values[i]
        fake: bool = _fakes[i]
        secret: bytes32 = _secrets[i]
        blindedBid: bytes32 = keccak256(concat(
            convert(value, bytes32),
            convert(fake, bytes32),
            secret
        ))

        # Bid was not actually revealed
        # Do not refund deposit
        assert blindedBid == bidToCheck.blindedBid

        # Add deposit to refund if bid was indeed revealed
        refund += bidToCheck.deposit
        if (not fake and bidToCheck.deposit >= value):
            if (self.placeBid(msg.sender, value)):
                refund -= value

        # Make it impossible for the sender to re-claim the same deposit
        zeroBytes32: bytes32 = empty(bytes32)
        bidToCheck.blindedBid = zeroBytes32

    # Send refund if non-zero
    if (refund != 0):
        send(msg.sender, refund)


# Withdraw a bid that was overbid.
@external
def withdraw():
    # Check that there is an allowed pending return.
    pendingAmount: uint256 = self.pendingReturns[msg.sender]
    if (pendingAmount > 0):
        # If so, set pending returns to zero to prevent recipient from calling
        # this function again as part of the receiving call before 'transfer'
        # returns (see the remark above about conditions -> effects ->
        # interaction).
        self.pendingReturns[msg.sender] = 0

        # Then send return
        send(msg.sender, pendingAmount)


# End the auction and send the highest bid to the beneficiary.
@external
def auctionEnd():
    # Check that reveal end has passed
    assert block.timestamp > self.revealEnd

    # Check that auction has not already been marked as ended
    assert not self.ended

    # Log auction ending and set flag
    log AuctionEnded(self.highestBidder, self.highestBid)
    self.ended = True

    # Transfer funds to beneficiary
    send(self.beneficiary, self.highestBid)
` }
}
]
