/* global ethereum */
'use strict'
import { RLP } from '@ethereumjs/rlp'
import { hash } from '@remix-project/remix-lib'
import { bytesToHex, hexToBytes, Account, bigIntToHex, MapDB, toBytes, bytesToBigInt, BIGINT_0, BIGINT_1, equalsBytes, createAccount, PrefixedHexString, Address } from '@ethereumjs/util'
import { JsonRpcProvider } from 'ethers'
import { execution } from '@remix-project/remix-lib'
const { LogsManager } = execution
import { VmProxy } from './VmProxy'
import { createVM, VM } from '@ethereumjs/vm'
import { Common, ConsensusType, Mainnet, CommonOpts } from '@ethereumjs/common'
import { MerklePatriciaTrie, createMPT, verifyMerkleProof } from '@ethereumjs/mpt'
import { MerkleStateManager, MerkleStateManagerOpts } from '@ethereumjs/statemanager'
import { StateManagerInterface, StorageDump } from '@ethereumjs/common'
import { createEVM } from '@ethereumjs/evm'
import { Blockchain, DBSaveLookups, createBlockchain } from '@ethereumjs/blockchain'
import { Block, BlockHeader, createBlock, createBlockFromRLP } from '@ethereumjs/block'
import { TypedTransaction } from '@ethereumjs/tx'
import { State } from './provider'

/**
 * Options for constructing a {@link StateManager}.
 */
export interface DefaultStateManagerOpts {
  /**
   * A {@link Trie} instance
   */
  trie?: MerklePatriciaTrie
  /**
   * Option to prefix codehashes in the database. This defaults to `true`.
   * If this is disabled, note that it is possible to corrupt the trie, by deploying code
   * which code is equal to the preimage of a trie-node.
   * E.g. by putting the code `0x80` into the empty trie, will lead to a corrupted trie.
   */
  prefixCodeHashes?: boolean
}

/*
  extend vm state manager and instantiate VM
*/
class StateManagerCommonStorageDump extends MerkleStateManager {
  keyHashes: { [key: string]: string }
  constructor (opts: MerkleStateManagerOpts = {}) {
    super(opts)
    this.keyHashes = {}
  }

  getDb () {
    // @ts-ignore
    return this._trie.database().db
  }

  putStorage (address, key, value) {
    this.keyHashes[bytesToHex(hash.keccak(key))] = bytesToHex(key)
    return super.putStorage(address, key, value)
  }

  shallowCopy(): StateManagerCommonStorageDump {
    const copyState = new StateManagerCommonStorageDump({
      trie: this._trie.shallowCopy(false),
    })
    copyState.keyHashes = this.keyHashes
    return copyState
  }

  async dumpStorage (address): Promise<StorageDump> {
    await this.flush()
    const account = await this.getAccount(address)
    if (!account) {
      throw new Error(`dumpStorage f() can only be called for an existing account`)
    }
    const trie = this._getStorageTrie(address, account)

    const values = await trie.getValueMap().then((value) => {
      return value.values
    })
    const ret = {}
    for (const key in values) {
      ret[key] = {
        key: this.keyHashes[key],
        value: bytesToHex(RLP.decode(values[key] ?? new Uint8Array(0)) as Uint8Array)
      }
    }
    return ret
  }
}

export interface CustomEthersStateManagerOpts {
  provider: string | JsonRpcProvider
  blockTag: string
  /**
   * A {@link Trie} instance
   */
  trie?: MerklePatriciaTrie
}

class CustomEthersStateManager extends StateManagerCommonStorageDump {
  private provider: JsonRpcProvider
  private blockTag: string

  constructor(opts: CustomEthersStateManagerOpts) {
    super(opts)
    if (typeof opts.provider === 'string') {
      this.provider = new JsonRpcProvider(opts.provider)
    } else if (opts.provider instanceof JsonRpcProvider) {
      this.provider = opts.provider
    } else {
      throw new Error(`valid JsonRpcProvider or url required; got ${opts.provider}`)
    }

    this.blockTag = opts.blockTag
  }

