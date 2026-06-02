import React, { useState, useContext } from 'react'
import { DeployedContractsAppContext } from '../contexts'
import { DeployedContract } from '../types'
import { createWalletClient, createPublicClient, custom, namehash, keccak256, toBytes, type Hex } from 'viem'
import { mainnet } from 'viem/chains'

// ENS v1 Ethereum Mainnet contract addresses used by Enscribe.
const ENS_CONTRACTS = {
  registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Hex,
  nameWrapper: '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401' as Hex,
  publicResolver: '0xF29100983E058B709F3D539b0c765937B804AC15' as Hex,
  reverseRegistrar: '0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb' as Hex,
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Hex

const ENS_EXPLORER_BASE = 'https://app.ens.domains'
const ETHERSCAN_BASE = 'https://etherscan.io'

const PARENT_NAME = 'remixcontract.eth'

type NameStatus = 'idle' | 'checking' | 'available' | 'reusable' | 'current' | 'taken' | 'error'

type NameCheck = {
  status: Exclude<NameStatus, 'checking'>
  resolver?: Hex
  resolvedAddress?: Hex
  error?: string
}

const sanitizeLabel = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const getDefaultLabel = (contract: DeployedContract) => {
  const contractName = sanitizeLabel(contract.name || contract.contractData?.contract?.name || '')
  if (contractName) return contractName
  return `contract-${contract.address.slice(2, 8).toLowerCase()}`
}

const addressesEqual = (a?: string | null, b?: string | null) => {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

// --- ABIs ---

const ENS_REGISTRY_ABI = [
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'resolver',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'recordExists',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'setSubnodeRecord',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'label', type: 'bytes32' },
      { name: 'owner', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'ttl', type: 'uint64' },
    ],
    outputs: [],
  },
] as const

