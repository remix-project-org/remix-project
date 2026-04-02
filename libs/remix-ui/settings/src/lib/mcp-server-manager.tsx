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
  const [editingServer, setEditingServer] = useState<IMCPServer | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [alchemyEnabled, setAlchemyEnabled] = useState(false)
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
      // Get default servers from the AI plugin (runtime only, no persistence)
      const servers: IMCPServer[] = await plugin.call('remixAI', 'getIMCPServers')
      console.log('Loaded default MCP servers from AI plugin:', servers)
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
    setEditingServer(null)
  }

  const getStatusIcon = (status?: IMCPConnectionStatus) => {
    if (!status) return <span className="text-gray-500 dark:text-gray-400">○</span>

    switch (status.status) {
    case 'connected': return <span className="text-success">●</span>
    case 'connecting': return <span className="text-warning">●</span>
    case 'error': return <span className="text-danger">●</span>
    default: return <span className="text-gray-500 dark:text-gray-400">○</span>
    }
  }

  const getStatusText = (status?: IMCPConnectionStatus) => {
    if (!status) return 'Not initialized'
    return status.status.charAt(0).toUpperCase() + status.status.slice(1)
  }

  return (
    <div className="mcp-server-manager">
      <div className="flex justify-between items-center mb-3">
        <h6 className="mb-0">MCP Servers</h6>
      </div>

      <div className="mcp-servers-list">
        {servers.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 p-3">
            <p>No MCP servers configured</p>
            <small>Add a server to start using MCP integration</small>
          </div>
        ) : (
          <div className="list-group">
            {servers.map((server) => (
              <div key={server.name} className="list-group-item">
                <div className="flex justify-between items-start">
                  <div className="flex-grow-1">
                    <div className="flex items-center mb-1">
                      {getStatusIcon(connectionStatuses[server.name])}
                      <strong className="ml-2">{server.name}</strong>
                      {connectionStatuses[server.name]?.status === 'connected' ? (
                        <span className="badge bg-success ml-2">Connected</span>
                      ) : connectionStatuses[server.name]?.status === 'connecting' ? (
                        <span className="badge bg-warning ml-2">Connecting</span>
                      ) : connectionStatuses[server.name]?.status === 'error' ? (
                        <span className="badge bg-danger ml-2">Error</span>
                      ) : server.enabled ? (
                        <span className="badge bg-secondary ml-2">Connecting</span>
                      ) : (
                        <span className="badge bg-secondary ml-2">Disconnected</span>
                      )}
                      {server.isBuiltIn && <span className="badge bg-primary ml-2">Built-in</span>}
                    </div>
                    {server.description && (
                      <p className="text-gray-500 dark:text-gray-400 small mb-1">{server.description}</p>
                    )}
                    <div className="small text-gray-500 dark:text-gray-400">
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
                  <div className="flex flex-col gap-1">
                    {!server.isBuiltIn && (
                      <button
                        className={`btn btn-sm ${server.enabled ? 'btn-warning' : 'btn-success'}`}
                        onClick={() => toggleServer(server)}
                      >
                        {server.enabled ? 'Disconnect' : 'Connect'}
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
                      <small className="text-gray-500 dark:text-gray-400">Built-in server is always connected</small>
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
          className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-outline-primary"
          onClick={loadConnectionStatuses}
        >
          Refresh Status
        </button>
      </div>

      <div className="mt-3 small text-gray-500 dark:text-gray-400">
        <p><strong>Transport Types:</strong></p>
        <ul>
          <li><strong>Internal (Built-in):</strong> Built-in Remix IDE MCP servers</li>
          <li><strong>Standard I/O:</strong> Run MCP server as subprocess</li>
          <li><strong>Server-Sent Events:</strong> Connect via HTTP SSE (browser-compatible)</li>
          <li><strong>WebSocket:</strong> Connect via WebSocket protocol (browser-compatible)</li>
          <li><strong>HTTP (REST):</strong> Connect via HTTP requests (browser-compatible)</li>
        </ul>
        <p><strong>Status Indicators:</strong>
          <span className="text-success ml-1">●</span> Connected
          <span className="text-warning ml-1">●</span> Connecting
          <span className="text-danger ml-1">●</span> Error
          <span className="text-gray-500 dark:text-gray-400 ml-1">○</span> Disconnected
        </p>
      </div>

      <hr className="my-4" />
    </div>
  )
}
