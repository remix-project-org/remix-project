/* global remix, web3Provider */
import { ethers } from 'ethers'

// Compile EventQueries.sol, then run with Ethers v6 on any local Monad fork.
let installed = false
let polled = false
let ready = false
let removed = false
let blockPolls = 0
let lastBlock
let filter
let blocks
const provider = new ethers.BrowserProvider({ request: async payload => {
  const result = await web3Provider.request(payload)
  if (payload.method === 'eth_newFilter') installed = true
  if (payload.method === 'eth_getFilterChanges' && installed) polled = true
  if (payload.method === 'eth_blockNumber') {
    lastBlock = result
    blockPolls++
    if (polled) ready = true
  }
  if (payload.method === 'eth_uninstallFilter') removed = true
  return result
} }, undefined, { cacheTimeout: -1, pollingInterval: 50 })
const until = async (condition, description) => {
  const deadline = Date.now() + 20_000
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
  if (!condition()) throw new Error(description)
}

try {
  const selected = await remix.call('udappEnv', 'getSelectedAccount')
  const signer = await provider.getSigner(selected)
  const from = await signer.getAddress()
  const metadata = JSON.parse(await remix.call('fileManager', 'readFile', 'artifacts/EventQueries.json'))
  const contract = await new ethers.ContractFactory(metadata.abi, metadata.data.bytecode.object, signer).deploy()
  await contract.waitForDeployment()
  const address = await contract.getAddress()
  const received = []
  const once = []
  const listener = (sender, key, value, note, event) => received.push({ sender, key, value, note, hash: event.log.transactionHash })
  await contract.on('Updated', listener)
  await contract.once('Updated', (sender, key, value, note) => once.push({ sender, key, value, note }))
  // Wait for both the filter and block polling baseline before this instant-mining VM emits an event.
  await until(() => ready, 'Event listener did not finish starting its polling filter')
  const topic = contract.interface.getEvent('Updated').topicHash
  filter = await provider.send('eth_newFilter', [{ address, fromBlock: 'earliest', topics: [topic] }])
  blocks = await provider.send('eth_newBlockFilter', [])
  const first = await (await contract.store(1, 11, 'first')).wait()
  await until(() => received.length === 1 && once.length === 1, 'First event was not delivered')
  // Let ethers rearm its block subscription before the next instantly mined transaction.
  const nextPoll = blockPolls
  await until(() => blockPolls > nextPoll && lastBlock === ethers.toQuantity(first.blockNumber), 'Event listener did not resume polling')
  const second = await (await contract.store(2, 22, 'second')).wait()
  await until(() => received.length === 2, 'Second event was not delivered')
  if (received[0].sender !== from || received[0].key !== 1n || received[0].value !== 11n || received[0].note !== 'first' ||
      received[0].hash !== first.hash || received[1].hash !== second.hash || once.length !== 1) throw new Error('Event decoding or once delivery failed')
  await contract.off('Updated', listener)
  await until(() => removed, 'Removing the listener did not uninstall its filter')
  await (await contract.store(3, 33, 'after removal')).wait()
  const rejected = await provider.send('eth_sendTransaction', [{ from, to: address,
    data: contract.interface.encodeFunctionData('reject', [4]), gas: '0x493e0' }])
  if ((await provider.send('eth_getTransactionReceipt', [rejected])).status !== '0x0') throw new Error('Expected the event transaction to revert')
  await contract.store.staticCall(5, 55, 'simulation')
  const historical = await contract.queryFilter(contract.filters.Updated(from, [1, 3]), 0, 'latest')
  if (historical.length !== 2 || historical[0].args.value !== 11n || historical[1].args.value !== 33n) throw new Error('Historical event query failed')
  const changes = await provider.send('eth_getFilterChanges', [filter])
  const history = await provider.send('eth_getFilterLogs', [filter])
  if (changes.length !== 3 || history.length !== 3 || received.length !== 2 || once.length !== 1) throw new Error('Unexpected event delivery')
  if ((await provider.send('eth_getFilterChanges', [filter])).length) throw new Error('Filter delivered duplicate events')
  if ((await provider.send('eth_getFilterChanges', [blocks])).length !== 4) throw new Error('Block filter included simulations or missed a reverted transaction')
  if (await contract.value() !== 33n) throw new Error('Simulation or revert changed committed state')
  console.log(`events-workflow-ok ${address} ${first.hash} ${rejected}`)
} finally {
  try {
    for (const id of [filter, blocks]) if (id) await provider.send('eth_uninstallFilter', [id])
  } finally { provider.destroy() }
}