const NAME_WRAPPER_ABI = [
  {
    name: 'setSubnodeRecord',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'parentNode', type: 'bytes32' },
      { name: 'label', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'ttl', type: 'uint64' },
      { name: 'fuses', type: 'uint32' },
      { name: 'expiry', type: 'uint64' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'isWrapped',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

const PUBLIC_RESOLVER_ABI = [
  {
    name: 'setAddr',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'a', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'addr',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

const REVERSE_REGISTRAR_ABI = [
  {
    name: 'setNameForAddr',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'addr', type: 'address' },
      { name: 'owner', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'name', type: 'string' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const

const OWNABLE_ABI = [
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

interface EnsNamingProps {
  contract: DeployedContract
  onClose: () => void
}

type EnsStep = 'input' | 'progress' | 'reverse' | 'done' | 'error'

export function EnsNaming({ contract, onClose }: EnsNamingProps) {
  const { plugin, themeQuality } = useContext(DeployedContractsAppContext)

  const [label, setLabel] = useState(getDefaultLabel(contract))
  const [step, setStep] = useState<EnsStep>('input')
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [reverseDone, setReverseDone] = useState(false)
  const [hasOwnable, setHasOwnable] = useState(false)
  const [nameStatus, setNameStatus] = useState<NameStatus>('idle')
  const [nameStatusMsg, setNameStatusMsg] = useState('')
  const [resolvedAddress, setResolvedAddress] = useState<Hex | null>(null)

  const fullName = `${label}.${PARENT_NAME}`

  // Check if the contract has owner() function (Ownable)
  React.useEffect(() => {
    const abi = contract.abi || contract.contractData?.abi || []
    const hasOwner = abi.some((item: any) =>
      item.type === 'function' && item.name === 'owner' && item.inputs?.length === 0
    )
    setHasOwnable(hasOwner)
  }, [contract])

  const getProvider = () => {
    const provider = (window as any).ethereum
    if (!provider) throw new Error('No wallet provider found. Please install MetaMask.')
    return provider
  }

  const getPublicClient = async () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: custom(getProvider()),
    })

    const chainId = await publicClient.getChainId()
    if (chainId !== 1) {
      throw new Error(`Please switch MetaMask to Ethereum Mainnet (chain ID 1). Current: ${chainId}`)
    }

    return publicClient
  }

  const getClients = async () => {
    const provider = getProvider()

    const walletClient = createWalletClient({
      chain: mainnet,
      transport: custom(provider),
    })

    const publicClient = createPublicClient({
      chain: mainnet,
      transport: custom(provider),
    })

    const [account] = await walletClient.requestAddresses()
    await getPublicClient()

    return { walletClient, publicClient, account }
  }

  const checkName = async (publicClient: any): Promise<NameCheck> => {
    if (!label) {
      return { status: 'idle' }
    }

    const fullNode = namehash(fullName)
    const exists = await publicClient.readContract({
      address: ENS_CONTRACTS.registry,
      abi: ENS_REGISTRY_ABI,
      functionName: 'recordExists',
      args: [fullNode],
    })

    if (!exists) {
      return { status: 'available' }
    }

    const resolver = await publicClient.readContract({
      address: ENS_CONTRACTS.registry,
      abi: ENS_REGISTRY_ABI,
      functionName: 'resolver',
      args: [fullNode],
    }) as Hex

    if (resolver === ZERO_ADDRESS) {
      return { status: 'taken', resolver }
    }

    let currentAddr: Hex | null = null
    try {
      currentAddr = await publicClient.readContract({
        address: resolver,
        abi: PUBLIC_RESOLVER_ABI,
        functionName: 'addr',
        args: [fullNode],
      }) as Hex
    } catch (e: any) {
      return { status: 'taken', resolver, error: e.shortMessage || e.message }
    }

    if (addressesEqual(currentAddr, contract.address)) {
      return { status: 'current', resolver, resolvedAddress: currentAddr }
    }

    if (resolver.toLowerCase() === ENS_CONTRACTS.publicResolver.toLowerCase() && currentAddr === ZERO_ADDRESS) {
      return { status: 'reusable', resolver, resolvedAddress: currentAddr }
    }

    return { status: 'taken', resolver, resolvedAddress: currentAddr }
  }

  React.useEffect(() => {
    let cancelled = false

    if (!label) {
      setNameStatus('idle')
      setNameStatusMsg('Enter a label to check availability.')
      setResolvedAddress(null)
      return
    }

    setNameStatus('checking')
    setNameStatusMsg('Checking ENS name...')
    setResolvedAddress(null)

    const timeout = setTimeout(async () => {
      try {
        const publicClient = await getPublicClient()
        const result = await checkName(publicClient)
        if (cancelled) return

        setNameStatus(result.status)
        setResolvedAddress(result.resolvedAddress || null)

        if (result.status === 'available') {
          setNameStatusMsg(`${fullName} is available.`)
        } else if (result.status === 'reusable') {
          setNameStatusMsg(`${fullName} already exists but has no address record. Forward can be set.`)
        } else if (result.status === 'current') {
          setNameStatusMsg(`${fullName} already points to this contract.`)
        } else if (result.status === 'taken') {
          setNameStatusMsg(`${fullName} already exists. Choose another label for a clean demo.`)
        } else if (result.status === 'error') {
          setNameStatusMsg(result.error || 'Failed to check ENS name.')
        }
      } catch (e: any) {
        if (cancelled) return
        setNameStatus('error')
        setNameStatusMsg(e.shortMessage || e.message)
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [label, fullName, contract.address])

  const handleForward = async () => {
    try {
      setStep('progress')
      setStatusMsg('Connecting...')
      setErrorMsg('')

      const { walletClient, publicClient, account } = await getClients()
      const parentNode = namehash(PARENT_NAME)
      const fullNode = namehash(fullName)
      const labelHash = keccak256(toBytes(label))
      const nameCheck = await checkName(publicClient)

      if (nameCheck.status === 'taken') {
        throw new Error(`${fullName} already exists${nameCheck.resolvedAddress ? ` and points to ${nameCheck.resolvedAddress}` : ''}. Choose another label for this demo.`)
      }

      // Verify ownership via NameWrapper or ENS Registry, depending on whether the parent is wrapped.
      setStatusMsg('Verifying ownership...')
      const isWrapped = await publicClient.readContract({
        address: ENS_CONTRACTS.nameWrapper,
        abi: NAME_WRAPPER_ABI,
        functionName: 'isWrapped',
        args: [parentNode],
      })

      const parentOwner = isWrapped
        ? await publicClient.readContract({
          address: ENS_CONTRACTS.nameWrapper,
          abi: NAME_WRAPPER_ABI,
          functionName: 'ownerOf',
          args: [BigInt(parentNode)],
        }) as string
        : await publicClient.readContract({
          address: ENS_CONTRACTS.registry,
          abi: ENS_REGISTRY_ABI,
          functionName: 'owner',
          args: [parentNode],
        }) as string

      await plugin.call('terminal', 'log', { type: 'info', value: `[ENS] Owner of ${PARENT_NAME}: ${parentOwner}` })

      if (!addressesEqual(parentOwner, account)) {
        throw new Error(`You don't own ${PARENT_NAME}.\nOwner: ${parentOwner}\nYour address: ${account}`)
      }

      if (nameCheck.status === 'available') {
        setStatusMsg(`Creating: ${fullName}...`)
        await plugin.call('terminal', 'log', { type: 'info', value: `[ENS] Creating subname: ${fullName}` })

        const subnameTx = isWrapped
          ? await walletClient.writeContract({
            chain: mainnet,
            address: ENS_CONTRACTS.nameWrapper,
            abi: NAME_WRAPPER_ABI,
            functionName: 'setSubnodeRecord',
            args: [parentNode, label, account, ENS_CONTRACTS.publicResolver, BigInt(0), 0, BigInt(0)],
            account,
          })
          : await walletClient.writeContract({
            chain: mainnet,
            address: ENS_CONTRACTS.registry,
            abi: ENS_REGISTRY_ABI,
            functionName: 'setSubnodeRecord',
            args: [parentNode, labelHash, account, ENS_CONTRACTS.publicResolver, BigInt(0)],
            account,
          })

        await publicClient.waitForTransactionReceipt({ hash: subnameTx })
        await plugin.call('terminal', 'log', { type: 'info', value: `✅ Subname created (tx: ${subnameTx})` })
      }

      if (nameCheck.status !== 'current') {
        setStatusMsg(`Setting: ${fullName} -> ${contract.address}...`)
        const forwardTx = await walletClient.writeContract({
          chain: mainnet,
          address: ENS_CONTRACTS.publicResolver,
          abi: PUBLIC_RESOLVER_ABI,
          functionName: 'setAddr',
          args: [fullNode, contract.address as Hex],
          account,
        })
        await publicClient.waitForTransactionReceipt({ hash: forwardTx })
        await plugin.call('terminal', 'log', { type: 'info', value: `✅ Forward: ${fullName} -> ${contract.address} (tx: ${forwardTx})` })
      } else {
        await plugin.call('terminal', 'log', { type: 'info', value: `✅ Forward already set: ${fullName} -> ${contract.address}` })
      }

      // Verify
      setStatusMsg('Verifying...')
      try {
        const resolved = await publicClient.readContract({
          address: ENS_CONTRACTS.publicResolver,
          abi: PUBLIC_RESOLVER_ABI,
          functionName: 'addr',
          args: [fullNode],
        })
        await plugin.call('terminal', 'log', { type: 'info', value: `[Verify] ${fullName} -> ${resolved}` })
      } catch (e: any) {
        await plugin.call('terminal', 'log', { type: 'warn', value: `[Verify] Failed: ${e.shortMessage || e.message}` })
      }

      if (hasOwnable) {
        setStep('reverse')
        setStatusMsg('Forward complete! Set reverse for explorer display?')
      } else {
        setStep('done')
        setStatusMsg(`Forward complete!\n${fullName} -> ${contract.address}`)
      }

    } catch (e: any) {
      setStep('error')
      setErrorMsg(e.shortMessage || e.message)
      await plugin.call('terminal', 'log', { type: 'error', value: `ENS Forward Error: ${e.message}` })
    }
  }

  const handleReverse = async () => {
    try {
      setStep('progress')
      setStatusMsg('Setting reverse record...')
      setErrorMsg('')

      const { walletClient, publicClient, account } = await getClients()
      const owner = await publicClient.readContract({
        address: contract.address as Hex,
        abi: OWNABLE_ABI,
        functionName: 'owner',
        args: [],
      })

      if (!addressesEqual(owner, account)) {
        throw new Error(`Reverse can only be set by the contract owner.\nowner(): ${owner}\nYour address: ${account}`)
      }

      const tx = await walletClient.writeContract({
        chain: mainnet,
        address: ENS_CONTRACTS.reverseRegistrar,
        abi: REVERSE_REGISTRAR_ABI,
        functionName: 'setNameForAddr',
        args: [
          contract.address as Hex,
          account,
          ENS_CONTRACTS.publicResolver,
          fullName,
        ],
        account,
        gas: BigInt(200000),
      })
      await publicClient.waitForTransactionReceipt({ hash: tx })
      await plugin.call('terminal', 'log', { type: 'info', value: `✅ Reverse: ${contract.address} -> ${fullName}` })

      setReverseDone(true)
      setStep('done')
      setStatusMsg(`Complete!\nForward: ${fullName} -> ${contract.address}\nReverse: ${contract.address} -> ${fullName}`)

    } catch (e: any) {
      setStep('error')
      setErrorMsg(e.shortMessage || e.message)
      await plugin.call('terminal', 'log', { type: 'error', value: `ENS Reverse Error: ${e.message}` })
    }
  }

  const textColor = themeQuality === 'dark' ? 'white' : 'black'
  const subtextColor = 'var(--text-tertiary, #a2a3bd)'

  return (
    <div className="p-3 rounded mb-2" style={{ backgroundColor: 'var(--custom-onsurface-layer-3)', border: '1px solid var(--bs-border-color)' }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span style={{ color: textColor, fontWeight: 600, fontSize: '0.85rem' }}>
          <i className="fas fa-link me-1" /> ENS Naming (Mainnet PoC)
        </span>
        <button
          className="btn btn-sm"
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: subtextColor, fontSize: '1.2rem', lineHeight: 1, padding: 0 }}
        >×</button>
      </div>

      {/* Input step */}
      {step === 'input' && (
        <>
          <div className="mb-2 p-2 rounded" style={{ backgroundColor: 'rgba(255, 183, 77, 0.1)', fontSize: '0.7rem', color: '#ffb74d' }}>
            <i className="fas fa-exclamation-triangle me-1" />
            <strong>Mainnet</strong> - Transactions cost real ETH. Forward can send up to 2 transactions.
          </div>
          <div className="mb-2">
            <label className="small mb-1 d-block" style={{ color: subtextColor }}>Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(sanitizeLabel(e.target.value))}
              className="form-control form-control-sm"
              placeholder="storage"
              style={{ backgroundColor: 'var(--bs-body-bg)', color: textColor, fontSize: '0.8rem' }}
            />
          </div>
          <div className="mb-2 p-2 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', fontSize: '0.75rem' }}>
            <div style={{ color: subtextColor }}>Preview:</div>
            <div style={{ color: '#64c4ff', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {fullName}
            </div>
            <div style={{ color: subtextColor, marginTop: '4px' }}>
              -&gt; {contract.address}
            </div>
          </div>
          <div
            className="mb-2 p-2 rounded"
            style={{
              backgroundColor: nameStatus === 'taken' || nameStatus === 'error' ? 'rgba(255, 119, 119, 0.1)' : 'rgba(100, 196, 255, 0.05)',
              fontSize: '0.7rem',
              color: nameStatus === 'taken' || nameStatus === 'error' ? '#ff7777' : subtextColor,
            }}
          >
            <i className={`${nameStatus === 'available' || nameStatus === 'current' ? 'fas fa-check-circle' : nameStatus === 'checking' ? 'fas fa-spinner fa-spin' : 'fas fa-info-circle'} me-1`} />
            {nameStatusMsg}
            {resolvedAddress && nameStatus === 'taken' && (
              <div style={{ marginTop: '4px', wordBreak: 'break-all' }}>
                Current: {resolvedAddress}
              </div>
            )}
          </div>
          {!hasOwnable && (
            <div className="mb-2 p-2 rounded" style={{ backgroundColor: 'rgba(255, 183, 77, 0.1)', fontSize: '0.7rem', color: '#ffb74d' }}>
              <i className="fas fa-info-circle me-1" />
              This contract does not implement Ownable. Only Forward (name -&gt; address) will be available.
            </div>
          )}
          <div className="mb-2 p-2 rounded" style={{ backgroundColor: 'rgba(100, 196, 255, 0.05)', fontSize: '0.7rem', color: subtextColor }}>
            <i className="fas fa-info-circle me-1" style={{ color: '#64c4ff' }} />
            Naming uses <strong style={{ color: textColor }}>{PARENT_NAME}</strong>. Reverse is available only for Ownable contracts.
          </div>
          <button
            className="btn btn-primary btn-sm w-100"
            onClick={handleForward}
            disabled={!label || nameStatus === 'checking' || nameStatus === 'taken' || nameStatus === 'error'}
          >
            <i className="fas fa-arrow-right me-1" />
            {nameStatus === 'current' ? 'Forward Already Set' : 'Set Forward Name'}
          </button>
        </>
      )}

      {/* Progress */}
      {step === 'progress' && (
        <div className="text-center py-2">
          <div className="spinner-border spinner-border-sm text-primary mb-2" />
          <div style={{ color: subtextColor, fontSize: '0.8rem' }}>{statusMsg}</div>
          <div className="mt-2" style={{ fontSize: '0.7rem', color: subtextColor }}>
            Confirm the transaction in MetaMask.
          </div>
        </div>
      )}

      {/* Reverse step */}
      {step === 'reverse' && (
        <div>
          <div className="p-2 rounded mb-2" style={{ backgroundColor: 'rgba(100, 196, 255, 0.1)', fontSize: '0.75rem', color: '#64c4ff' }}>
            <i className="fas fa-check-circle me-1" />
            Forward record set! {fullName} -&gt; {contract.address}
          </div>
          <div className="mb-2" style={{ fontSize: '0.75rem', color: subtextColor }}>
            <strong style={{ color: textColor }}>Set Reverse Name?</strong>
            <br />
            Allows Etherscan and wallets to display the ENS name for this contract address.
            Requires one additional Mainnet transaction.
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-primary btn-sm flex-fill" onClick={handleReverse}>
              <i className="fas fa-exchange-alt me-1" />
              Set Reverse
            </button>
            <button className="btn btn-outline-secondary btn-sm flex-fill" onClick={() => {
              setStep('done')
              setStatusMsg(`Forward complete!\n${fullName} -> ${contract.address}`)
            }}>
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Done */}
      {step === 'done' && (
        <div>
          <div className="p-2 rounded mb-2" style={{ backgroundColor: 'rgba(100, 196, 255, 0.1)', fontSize: '0.75rem' }}>
            <div style={{ color: '#64c4ff' }}>
              <i className="fas fa-check-circle me-1" /> Forward: {fullName} -&gt; {contract.address}
            </div>
            {reverseDone && (
              <div style={{ color: '#81c784', marginTop: '4px' }}>
                <i className="fas fa-check-circle me-1" /> Reverse: Etherscan will display the ENS name
              </div>
            )}
          </div>
          <div className="d-flex gap-2">
            <a
              href={`${ETHERSCAN_BASE}/address/${contract.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-primary btn-sm flex-fill"
              style={{ fontSize: '0.7rem' }}
            >
              <i className="fas fa-external-link-alt me-1" /> Etherscan
            </a>
            <a
              href={`${ENS_EXPLORER_BASE}/${fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-primary btn-sm flex-fill"
              style={{ fontSize: '0.7rem' }}
            >
              <i className="fas fa-external-link-alt me-1" /> ENS App
            </a>
          </div>
          <button className="btn btn-sm w-100 mt-2" onClick={onClose} style={{ color: subtextColor, fontSize: '0.75rem' }}>
            Close
          </button>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div>
          <div className="p-2 rounded mb-2" style={{ backgroundColor: 'rgba(255, 119, 119, 0.1)', fontSize: '0.75rem', color: '#ff7777' }}>
            <i className="fas fa-exclamation-triangle me-1" />
            {errorMsg}
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-primary btn-sm flex-fill" onClick={() => {
              setStep('input')
              setErrorMsg('')
            }}>
              Retry
            </button>
            <button className="btn btn-outline-secondary btn-sm flex-fill" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
