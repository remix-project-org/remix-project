import React, { useState, useEffect } from 'react'
import { ViewPlugin } from '@remixproject/engine-web'

interface EezNetworkEntry {
  id: string
  label: string
  rpcUrl: string
  chainId: string
}

interface EezNetworksConfigProps {
  plugin: ViewPlugin
}

const CONFIG_KEY = 'eez-networks'

function emptyEntry(): EezNetworkEntry {
  return { id: `net-${Date.now()}-${Math.floor(Math.random() * 1000)}`, label: '', rpcUrl: '', chainId: '' }
}

const defaultNetworks: EezNetworkEntry[] = [
  { id: 'l1', label: 'L1', rpcUrl: '', chainId: '' },
  { id: 'l2', label: 'L2', rpcUrl: '', chainId: '' }
]

export const EezNetworksConfig: React.FC<EezNetworksConfigProps> = ({ plugin }) => {
  const [networks, setNetworks] = useState<EezNetworkEntry[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const raw = await plugin.call('config', 'getAppParameter', CONFIG_KEY)
        const stored: EezNetworkEntry[] = raw ? JSON.parse(raw) : defaultNetworks

        setNetworks(stored.map(({ id, label, rpcUrl, chainId }) => ({ id, label: label || '', rpcUrl: rpcUrl || '', chainId: chainId ? String(chainId) : '' })))
      } catch (e) {
        setNetworks(defaultNetworks)
      }
    })()
  }, [plugin])

  const updateField = (id: string, field: keyof EezNetworkEntry, value: string) => {
    setSaved(false)
    setNetworks((prev) => prev.map((n) => (n.id === id ? { ...n, [field]: value } : n)))
  }

  const addNetwork = () => {
    setSaved(false)
    setNetworks((prev) => [...prev, emptyEntry()])
  }

  const removeNetwork = (id: string) => {
    setSaved(false)
    setNetworks((prev) => prev.filter((n) => n.id !== id))
  }

  const save = async () => {
    await plugin.call('config', 'setAppParameter', CONFIG_KEY, JSON.stringify(networks))
    setSaved(true)
  }

  return (
    <div data-id="eezNetworksConfig">
      <p className="small text-secondary">
        Add the RPC endpoint for each chain of a local or custom EEZ zone. The live EEZ composer networks are built in;
        contract addresses and rollup ids are read from the composer.
      </p>
      {networks.map((network) => (
        <div key={network.id} className="border rounded p-2 mb-2">
          <div className="row g-2">
            <div className="col-3">
              <label className="form-label small mb-0">Label</label>
              <input className="form-control form-control-sm" value={network.label} onChange={(e) => updateField(network.id, 'label', e.target.value)} />
            </div>
            <div className="col-6">
              <label className="form-label small mb-0">RPC URL</label>
              <input className="form-control form-control-sm" value={network.rpcUrl} onChange={(e) => updateField(network.id, 'rpcUrl', e.target.value)} placeholder="http://127.0.0.1:..." />
            </div>
            <div className="col-3">
              <label className="form-label small mb-0">Chain id</label>
              <input className="form-control form-control-sm" value={network.chainId} onChange={(e) => updateField(network.id, 'chainId', e.target.value)} placeholder="6290" />
            </div>
          </div>
          <button className="btn btn-sm btn-outline-danger mt-2" onClick={() => removeNetwork(network.id)}>Remove</button>
        </div>
      ))}
      <div className="d-flex gap-2">
        <button className="btn btn-sm btn-outline-secondary" onClick={addNetwork}>+ Add network</button>
        <button className="btn btn-sm btn-primary" onClick={save}>Save</button>
        {saved && <span className="small text-success align-self-center">Saved</span>}
      </div>
    </div>
  )
}