  /**
   * Sets the new block tag used when querying the provider and clears the
   * internal cache.
   * @param blockTag - the new block tag to use when querying the provider
   */
  setBlockTag(blockTag: bigint | 'earliest'): void {
    this.blockTag = blockTag === 'earliest' ? blockTag : bigIntToHex(blockTag)
  }

  shallowCopy(): CustomEthersStateManager {
    const newState = new CustomEthersStateManager({
      provider: this.provider,
      blockTag: this.blockTag,
      trie: this._trie.shallowCopy(false),
    })
    return newState
  }

  /**
   * Gets the code corresponding to the provided `address`.
   * @param address - Address to get the `code` for
   * @returns {Promise<Buffer>} - Resolves with the code corresponding to the provided address.
   * Returns an empty `Buffer` if the account has no associated code.
   */
  async getCode(address: Address): Promise<Uint8Array> {
    let code = await super.getCode(address)
    if (code && code.length > 0) return code
    else {
      code = toBytes((await this.provider.getCode(address.toString(), this.blockTag)) as PrefixedHexString)
      await super.putCode(address, code)
      return code
    }
  }

  /**
   * Gets the storage value associated with the provided `address` and `key`. This method returns
   * the shortest representation of the stored value.
   * @param address -  Address of the account to get the storage for
   * @param key - Key in the account's storage to get the value for. Must be 32 bytes long.
   * @returns {Promise<Buffer>} - The storage value for the account
   * corresponding to the provided address at the provided key.
   * If this does not exist an empty `Buffer` is returned.
   */
  async getStorage(address: Address, key: Buffer): Promise<Uint8Array> {
    let storage = await super.getStorage(address, key)
    if (storage && storage.length > 0) return storage
    else {
      storage = toBytes((await this.provider.getStorage(
        address.toString(),
        bytesToBigInt(key),
        this.blockTag)) as PrefixedHexString
      )
      await super.putStorage(address, key, storage)
      return storage
    }
  }

  /**
   * Checks if an `account` exists at `address`
   * @param address - Address of the `account` to check
   */
  async accountExists(address: Address): Promise<boolean> {
    const account = await super.getAccount(address)
    if (!account.isEmpty()) return true

    // Get merkle proof for `address` from provider
    const proof = await this.provider.send('eth_getProof', [address.toString(), [], this.blockTag])

    const proofBuf = proof.accountProof.map((proofNode: string) => toBytes(proofNode as PrefixedHexString))

    const verified = await verifyMerkleProof(
      address.bytes,
      proofBuf
      //Buffer.from(keccak256(proofBuf[0])),
    )
    if (verified) {
      const codeHash = proof.codeHash === '0x0000000000000000000000000000000000000000000000000000000000000000' ? '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' : proof.codeHash
      const account = createAccount({
        balance: BigInt(proof.balance),
        nonce: BigInt(proof.nonce),
        codeHash: hexToBytes(codeHash)
        // storageRoot: toBuffer([]), // we have to remove this in order to force the creation of the Trie in the local state.
      })
      super.putAccount(address, account)
    }
    // if not verified (i.e. verifyProof returns null), account does not exist
    return verified === null ? false : true
  }

  /**
   * Retrieves an account from the provider and stores in the local trie
   * @param address Address of account to be retrieved from provider
   * @private
   */
  async getAccountFromProvider(address: Address): Promise<Account> {
    let accountData
    try {
      accountData = await this.provider.send('eth_getProof', [
        address.toString(),
        [],
        this.blockTag,
      ])
    } catch (e) {
      console.log(e)
    }
    let account
    if (!accountData) {
      account = createAccount({
        balance: BigInt(0),
        nonce: BigInt(0),
        codeHash: hexToBytes('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470')
      })
    } else {
      const codeHash = accountData.codeHash === '0x0000000000000000000000000000000000000000000000000000000000000000' ? '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' : accountData.codeHash
      account = createAccount({
        balance: BigInt(accountData.balance),
        nonce: BigInt(accountData.nonce),
        codeHash: hexToBytes(codeHash)
        // storageRoot: toBuffer([]), // we have to remove this in order to force the creation of the Trie in the local state.
      })
    }
    return account
  }
}

