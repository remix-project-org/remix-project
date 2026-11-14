import * as assert from 'assert'
import { commandOf, pickTip, TipMessage } from './commandTips'

const user = (content: string): TipMessage => ({ role: 'user', content })
const assistant = (content: string, fileChanges?: unknown[]): TipMessage => ({ role: 'assistant', content, fileChanges })
const ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'

describe('pickTip', () => {
  it('suggests /generate on an empty chat', () => {
    assert.strictEqual(pickTip([], [])?.command, 'generate')
  })

  it('suggests /compile after an answer that changed files', () => {
    assert.strictEqual(pickTip([user('make me a token'), assistant('Done.', [{ path: 'Token.sol' }])], [])?.command, 'compile')
  })

  it('suggests /compile after an answer with Solidity code', () => {
    assert.strictEqual(pickTip([user('hi'), assistant('```solidity\ncontract A {}\n```')], [])?.command, 'compile')
  })

  it('suggests /deploy when the conversation talks about a testnet', () => {
    assert.strictEqual(pickTip([user('how do I get it on Sepolia?'), assistant('You can use a faucet.')], [])?.command, 'deploy')
  })

  it('suggests /audit when the conversation talks about security', () => {
    assert.strictEqual(pickTip([user('is this contract safe?'), assistant('Let me look.')], [])?.command, 'audit')
  })

  it('suggests /create-dapp once a deploy succeeded', () => {
    assert.strictEqual(pickTip([user('/deploy'), assistant(`Deployed MyToken at ${ADDRESS}.`)], [])?.command, 'create-dapp')
  })

  it('looks at the newest message first', () => {
    const messages = [user('is it safe?'), assistant('Yes.'), user('deploy it to sepolia'), assistant('Which account?')]
    assert.strictEqual(pickTip(messages, [])?.command, 'deploy')
  })

  it('skips commands the user already used', () => {
    assert.strictEqual(pickTip([], ['generate']), null)
    const messages = [user('is it safe?'), assistant('Yes.'), user('deploy it to sepolia')]
    assert.strictEqual(pickTip(messages, ['deploy'])?.command, 'audit')
  })

  it('skips commands the user has no access to', () => {
    const messages = [user('deploy it, is it safe?')]
    assert.strictEqual(pickTip(messages, [], (cmd) => cmd !== 'audit')?.command, 'deploy')
  })

  it('returns null when nothing matches', () => {
    assert.strictEqual(pickTip([user('hello'), assistant('Hi! How can I help?')], []), null)
  })
})

describe('commandOf', () => {
  it('reads the command a prompt starts with', () => {
    assert.strictEqual(commandOf('/create-dapp a voting app'), 'create-dapp')
    assert.strictEqual(commandOf('  /compile'), 'compile')
    assert.strictEqual(commandOf('please /compile'), null)
    assert.strictEqual(commandOf('hello'), null)
  })
})
