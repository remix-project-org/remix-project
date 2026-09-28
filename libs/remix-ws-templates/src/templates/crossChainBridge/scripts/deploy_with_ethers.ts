import { deploy } from './ethers-lib'

(async () => {
  try {
    const [relayer] = await (new (require('ethers').providers.Web3Provider)(web3Provider)).listAccounts()

    // ── L1 Side ──────────────────────────────────────────────────────────────
    // Deploy a mock ERC-20 token (the "native" token on L1)
    const l1Token = await deploy('ERC20', [])
    console.log(`L1 Token deployed at: ${l1Token.address}`)

    const l1Bridge = await deploy('L1Bridge', [l1Token.address, relayer])
    console.log(`L1Bridge deployed at: ${l1Bridge.address}`)

    // ── L2 Side ──────────────────────────────────────────────────────────────
    // In production: deploy on a different chain. Here we deploy to the same network for testing.
    const l2Bridge = await deploy('L2Bridge', [
      relayer,
      'Wrapped Token', // Name of the wrapped token on L2
      'wTKN'           // Symbol
    ])
    console.log(`L2Bridge deployed at: ${l2Bridge.address}`)

    console.log(`\nBridge setup:`)
    console.log(`  L1 Token: ${l1Token.address}`)
    console.log(`  L1 Bridge: ${l1Bridge.address}`)
    console.log(`  L2 Bridge: ${l2Bridge.address}`)
    console.log(`  Relayer: ${relayer}`)
    console.log(`\nBridge L1 → L2 flow:`)
    console.log(`  1. Approve L1Bridge to spend your tokens`)
    console.log(`  2. Call l1Bridge.deposit(amount, l2RecipientAddress)`)
    console.log(`  3. Relayer detects DepositInitiated event`)
    console.log(`  4. Relayer calls l2Bridge.mint(recipient, amount, depositId)`)
    console.log(`\nBridge L2 → L1 flow:`)
    console.log(`  1. Call l2Bridge.withdraw(amount, l1RecipientAddress)`)
    console.log(`  2. Relayer detects WithdrawalInitiated event`)
    console.log(`  3. Relayer calls l1Bridge.release(recipient, amount, withdrawalId)`)
  } catch (e) {
    console.log(e.message)
  }
})()