export type CurrentVm = {
  vm: VM,
  web3vm: VmProxy,
  stateManager: StateManagerInterface,
  common: Common,
  baseBlockNumber: string // hex
}

export class VMCommon extends Common {

  constructor (opts: CommonOpts) {
    super(opts)
  }

  /**
    * Always return the fork set at initialization
    */
  setHardforkBy() {
    return this._hardfork;
  }
}

const overrideBlockchain = (blockchain: Blockchain, context: VMContext) => {
  /**
   * Find the common ancestor of the new block and the old block.
   * @param newHeader - the new block header
   */
  const findCommonAncestor = async (newHeader: BlockHeader) => {
    if (!(blockchain as any)._headHeaderHash) throw new Error('No head header set')
    const ancestorHeaders = new Set<BlockHeader>()

    let header = await (blockchain as any)._getHeader((blockchain as any)._headHeaderHash)
    if (header.number > newHeader.number) {
      header = await (blockchain as any).getCanonicalHeader(newHeader.number)
      ancestorHeaders.add(header)
    } else {
      while (header.number !== newHeader.number && newHeader.number > BIGINT_0) {
        try {
          newHeader = await (blockchain as any)._getHeader(newHeader.parentHash, newHeader.number - BIGINT_1)
          ancestorHeaders.add(newHeader)
        } catch (err) {
          // parent header not found, we reach the start of the fork, jumping to the beginning.
          if (context.blocks['0x0']) newHeader = context.blocks['0x0'].header
          break
        }
      }
    }
    if (header.number !== newHeader.number) {
      throw new Error('Failed to find ancient header')
    }
    while (!equalsBytes(header.hash(), newHeader.hash()) && header.number > BIGINT_0) {
      header = await (blockchain as any).getCanonicalHeader(header.number - BIGINT_1)
      ancestorHeaders.add(header)
      newHeader = await (blockchain as any)._getHeader(newHeader.parentHash, newHeader.number - BIGINT_1)
      ancestorHeaders.add(newHeader)
    }
    if (!equalsBytes(header.hash(), newHeader.hash())) {
      throw new Error('Failed to find ancient header')
    }
    return {
      commonAncestor: header,
      ancestorHeaders: Array.from(ancestorHeaders),
    }
  }

  /**
   * Given a `header`, put all operations to change the canonical chain directly
   * into `ops`. This walks the supplied `header` backwards. It is thus assumed
   * that this header should be canonical header. For each header the
   * corresponding hash corresponding to the current canonical chain in the DB
   * is checked. If the number => hash reference does not correspond to the
   * reference in the DB, we overwrite this reference with the implied number =>
   * hash reference Also, each `_heads` member is checked; if these point to a
   * stale hash, then the hash which we terminate the loop (i.e. the first hash
   * which matches the number => hash of the implied chain) is put as this stale
   * head hash. The same happens to _headBlockHash.
   * @param header - The canonical header.
   * @param ops - The database operations list.
   * @hidden
   */
  const _rebuildCanonical = async (header: BlockHeader, ops: any[]) => {
    let currentNumber = header.number
    let currentCanonicalHash: Uint8Array = header.hash()

    // track the staleHash: this is the hash currently in the DB which matches
    // the block number of the provided header.
    let staleHash: Uint8Array | false = false
    const staleHeads: string[] = []
    let staleHeadBlock = false

    const loopCondition = async () => {
      staleHash = await (blockchain as any).safeNumberToHash(currentNumber)
      currentCanonicalHash = header.hash()
      return staleHash === false || !equalsBytes(currentCanonicalHash, staleHash)
    }

    while (await loopCondition()) {
      // handle genesis block
      const blockHash = header.hash()
      const blockNumber = header.number

      if (blockNumber === BIGINT_0) {
        break
      }

      DBSaveLookups(blockHash, blockNumber).map((op) => {
        ops.push(op)
      })

      // mark each key `_heads` which is currently set to the hash in the DB as
      // stale to overwrite later in `_deleteCanonicalChainReferences`.
      for (const name of Object.keys((blockchain as any)._heads)) {
        if (staleHash && equalsBytes((blockchain as any)._heads[name], staleHash)) {
          staleHeads.push(name)
        }
      }
      // flag stale headBlock for reset
      if (
        staleHash &&
        (blockchain as any)._headBlockHash !== undefined &&
        equalsBytes((blockchain as any)._headBlockHash, staleHash) === true
      ) {
        staleHeadBlock = true
      }

      try {
        header = await (blockchain as any)._getHeader(header.parentHash, --currentNumber)
      } catch (e) {
        break
      }
    }
    // When the stale hash is equal to the blockHash of the provided header,
    // set stale heads to last previously valid canonical block
    for (const name of staleHeads) {
      (blockchain as any)._heads[name] = currentCanonicalHash
    }
    // set stale headBlock to last previously valid canonical block
    if (staleHeadBlock) {
      (blockchain as any)._headBlockHash = currentCanonicalHash
    }
  }

  (blockchain as any)['findCommonAncestor'] = findCommonAncestor;
  (blockchain as any)['_rebuildCanonical'] = _rebuildCanonical
}

