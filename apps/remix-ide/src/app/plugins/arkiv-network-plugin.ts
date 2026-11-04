import React from 'react'
import { Plugin } from '@remixproject/engine'
import { customAction } from '@remixproject/plugin-api'
import { bytesToHex, hexToBytes, sha256Hex } from './arkiv-utils'

const SCAN_BASE_URL = 'https://rabdi.explorer.arkiv.network'

const CONTENT_TYPES: Record<string, string> = {
  sol:  'text/x-solidity',
  vy:   'text/x-vyper',
  yul:  'text/x-yul',
  ts:   'text/typescript',
  js:   'text/javascript',
  json: 'application/json',
  md:   'text/markdown',
  txt:  'text/plain',
  toml: 'text/toml',
  yaml: 'text/yaml',
  yml:  'text/yaml',
}

const SHARE_WARNING =
  'This will write the file to the Arkiv Network as a public entity.\n\n' +
  '⚠  Two things to know before publishing:\n' +
  '• Published data is public — anyone who obtains the entity key can read it.\n' +
  '• Expiry removes the entity from active indexes but does not erase the on-chain record.'

type ExpiresInput = 'permanent' | { days: number }

const EXPIRY_OPTIONS: Array<{ value: string; label: string; expires: ExpiresInput }> = [
  { value: '7', label: '7 days', expires: { days: 7 } },
  { value: '30', label: '30 days', expires: { days: 30 } },
  { value: '90', label: '90 days', expires: { days: 90 } },
  { value: '365', label: '1 year', expires: { days: 365 } },
  { value: 'permanent', label: 'Permanent', expires: 'permanent' },
]

const profile = {
  name: 'arkivNetwork',
  displayName: 'Arkiv Network',
  description: 'Arkiv Network integration — stores and retrieves Remix artefacts on the Arkiv chain',
  methods: ['shareFile', 'saveDeployedContract', 'retrieveDeployedContracts'],
  events: ['fileSaved', 'contractSaved'],
  version: '1.0.0',
}

export interface SavedContractRecord {
  entityKey: string
  address: string
  name: string
  chainId: string
  savedAt: number
  expiryLabel: string
  abi: any[]
}

export interface RetrieveResult {
  contracts: SavedContractRecord[]
  cursor: string | undefined
  hasMore: boolean
}

export class ArkivNetworkPlugin extends Plugin {
  constructor() {
    super(profile)
  }

  async onActivation() {}

