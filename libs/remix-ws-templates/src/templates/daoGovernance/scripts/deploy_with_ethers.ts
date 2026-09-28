import { deploy } from './ethers-lib'

(async () => {
  try {
    // 1. Deploy the governance token
    const govToken = await deploy('GovernanceToken', [])
    console.log(`GovernanceToken (GOV) deployed at: ${govToken.address}`)

    // 2. Deploy the Timelock
    // minDelay = 172800 (2 days), proposers/executors set after Governor is deployed
    const timelock = await deploy('DAOTimelock', [
      172800,    // 2-day timelock delay (seconds)
      [],        // proposers (will add Governor after)
      [],        // executors (will add Governor or address(0))
      '0x0000000000000000000000000000000000000000' // admin (will be revoked)
    ])
    console.log(`DAOTimelock deployed at: ${timelock.address}`)

    // 3. Deploy the Governor
    const governor = await deploy('DAOGovernor', [govToken.address, timelock.address])
    console.log(`DAOGovernor deployed at: ${governor.address}`)

    console.log(`\nGovernance setup:`)
    console.log(`  Token: GOV (1M initial supply to deployer)`)
    console.log(`  Timelock delay: 2 days`)
    console.log(`  Quorum: 4% of total supply`)
    console.log(`  Voting period: ~1 week`)
    console.log(`\nPost-deployment setup (call from deployer):`)
    console.log(`  1. govToken.delegate(yourAddress) — activate voting power`)
    console.log(`  2. timelock.grantRole(PROPOSER_ROLE, governor.address)`)
    console.log(`  3. timelock.grantRole(EXECUTOR_ROLE, address(0)) — open execution`)
    console.log(`  4. timelock.revokeRole(DEFAULT_ADMIN_ROLE, deployer) — decentralize`)
    console.log(`\nGovernance lifecycle:`)
    console.log(`  1. propose() → vote() → queue() → execute()`)
  } catch (e) {
    console.log(e.message)
  }
})()