/*
  trigger contextChanged, web3EndpointChanged
*/
export class VMContext {
  currentFork: string
  blockGasLimitDefault: number
  blockGasLimit: number
  blocks: Record<string, Block>
  blockByTxHash: Record<string, Block>
  txByHash: Record<string, TypedTransaction>
  currentVm: CurrentVm
  web3vm: VmProxy
  logsManager: any // LogsManager
  exeResults: Record<string, TypedTransaction>
  nodeUrl: string
  /*
    This is the actual number of blocks that are added to the state.
  */
  latestBlockNumber: string
  /*
    This is the number of block that VMContext is instantiated with.
    The final amount of blocks will be `latestBlockNumber` and the value either `blockNumber` or `baseBlockNumber` + `blockNumber`
  */
  private blockNumber: number | 'latest'
  /*
    When a VM is using a live state, baseBlockNumber is the number at which the live state is forked.
  */
  baseBlockNumber: string
  stateDb: State
  rawBlocks: string[]
  serializedBlocks: Uint8Array[]

  constructor (fork?: string, nodeUrl?: string, blockNumber?: number | 'latest', stateDb?: State, blocksData?: string[], baseBlockNumber?: string) {
    this.blockGasLimitDefault = 4300000
    this.blockGasLimit = this.blockGasLimitDefault
    this.currentFork = fork || 'osaka'
    this.nodeUrl = nodeUrl
    this.stateDb = stateDb
    this.blockNumber = blockNumber || 0
    this.baseBlockNumber = baseBlockNumber
    this.blocks = {}
    this.latestBlockNumber = '0x0'
    this.blockByTxHash = {}
    this.txByHash = {}
    this.exeResults = {}
    this.logsManager = new LogsManager()
    this.rawBlocks = blocksData
    this.serializedBlocks = []
  }

  async init () {
    this.currentVm = await this.createVm(this.currentFork)
  }

