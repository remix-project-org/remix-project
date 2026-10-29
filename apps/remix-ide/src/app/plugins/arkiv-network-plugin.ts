import { Plugin } from '@remixproject/engine'
import { customAction } from '@remixproject/plugin-api'
import { createPublicClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { http, formatEther, type Hex } from 'viem'

// Update when Tiramisu gets an official block explorer
const SCAN_BASE_URL = 'https://scan.tiramisu.testnet.arkiv.network'
const SHARE_BASE_URL = 'https://app.remix.live'

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

const WARNING_TEXT =
  'This will write the file to the Arkiv Network as a public entity.\n\n' +
  '⚠  Two things to know before publishing:\n' +
  '• Published data is public — anyone who obtains the entity key can read it.\n' +
  '• Expiry removes the entity from active indexes but does not erase the ' +
  'on-chain record. Treat every publish as permanent.'

const profile = {
  name: 'arkivNetwork',
  displayName: 'Arkiv Network',
  description: 'Arkiv Network integration — stores and retrieves Remix artefacts on the Arkiv chain',
  methods: ['shareFile'],
  events: ['fileSaved'],
  version: '1.0.0',
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

  private async _logError(message: string): Promise<void> {
    await (this as any).call('terminal', 'log', { type: 'error', value: `[Arkiv] ${message}` })
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async shareFile(action: customAction): Promise<string> {
    const filePath = action.path[0]
    if (!filePath) throw new Error('Arkiv: no file selected')

    const fileName = filePath.split('/').pop() ?? filePath

    // ── 1. Warn before writing anything public on-chain ─────────────────────
    const confirmed = await new Promise<boolean>((resolve) => {
      (this as any).call('notification', 'modal', {
        id: 'arkivShareFile',
        title: `Publish "${fileName}" to Arkiv Network`,
        message: WARNING_TEXT,
        okLabel: 'Publish',
        cancelLabel: 'Cancel',
        okFn: () => resolve(true),
        cancelFn: () => resolve(false),
      })
    })

    if (!confirmed) throw new Error('Arkiv: publish cancelled')

    // ── 2. Read content & detect MIME type ──────────────────────────────────
    const fileContent: string = await (this as any).call('fileManager', 'readFile', filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

    const bytes = new TextEncoder().encode(fileContent)
    const payload = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')

    // ── 3. Ensure the arkiv signing session is open ─────────────────────────
    try {
      await (this as any).call('arkivBasic', 'unlock')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      await this._logError(`Could not unlock signing session: ${msg}`)
      throw e
    }

    // ── 4. Write the entity to the Arkiv chain ──────────────────────────────
    let result: { entityKey: string; txHash: string }
    try {
      result = await (this as any).call('arkivBasic', 'createEntity', {
        payload,
        contentType,
        attributes: {
          name: fileName,
          path: filePath,
        },
        expires: { days: 30 },
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      await this._logError(`Transaction failed while publishing "${filePath}": ${msg}`)
      throw e
    }

    // ── 5. Show the shareable link ───────────────────────────────────────────
    const shareUrl = `${SHARE_BASE_URL}?arkiv=${result.entityKey}`
    await (this as any).call('notification', 'modal', {
      id: 'arkivShareSuccess',
      title: `"${fileName}" published`,
      message: `The file is now live on the Arkiv Network.\n\nShare it with:\n\n${shareUrl}`,
      okLabel: 'Close',
    })

    this.emit('fileSaved', filePath, result.entityKey)
    return result.entityKey
  }
}
