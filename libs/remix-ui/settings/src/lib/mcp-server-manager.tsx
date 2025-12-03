/* eslint-disable @typescript-eslint/no-non-null-assertion */
import React, { useState, useEffect } from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import { IMCPServer } from '@remix/remix-ai-core'

interface IMCPConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  serverName: string
  error?: string
  lastAttempt?: number
}

interface IMCPServerManagerProps {
  plugin: ViewPlugin
}

export const IMCPServerManager: React.FC<IMCPServerManagerProps> = ({ plugin }) => {
  const [servers, setServers] = useState<IMCPServer[]>([])
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, IMCPConnectionStatus>>({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingServer, setEditingServer] = useState<IMCPServer | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState<Partial<IMCPServer>>({
    name: '',
    description: '',
    transport: 'stdio',
    command: [],
    args: [],
    url: '',
    autoStart: true,
    enabled: true,
    timeout: 30000
  })

  useEffect(() => {
    loadServers()
    loadConnectionStatuses()

    // Set up periodic status refresh every 5 seconds
    const intervalId = setInterval(() => {
      loadConnectionStatuses()
    }, 5000)

    return () => clearInterval(intervalId)
  }, [])

  const loadServers = async () => {
    try {
      // First try to get servers from the AI plugin (which includes defaults)
      let servers: IMCPServer[] = []

      try {
        await plugin.call('remixAI', 'loadMCPServersFromSettings')
        servers = await plugin.call('remixAI', 'getIMCPServers')
        console.log('Loaded MCP servers from AI plugin:', servers)
      } catch (error) {
        console.log('AI plugin not available, loading from settings directly:', error)
        // Fallback to loading directly from settings
        const savedServers = await plugin.call('settings', 'get', 'settings/mcp/servers')
        if (savedServers) {
          servers = JSON.parse(savedServers)
          console.log('Loaded MCP servers from settings:', servers)
        }
      }

      setServers(servers)
    } catch (error) {
      console.warn('Failed to load MCP servers:', error)
    }
  }

  const loadConnectionStatuses = async () => {
    try {
      const statuses = await plugin.call('remixAI', 'getMCPConnectionStatus')
      const statusMap: Record<string, IMCPConnectionStatus> = {}
      statuses.forEach((status: IMCPConnectionStatus) => {
        statusMap[status.serverName] = status
      })

      setConnectionStatuses(statusMap)
    } catch (error) {
      console.log('[MCP Settings] Failed to load MCP connection statuses:', error)
    }
  }

  const saveServer = async () => {
    try {
      setIsSaving(true)

      // Validate required fields
      if (!formData.name || !formData.transport) {
        console.error('Name and transport are required fields')
        setIsSaving(false)
        return
      }

      const server: IMCPServer = {
        name: formData.name,
        description: formData.description,
        transport: formData.transport,
        command: formData.transport === 'stdio' ? formData.command : undefined,
        args: formData.transport === 'stdio' ? formData.args : undefined,
        url: formData.transport !== 'stdio' ? formData.url : undefined,
        env: formData.env,
        autoStart: formData.autoStart,
        enabled: formData.enabled,
        timeout: formData.timeout
      }

      if (editingServer) {
        console.log(`[MCP Settings] Updating server ${editingServer.name}...`)

        const newServers = servers.map(s => s.name === editingServer.name ? server : s)
        setServers(newServers)
        await plugin.call('settings', 'set', 'settings/mcp/servers', JSON.stringify(newServers))

        console.log(`[MCP Settings] Removing old connection for ${editingServer.name}...`)
        await plugin.call('remixAI', 'removeMCPServer', editingServer.name)

        if (server.enabled) {
          console.log(`[MCP Settings] Adding updated server ${server.name} with new configuration...`)
          await plugin.call('remixAI', 'addMCPServer', server)
        }

        await new Promise(resolve => setTimeout(resolve, 2000))

        console.log(`[MCP Settings] Refreshing UI connection status...`)
        await loadConnectionStatuses()
      } else {
        console.log(`[MCP Settings] Adding new server ${server.name}...`)

        const newServers = [...servers, server]
        setServers(newServers)
        await plugin.call('settings', 'set', 'settings/mcp/servers', JSON.stringify(newServers))

        await plugin.call('remixAI', 'addMCPServer', server)

        await new Promise(resolve => setTimeout(resolve, 2000))

        console.log(`[MCP Settings] Refreshing UI connection status...`)
        await loadConnectionStatuses()
      }

      resetForm()
    } catch (error) {
      console.error('Failed to save MCP server:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const deleteServer = async (serverName: string) => {
    try {
      // Prevent deleting built-in servers
      const serverToDelete = servers.find(s => s.name === serverName)
      if (serverToDelete?.isBuiltIn) {
        console.error('Cannot delete built-in MCP server:', serverName)
        return
      }

      const newServers = servers.filter(s => s.name !== serverName)
      setServers(newServers)
      await plugin.call('settings', 'set', 'settings/mcp/servers', JSON.stringify(newServers))
      await plugin.call('remixAI', 'removeMCPServer', serverName)
      loadConnectionStatuses()
    } catch (error) {
      console.error('Failed to delete MCP server:', error)
    }
  }

  const toggleServer = async (server: IMCPServer) => {
    try {
      // Prevent disabling built-in servers
      if (server.isBuiltIn) {
        console.warn('Cannot disable built-in MCP server:', server.name)
        return
      }

      const updatedServer = { ...server, enabled: !server.enabled }
      const newServers = servers.map(s => s.name === server.name ? updatedServer : s)

      console.log(`[MCP Settings] ${updatedServer.enabled ? 'Connecting to' : 'Disconnecting from'} server: ${server.name}`)

      setServers(newServers)
      await plugin.call('settings', 'set', 'settings/mcp/servers', JSON.stringify(newServers))

      if (updatedServer.enabled) {
        console.log(`[MCP Settings] Adding server ${server.name} to remixAI plugin...`)
        await plugin.call('remixAI', 'addMCPServer', updatedServer)

        await new Promise(resolve => setTimeout(resolve, 2000))
      } else {
        console.log(`[MCP Settings] Removing server ${server.name} from remixAI plugin...`)
        await plugin.call('remixAI', 'removeMCPServer', server.name)

        await new Promise(resolve => setTimeout(resolve, 500))
      }

      console.log(`[MCP Settings] Refreshing connection status...`)
      await loadConnectionStatuses()

      setTimeout(() => {
        loadConnectionStatuses()
      }, 1000)
    } catch (error) {
      console.error('Failed to toggle MCP server:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      transport: 'stdio',
      command: [],
      args: [],
      url: '',
      autoStart: true,
      enabled: true,
      timeout: 30000
    })
    setShowAddForm(false)
    setEditingServer(null)
  }

  const editServer = (server: IMCPServer) => {
    setFormData(server)
    setEditingServer(server)
    setShowAddForm(true)
  }

  const getStatusIcon = (status?: IMCPConnectionStatus) => {
    if (!status) return <span className="text-muted">○</span>

    switch (status.status) {
    case 'connected': return <span className="text-success">●</span>
    case 'connecting': return <span className="text-warning">●</span>
    case 'error': return <span className="text-danger">●</span>
    default: return <span className="text-muted">○</span>
    }
  }

  const getStatusText = (status?: IMCPConnectionStatus) => {
    if (!status) return 'Not initialized'
    return status.status.charAt(0).toUpperCase() + status.status.slice(1)
  }

  return (
    <div className="mcp-server-manager">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0">MCP Servers</h6>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : 'Add Server'}
        </button>
      </div>

      {showAddForm && (
        <div className="card mb-3">
          <div className="card-body">
            <h6>{editingServer ? 'Edit Server' : 'Add New MCP Server'}</h6>

            <div className="form-group mb-2">
              <label className="form-label">Name *</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Server name"
              />
            </div>

            <div className="form-group mb-2">
              <label className="form-label">Description</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>

            <div className="form-group mb-2">
              <label className="form-label">Transport *</label>
              <select
                className="form-control form-control-sm"
                value={formData.transport}
                onChange={(e) => setFormData({ ...formData, transport: e.target.value as 'stdio' | 'sse' | 'websocket' | 'http' | 'internal' })}
              >
                <option value="stdio" disabled>Standard I/O</option>
                <option value="sse">Server-Sent Events</option>
                <option value="websocket">WebSocket</option>
                <option value="http">HTTP (REST)</option>
                <option value="internal">Internal (Built-in)</option>
              </select>
            </div>

            {formData.transport === 'internal' ? (
              <div className="alert alert-info">
                <small>Internal servers are built into Remix IDE and don't require additional configuration.</small>
              </div>
            ) : formData.transport === 'stdio' ? (
              <>
                <div className="form-group mb-2">
                  <label className="form-label">Command *</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={formData.command?.join(' ') || ''}
                    onChange={(e) => setFormData({ ...formData, command: e.target.value.split(' ').filter(Boolean) })}
                    placeholder="python -m mcp_server"
                  />
                </div>
                <div className="form-group mb-2">
                  <label className="form-label">Arguments</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={formData.args?.join(' ') || ''}
                    onChange={(e) => setFormData({ ...formData, args: e.target.value.split(' ').filter(Boolean) })}
                    placeholder="--port 8080"
                  />
                </div>
              </>
            ) : (
              <div className="form-group mb-2">
                <label className="form-label">URL *</label>
                <input
                  type="url"
                  className="form-control form-control-sm"
                  value={formData.url || ''}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder={
                    formData.transport === 'sse' ? 'http://localhost:8080/sse' :
                      formData.transport === 'http' ? 'http://localhost:8080/mcp' :
                        'ws://localhost:8080/ws'
                  }
                />
              </div>
            )}

            <div className="form-group mb-2">
              <label className="form-label">Timeout (ms)</label>
              <input
                type="number"
                className="form-control form-control-sm"
                value={formData.timeout || 30000}
                onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 30000 })}
                min="1000"
                max="300000"
              />
            </div>

            <div className="form-check mb-2">
              <input
                type="checkbox"
                className="form-check-input"
                checked={formData.autoStart || false}
                onChange={(e) => setFormData({ ...formData, autoStart: e.target.checked })}
              />
              <label className="form-check-label">Auto-start server</label>
            </div>

            <div className="d-flex gap-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={saveServer}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : editingServer ? 'Update Server' : 'Add Server'}
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={resetForm}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mcp-servers-list">
        {servers.length === 0 ? (
          <div className="text-center text-muted p-3">
            <p>No MCP servers configured</p>
            <small>Add a server to start using MCP integration</small>
          </div>
        ) : (
          <div className="list-group">
            {servers.map((server) => (
              <div key={server.name} className="list-group-item">
                <div className="d-flex justify-content-between align-items-start">
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center mb-1">
                      {getStatusIcon(connectionStatuses[server.name])}
                      <strong className="ms-2">{server.name}</strong>
                      {connectionStatuses[server.name]?.status === 'connected' ? (
                        <span className="badge bg-success ms-2">Connected</span>
                      ) : connectionStatuses[server.name]?.status === 'connecting' ? (
                        <span className="badge bg-warning ms-2">Connecting</span>
                      ) : connectionStatuses[server.name]?.status === 'error' ? (
                        <span className="badge bg-danger ms-2">Error</span>
                      ) : server.enabled ? (
                        <span className="badge bg-secondary ms-2">Connecting</span>
                      ) : (
                        <span className="badge bg-secondary ms-2">Disconnected</span>
                      )}
                      {server.isBuiltIn && <span className="badge bg-primary ms-2">Built-in</span>}
                    </div>
                    {server.description && (
                      <p className="text-muted small mb-1">{server.description}</p>
                    )}
                    <div className="small text-muted">
                      <div>Transport: {server.transport === 'internal' ? 'Internal (Built-in)' : server.transport}</div>
                      {server.transport === 'internal' ? (
                        <div>Type: Built-in Remix IDE server</div>
                      ) : server.transport === 'stdio' ? (
                        <div>Command: {server.command?.join(' ')}</div>
                      ) : (
                        <div>URL: {server.url}</div>
                      )}
                      <div>Status: {getStatusText(connectionStatuses[server.name])}</div>
                      {connectionStatuses[server.name]?.error && (
                        <div className="text-danger">Error: {connectionStatuses[server.name]?.error}</div>
                      )}
                    </div>
                  </div>
                  <div className="d-flex flex-column gap-1">
                    {!server.isBuiltIn && (
                      <button
                        className={`btn btn-sm ${server.enabled ? 'btn-warning' : 'btn-success'}`}
                        onClick={() => toggleServer(server)}
                        title={server.enabled ? 'Disconnect from server' : 'Connect to server'}
                      >
                        {server.enabled ? 'Disconnect' : 'Connect'}
                      </button>
                    )}
                    {!server.isBuiltIn && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => editServer(server)}
                        title="Edit server configuration"
                      >
                        Edit
                      </button>
                    )}
                    {!server.isBuiltIn && (
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => {
                          if (confirm(`Delete server "${server.name}"?`)) {
                            deleteServer(server.name)
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                    {server.isBuiltIn && (
                      <small className="text-muted">Built-in server is always connected</small>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3">
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={loadConnectionStatuses}
          title="Refresh connection status display"
        >
          Refresh Status
        </button>
      </div>

      <div className="mt-3 small text-muted">
        <p><strong>Transport Types:</strong></p>
        <ul>
          <li><strong>Internal (Built-in):</strong> Built-in Remix IDE MCP servers</li>
          <li><strong>Standard I/O:</strong> Run MCP server as subprocess</li>
          <li><strong>Server-Sent Events:</strong> Connect via HTTP SSE (browser-compatible)</li>
          <li><strong>WebSocket:</strong> Connect via WebSocket protocol (browser-compatible)</li>
          <li><strong>HTTP (REST):</strong> Connect via HTTP requests (browser-compatible)</li>
        </ul>
        <p><strong>Status Indicators:</strong>
          <span className="text-success ms-1">●</span> Connected
          <span className="text-warning ms-1">●</span> Connecting
          <span className="text-danger ms-1">●</span> Error
          <span className="text-muted ms-1">○</span> Disconnected
        </p>
      </div>
    </div>
  )
}