  async createVm (hardfork) {
    let stateManager: StateManagerInterface
    // state trie

    const db = this.stateDb ? new Map(Object.entries(this.stateDb).map(([k, v]) => [k, hexToBytes(v as any)])) : new Map()
    const mapDb = new MapDB(db)
    const trie = await createMPT({ useKeyHashing: true, db: mapDb, useRootPersistence: true })

    if (this.nodeUrl) {
      if (this.blockNumber !== 'latest') {
        // we already have the right value for the block number
      } else if (this.blockNumber === 'latest') {
        // resolve `latest` to the actual block number
        const provider = new JsonRpcProvider(this.nodeUrl)
        this.blockNumber = await provider.getBlockNumber()
      }

      stateManager = new CustomEthersStateManager({
        provider: this.nodeUrl,
        blockTag: this.baseBlockNumber || '0x' + this.blockNumber.toString(16),
        trie
      })
    } else {
      stateManager = new StateManagerCommonStorageDump({ trie })
    }

    const consensusType = hardfork === 'berlin' || hardfork === 'london' ? ConsensusType.ProofOfWork : ConsensusType.ProofOfStake
    const difficulty = consensusType === ConsensusType.ProofOfStake ? 0 : 69762765929000

    const common = new VMCommon({ chain: Mainnet, hardfork })
    const blocks = (this.rawBlocks || []).map(block => {
      const serializedBlock = hexToBytes(block as any)
      this.serializedBlocks.push(serializedBlock)
      return createBlockFromRLP(serializedBlock, { common })
    })
    const genesisBlock: Block = blocks.length > 0 && (blocks[0] || {}).isGenesis ? blocks[0] : createBlock({
      header: {
        timestamp: (new Date().getTime() / 1000 | 0),
        number: BIGINT_0,
        coinbase: '0x0e9281e9c6a0808672eaba6bd1220e144c9bb07a',
        difficulty,
        gasLimit: 8000000
      }
    }, { common })

    const blockchain = await createBlockchain({ common, validateBlocks: false, validateConsensus: false, genesisBlock })
    overrideBlockchain(blockchain, this)

    const evm = await createEVM({ common, allowUnlimitedContractSize: true, stateManager, blockchain })

    const vm = await createVM({
      common,
      activatePrecompiles: true,
      stateManager,
      blockchain,
      evm
    })

    if (this.nodeUrl) {
      if (!this.baseBlockNumber && this.blockNumber !== 'latest') {
        // the baseBlockNumber isn't set.
        // this means we are likely loading a VM mainnet fork from scratch,
        // so we take the current live block number as the baseBlockNumber.
        this.baseBlockNumber = '0x' + this.blockNumber.toString(16)
        this.latestBlockNumber = this.baseBlockNumber
      } else if (this.baseBlockNumber && this.blockNumber !== 'latest') {
        // the baseBlockNumber is set.
        // this means we are likely loading a VM mainnet fork from a previously saved state,
        // the latestBlockNumber is baseBlockNumber +
        this.latestBlockNumber = '0x' + (parseInt(this.baseBlockNumber) + blocks.length).toString(16)
      }
    } else {
      // it's a standard VM so everything starts from 0.
      this.baseBlockNumber = '0x0'
      this.latestBlockNumber = '0x' + this.blockNumber.toString(16)
    }

    // VmProxy and VMContext are very intricated.
    // VmProxy is used to track the EVM execution (to listen on opcode execution, in order for instance to generate the VM trace)
    const web3vm = new VmProxy(this)
    web3vm.setVM(vm)
    this.addBlock(genesisBlock, true)
    if (blocks.length > 0) blocks.splice(0, 1)
    for (const block of blocks) {
      await blockchain.putBlock(block)
      this.addBlock(block, false, false, web3vm)
    }

    return { vm, web3vm, stateManager, common, blocks, baseBlockNumber: this.baseBlockNumber }
  }

  getCurrentFork () {
    return this.currentFork
  }

  web3 () {
    return this.currentVm.web3vm
  }

  vm () {
    return this.currentVm.vm
  }

  vmObject () {
    return this.currentVm
  }

  addBlock (block: Block, genesis?: boolean, isCall?: boolean, web3vm?: VmProxy) {
    let blockNumber
    if (genesis) {
      blockNumber = 0
    } else if (this.baseBlockNumber) {
      blockNumber = BigInt(this.baseBlockNumber) + block.header.number
    } else {
      blockNumber = block.header.number
    }
    let blockNumberHex = bigIntToHex(blockNumber)
    if (blockNumberHex === '0x') blockNumberHex = '0x0'

    this.blocks[bytesToHex(block.hash())] = block
    this.blocks[blockNumberHex] = block
    this.latestBlockNumber = blockNumberHex

    if (!isCall && !genesis && web3vm) this.logsManager.checkBlock(blockNumberHex, block, web3vm)
    if (!isCall && !genesis && !web3vm) this.logsManager.checkBlock(blockNumberHex, block, this.web3())
  }

  trackTx (txHash, block, tx) {
    this.blockByTxHash[txHash] = block
    this.txByHash[txHash] = tx
  }

  trackExecResult (tx, execReult) {
    this.exeResults[tx] = execReult
  }
}
