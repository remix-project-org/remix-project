/* global remix, web3Provider */
import { ethers } from 'ethers'

// Run once in a fresh Monad VM after compiling StakingDemo.sol.
const provider = new ethers.BrowserProvider(web3Provider, undefined, { cacheTimeout: -1, pollingInterval: 50 })
try {
  const from = ethers.getAddress(await remix.call('udappEnv', 'getSelectedAccount'))
  await provider.send('monad_setBalance', [from, ethers.toQuantity(ethers.parseEther('30000000'))])
  const signer = await provider.getSigner(from)
  const staking = new ethers.Interface(['function addValidator(bytes,bytes,bytes) returns (uint64)'])
  const stake = ethers.parseEther('10000000')
  const payload = ethers.concat(['0x02' + '11'.repeat(32), '0x' + '22'.repeat(48), from, ethers.toBeHex(stake, 32), ethers.ZeroHash])
  // The local engine currently skips validator signatures and uses authAddress as the author lookup.
  await (await signer.sendTransaction({
    to: '0x0000000000000000000000000000000000001000', value: stake, gasLimit: 3000000,
    data: staking.encodeFunctionData('addValidator', [payload, '0x' + '00'.repeat(64), '0x' + '00'.repeat(96)])
  })).wait()
  const metadata = JSON.parse(await remix.call('fileManager', 'readFile', 'artifacts/StakingDemo.json'))
  const contract = await new ethers.ContractFactory(metadata.abi, metadata.data.bytecode.object, signer).deploy()
  await contract.waitForDeployment()
  const stakeTx = await contract.stake(1, { value: stake, gasLimit: 3000000 })
  await stakeTx.wait()
  const transition = action => provider.send('monad_stakingTransition', [action])
  await transition({ kind: 'snapshot' })
  await transition({ kind: 'epochChange', epoch: '0x1' })
  await transition({ kind: 'reward', author: from, amount: ethers.toQuantity(ethers.parseEther('10')) })
  await (await contract.claim(1, { gasLimit: 3000000 })).wait()
  if (await provider.getBalance(await contract.getAddress()) !== ethers.parseEther('5')) throw new Error('Unexpected staking reward')
  await (await contract.unstake(1, stake, 7, { gasLimit: 3000000 })).wait()
  const early = await contract.withdraw(1, 7, { gasLimit: 3000000 })
  await early.wait()
  if (await contract.lastSuccess()) throw new Error('Early withdrawal should fail')
  for (const epoch of ['0x2', '0x3']) {
    await transition({ kind: 'snapshot' })
    await transition({ kind: 'epochChange', epoch })
  }
  const withdrawal = await contract.withdraw(1, 7, { gasLimit: 3000000 })
  await withdrawal.wait()
  if (await provider.getBalance(await contract.getAddress()) !== stake + ethers.parseEther('5')) throw new Error('Unexpected withdrawal balance')
  const rejected = await provider.send('eth_sendTransaction', [{ from, to: await contract.getAddress(),
    data: contract.interface.encodeFunctionData('rejectAfterStake', [1]), value: '0xde0b6b3a7640000', gas: '0x2dc6c0' }])
  if ((await provider.getTransactionReceipt(rejected)).status !== 0) throw new Error('Expected caller rollback')
  console.log(`staking-workflow-ok ${await contract.getAddress()} ${stakeTx.hash} ${early.hash} ${withdrawal.hash} ${rejected}`)
} finally { provider.destroy() }
