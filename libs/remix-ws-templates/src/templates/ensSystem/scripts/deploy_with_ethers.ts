import { deploy } from './ethers-lib'
import { ethers } from 'ethers'

(async () => {
  try {
    const [deployer] = await (new ethers.providers.Web3Provider(web3Provider)).listAccounts()

    // 1. Deploy the ENS Registry
    const registry = await deploy('ENSRegistry', [])
    console.log(`ENSRegistry deployed at: ${registry.address}`)

    // 2. Deploy the Public Resolver
    const resolver = await deploy('PublicResolver', [registry.address])
    console.log(`PublicResolver deployed at: ${resolver.address}`)

    // Helper: compute namehash
    const ROOT = ethers.constants.HashZero
    const ethNode = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'bytes32'],
        [ROOT, ethers.utils.keccak256(ethers.utils.toUtf8Bytes('eth'))]
      )
    )

    console.log(`\nNamehash of 'eth': ${ethNode}`)
    console.log(`\nNext steps:`)
    console.log(`  1. Register '.eth' TLD under root:`)
    console.log(`     registry.setSubnodeOwner(ROOT, keccak256('eth'), deployer)`)
    console.log(`  2. Register 'alice.eth':`)
    console.log(`     registry.setSubnodeOwner(ethNode, keccak256('alice'), alice)`)
    console.log(`  3. Set resolver for 'alice.eth':`)
    console.log(`     registry.setResolver(aliceNode, resolver.address)`)
    console.log(`  4. Set address record:`)
    console.log(`     resolver.setAddr(aliceNode, alice)`)
    console.log(`  5. Lookup: resolver.addr(aliceNode)`)
  } catch (e) {
    console.log(e.message)
  }
})()
