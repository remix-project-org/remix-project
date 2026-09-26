import { deploy } from './ethers-lib'

(async () => {
  try {
    console.log('=== Transparent Proxy Pattern ===')
    const boxV1 = await deploy('BoxV1', [])
    console.log(`BoxV1 (implementation) deployed at: ${boxV1.address}`)

    const proxyAdmin = await deploy('ProxyAdmin', [
      '0x0000000000000000000000000000000000000001' // initial owner
    ])
    console.log(`ProxyAdmin deployed at: ${proxyAdmin.address}`)

    const transparentProxy = await deploy('TransparentUpgradeableProxy', [
      boxV1.address,
      proxyAdmin.address,
      '0x' // no init data (BoxV1 has no initializer)
    ])
    console.log(`TransparentUpgradeableProxy deployed at: ${transparentProxy.address}`)
    console.log(`  → Interact with BoxV1 via proxy address`)

    console.log('\n=== UUPS Proxy Pattern ===')
    const [signer] = await (new (require('ethers').providers.Web3Provider)(web3Provider)).listAccounts()
    const counterV1 = await deploy('CounterV1', [])
    console.log(`CounterV1 (implementation) deployed at: ${counterV1.address}`)

    const initData = counterV1.interface.encodeFunctionData('initialize', [signer])
    const uupsProxy = await deploy('ERC1967Proxy', [counterV1.address, initData])
    console.log(`ERC1967Proxy (UUPS) deployed at: ${uupsProxy.address}`)

    console.log('\n=== Beacon Proxy Pattern ===')
    const tokenImpl = await deploy('TokenImplementation', [])
    console.log(`TokenImplementation deployed at: ${tokenImpl.address}`)

    const factory = await deploy('TokenFactory', [tokenImpl.address])
    console.log(`TokenFactory deployed at: ${factory.address}`)
    console.log(`  → Call factory.createToken(name, symbol, supply, recipient)`)
    console.log(`  → Upgrade all tokens: factory.beacon().upgradeTo(newImpl)`)
  } catch (e) {
    console.log(e.message)
  }
})()