  onDeactivation() {
    this.off('arkivBasic', 'unlocked')
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async _computeAbiHash(abi: any[]): Promise<string> {
    const sorted = [...abi].sort((a, b) => {
      const ta = (a.type || '') as string, tb = (b.type || '') as string
      if (ta !== tb) return ta.localeCompare(tb)
      return ((a.name || '') as string).localeCompare(b.name || '')
    })
    const bytes = new TextEncoder().encode(JSON.stringify(sorted))
    const buf = await crypto.subtle.digest('SHA-256', bytes)
    return '0x' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  private async _logError(message: string): Promise<void> {
    await (this as any).call('terminal', 'log', { type: 'error', value: `[Arkiv] ${message}` })
  }

  /** Shows a modal with a retention-period picker. Returns null if the user cancels. */
  private _pickExpiry(
    title: string,
    topContent?: string | null,
  ): Promise<{ expires: ExpiresInput; label: string } | null> {
    const state = { expires: EXPIRY_OPTIONS[1].expires, label: EXPIRY_OPTIONS[1].label }

    const select = React.createElement(
      'select',
      {
        defaultValue: '30',
        onChange: (e: any) => {
          const opt = EXPIRY_OPTIONS.find(o => o.value === e.target.value)
          if (opt) { state.expires = opt.expires; state.label = opt.label }
        },
        style: {
          width: '100%', padding: '6px 8px', marginTop: 4,
          borderRadius: 4, border: '1px solid var(--bs-border-color)',
          backgroundColor: 'var(--bs-body-bg)', color: 'var(--bs-body-color)',
        },
      },
      ...EXPIRY_OPTIONS.map(o => React.createElement('option', { key: o.value, value: o.value }, o.label)),
    )

    const picker = React.createElement(
      'div',
      { style: { marginTop: topContent ? 12 : 0 } },
      React.createElement('label', { style: { fontWeight: 500, fontSize: '0.9rem' } }, 'Data retention:'),
      select,
    )

    const testingBanner = React.createElement(
      'p',
      { style: { fontSize: '0.75rem', color: 'var(--bs-warning)', marginBottom: 10 } },
      '⚠ For testing purposes only.',
    )

    const message = React.createElement(
      'div',
      null,
      testingBanner,
      topContent
        ? React.createElement('p', { style: { whiteSpace: 'pre-line', marginBottom: 12, fontSize: '0.85rem' } }, topContent)
        : null,
      picker,
    )

    return new Promise((resolve) => {
      ;(this as any).call('notification', 'modal', {
        id: 'arkivExpiry',
        title,
        message,
        okLabel: 'Confirm',
        cancelLabel: 'Cancel',
        okFn: () => resolve(state),
        cancelFn: () => resolve(null),
      })
    })
  }

  // ── shareFile ─────────────────────────────────────────────────────────────

  async shareFile(action: customAction): Promise<string> {
    const filePath = action.path[0]
    if (!filePath) throw new Error('Arkiv: no file selected')

    const fileName = filePath.split('/').pop() ?? filePath

    // ── 1. Warn + pick retention period ────────────────────────────────────
    const choice = await this._pickExpiry(
      `Publish "${fileName}" to Arkiv Network`,
      SHARE_WARNING,
    )
    if (!choice) throw new Error('Arkiv: publish cancelled')

    // ── 2. Read content & detect MIME type ──────────────────────────────────
    const fileContent: string = await (this as any).call('fileManager', 'readFile', filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

    const payload = bytesToHex(new TextEncoder().encode(fileContent))

    // ── 3. Ensure the arkiv signing session is open ─────────────────────────
    try {
      await (this as any).call('arkivBasic', 'unlock')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      await this._logError(`Could not unlock signing session: ${msg}`)
      throw e
    }

    // ── 4. Write the entity to the Arkiv chain ──────────────────────────────
    await (this as any).call('terminal', 'logHtml', {
      value: `<span>[Arkiv] Publishing "${fileName}" (${choice.label})…</span>`,
    })
    let result: { entityKey: string; txHash: string }
    try {
      result = await (this as any).call('arkivBasic', 'createEntity', {
        payload,
        contentType,
        attributes: {
          app:  { type: 'str', value: 'remix' },
          name: { type: 'str', value: fileName },
          path: { type: 'str', value: filePath },
        },
        expires: choice.expires,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      await this._logError(`Transaction failed while publishing "${filePath}": ${msg}`)
      throw e
    }

    // ── 5. Log transaction and share link to terminal ────────────────────────
    const shareUrl = `${window.location.origin}?arkiv=${result.entityKey}`
    const scanUrl = `${SCAN_BASE_URL}/tx/${result.txHash}`
    const html =
      `<span>[Arkiv] "${fileName}" published (${choice.label}) — tx: ` +
      `<a href="${scanUrl}" target="_blank" rel="noopener noreferrer">${result.txHash}</a>` +
      `<br />[Arkiv] Share link: <a href="${shareUrl}" target="_blank" rel="noopener noreferrer">${shareUrl}</a></span>`
    await (this as any).call('terminal', 'logHtml', { value: html })

    this.emit('fileSaved', filePath, result.entityKey)
    return result.entityKey
  }

  // ── saveDeployedContract ──────────────────────────────────────────────────

  async saveDeployedContract(params: {
    address: string
    chainId: string
    name: string
    abi: any[]
    walletAddress: string
    compilerVersion?: string
    sourcePath?: string
  }): Promise<{ entityKey: string; txHash: string }> {
    const { address, chainId, name, abi, walletAddress, compilerVersion, sourcePath } = params

    // ── 1. Pick retention period ─────────────────────────────────────────────
    const short = `${address.slice(0, 8)}…${address.slice(-4)}`
    const choice = await this._pickExpiry(
      `Save "${name}" to Arkiv`,
      `Contract: ${short}\nChain: ${chainId}`,
    )
    if (!choice) throw new Error('Arkiv: save cancelled')

    // ── 2. Unlock signing session ─────────────────────────────────────────────
    try {
      await (this as any).call('arkivBasic', 'unlock')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      await this._logError(`Could not unlock signing session: ${msg}`)
      throw e
    }

    await (this as any).call('terminal', 'logHtml', {
      value: `<span>[Arkiv] Saving "${name}" on chain ${chainId} (${choice.label})…</span>`,
    })

    const abiHash = await this._computeAbiHash(abi)

    // Compute source hash if a source path was provided
    let sourceHash = '0x' + '00'.repeat(32)
    if (sourcePath) {
      try {
        const src: string = await (this as any).call('fileManager', 'readFile', sourcePath)
        sourceHash = await sha256Hex(new TextEncoder().encode(src))
      } catch { /* source not available — leave as zero hash */ }
    }

    // ── 3. Upsert: query for existing, then create or patch ──────────────────
    let existingKey: string | undefined
    try {
      const existing = await (this as any).call('arkivBasic', 'query', {
        query: `app = str('remix') AND wallet_address = addr(${walletAddress}) AND chain_id = str('${chainId}') AND address = addr(${address}) AND type = str('remix-deployed-contract')`,
        limit: 1,
      })
      existingKey = existing.entities?.[0]?.key
    } catch {
      // query failure is non-fatal; fall through to create
    }

    const payloadHex = bytesToHex(new TextEncoder().encode(JSON.stringify(abi)))
    const savedAt = BigInt(Date.now()).toString()
    const contractName = name.slice(0, 42)

    let result: { entityKey: string; txHash: string }

    if (existingKey) {
      const patchResult: { txHash: string } = await (this as any).call('arkivBasic', 'patchEntity', {
        entityKey: existingKey,
        set: {
          payload: payloadHex,
          attributes: {
            abi_hash:          { type: 'bytes32', value: abiHash },
            source_hash:       { type: 'bytes32', value: sourceHash },
            saved_at:          { type: 'u64', value: savedAt },
            name:              { type: 'str', value: contractName },
            compiler_version:  { type: 'str', value: compilerVersion ?? '' },
            expiry_label:      { type: 'str', value: choice.label },
          },
        },
      })
      // Extend the on-chain expiry to match the user's chosen retention period
      await (this as any).call('arkivBasic', 'extendEntity', {
        entityKey: existingKey,
        expires: choice.expires,
      })
      result = { entityKey: existingKey, txHash: patchResult.txHash }
    } else {
      result = await (this as any).call('arkivBasic', 'createEntity', {
        payload: payloadHex,
        contentType: 'application/json',
        attributes: {
          app:              { type: 'str', value: 'remix' },
          type:             { type: 'str', value: 'remix-deployed-contract' },
          schema_version:   { type: 'str', value: '1' },
          wallet_address:   { type: 'addr', value: walletAddress },
          chain_id:         { type: 'str', value: chainId },
          address:          { type: 'addr', value: address },
          name:             { type: 'str', value: contractName },
          compiler_version: { type: 'str', value: compilerVersion ?? '' },
          abi_hash:         { type: 'bytes32', value: abiHash },
          source_hash:      { type: 'bytes32', value: sourceHash },
          saved_at:         { type: 'u64', value: savedAt },
          expiry_label:     { type: 'str', value: choice.label },
        },
        expires: choice.expires,
      })
    }

    const scanUrl = `${SCAN_BASE_URL}/tx/${result.txHash}`
    await (this as any).call('terminal', 'logHtml', {
      value: `<span>[Arkiv] "${name}" saved (${choice.label}) — tx: <a href="${scanUrl}" target="_blank" rel="noopener noreferrer">${result.txHash}</a></span>`,
    })

    this.emit('contractSaved', address, chainId, result.entityKey)
    return result
  }

  // ── retrieveDeployedContracts ─────────────────────────────────────────────

  async retrieveDeployedContracts(params: {
    walletAddress: string
    cursor?: string
  }): Promise<RetrieveResult> {
    const LIMIT = 50
    const offset = params.cursor ? Number(params.cursor) : 0

    const result = await (this as any).call('arkivBasic', 'query', {
      query: `app = str('remix') AND wallet_address = addr(${params.walletAddress}) AND type = str('remix-deployed-contract')`,
      limit: LIMIT,
      offset,
    })

    // Indexed fields come back as flat strings in `attributes`.
    // Non-indexed attributes (name, saved_at, expiry_label, …) are packed by the proxy
    // into `attributes.meta` as a hex-encoded JSON blob of typed { type, value } objects.
    // The ABI payload is at `attributes.payload` (hex), not at the top-level entity field.
    const attrVal = (a: any) => (a != null && typeof a === 'object' && 'value' in a ? a.value : a)

    const contracts: SavedContractRecord[] = (result.entities || [])
      .filter((e: any) => e.key)
      .map((e: any) => {
        const attrs = e.attributes || {}

        // Decode the meta blob
        let meta: Record<string, any> = {}
        try {
          if (attrs.meta) meta = JSON.parse(new TextDecoder().decode(hexToBytes(String(attrs.meta))))
        } catch { /* ignore malformed meta */ }

        // Decode the ABI from attrs.payload (hex)
        let abi: any[] = []
        try {
          if (attrs.payload) abi = JSON.parse(new TextDecoder().decode(hexToBytes(String(attrs.payload))))
        } catch { /* corrupted payload — return empty ABI */ }

        return {
          entityKey:   e.key as string,
          address:     String(attrVal(attrs.address) ?? ''),
          name:        String(attrVal(meta.name) ?? 'Unknown'),
          chainId:     String(attrVal(attrs.chain_id) ?? ''),
          savedAt:     Number(attrVal(meta.saved_at) ?? 0),
          expiryLabel: String(attrVal(meta.expiry_label) ?? 'unknown'),
          abi,
        }
      })

    const nextOffset = offset + contracts.length
    const hasMore = contracts.length === LIMIT

    return {
      contracts,
      cursor:  hasMore ? String(nextOffset) : undefined,
      hasMore,
    }
  }
}
