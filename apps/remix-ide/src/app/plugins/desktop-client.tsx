/* eslint-disable prefer-const */
import React from 'react'
import { desktopConnection, desktopConnectionType, trackMatomoEvent } from '@remix-api'
import { Blockchain } from '../../blockchain/blockchain'
import { AppAction, AppModal, ModalTypes } from '@remix-ui/app'
import { ViewPlugin } from '@remixproject/engine-web'
import { PluginViewWrapper } from '@remix-ui/helper'
import { QueryParams } from '@remix-project/remix-lib'
import cbor from 'cbor'
import isElectron from 'is-electron'
import DesktopClientUI from '../components/DesktopClientUI' // Import the UI component
import JSONbig from 'json-bigint'
import { Provider } from '@remix-ui/environment-explorer'

const profile = {
  name: 'desktopClient',
  displayName: 'desktopClient',
  description: '',
  methods: ['init', 'sendAsync'],
  events: ['connected'],
  maintainedBy: 'Remix',
  location: 'mainPanel',
}

interface DesktopClientState {
  connected: desktopConnection
  providers: Provider[]
  disableconnect: boolean
  currentContext: string
}

export class DesktopClient extends ViewPlugin {
  blockchain: Blockchain
  ws: WebSocket
  dispatch: React.Dispatch<any> = () => { }
  state: DesktopClientState
  appStateDispatch: React.Dispatch<AppAction>
  queryParams: QueryParams
  params: any

  constructor(blockchain: Blockchain) {
    super(profile)
    this.blockchain = blockchain
    this.state = {
      connected: desktopConnectionType.disconnected,
      providers: [],
      disableconnect: false,
      currentContext: '',
    }
    this.queryParams = new QueryParams()

    this.params = this.queryParams.get()
  }

  onActivation() {
    console.log('DesktopClient activated')
    trackMatomoEvent(this, { category: 'plugin', action: 'activated', name: 'DesktopClient', isClick: true })

    this.connectToWebSocket()

    const updateProviders = async () => {
      const providersObj: { [key: string]: Provider } = await this.call('blockchain', 'getAllProviders')
      const providers: Provider[] = Object.values(providersObj)
      this.state.providers = providers
      this.renderComponent()
      console.log('providers', providers)
    }

    this.on('udapp', 'providerAdded', updateProviders)
    window.addEventListener('eip6963:announceProvider', (event: CustomEvent) => updateProviders())
    if (!isElectron()) window.dispatchEvent(new Event('eip6963:requestProvider'))
    this.call('layout', 'minimizeSidePanel')
    this.blockchain.event.register('networkStatus', this.handleNetworkStatus.bind(this))
    this.blockchain.event.register('contextChanged', this.handleContextChanged.bind(this))
  }

  handleContextChanged(context: any) {
    console.log('contextChanged handled', context)
  }

  onDeactivation() { }

  setDispatch(dispatch: React.Dispatch<any>): void {
    this.dispatch = dispatch
    this.renderComponent()
  }

  setAppStateDispatch(appStateDispatch: React.Dispatch<AppAction>) {
    console.log('setAppStateDispatch', appStateDispatch)
    this.appStateDispatch = appStateDispatch
  }

  renderComponent() {
    this.dispatch({
      ...this.state,
    })
  }

  async handleProviderConnect(provider: Provider) {
    console.log('handleProviderConnect', provider)
    this.state.disableconnect = true
    this.renderComponent()
    try {
      this.blockchain.changeExecutionContext({ context: provider.name, fork: '' }, null, null, () => {
        this.state.disableconnect = false
        this.renderComponent()
      })
    } catch (e) {
      console.error('Error connecting to provider', e)
    }
  }

  setConnectionState = (state: desktopConnection) => {
    this.state.connected = state

    this.renderComponent()
  }

  async handleNetworkStatus(context: any) {
    console.log('networkStatus handled', context)
    this.state.currentContext = this.blockchain.executionContext.executionContext
    this.renderComponent()
    this.debouncedSendContextChanged()
  }

  // Debounced function to send context changed event
  debouncedSendContextChanged = debounce(() => {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('Sending context changed event to server')
      this.ws.send(stringifyWithBigInt({ type: 'contextChanged', payload: null }))
    }
  }, 500) // Adjust the debounce wait time as needed

  async checkConnection() {
    console.log('Checking connection', this.ws)
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      console.log('OK Connected to server')
    } else {
      console.log('NOT Connected to server')
      this.connectToWebSocket()
    }
  }

  async isInjected() {
    const executionContext = this.blockchain.executionContext.executionContext
    const currentProvider = this.state.providers.find((provider) => provider.name === executionContext)
    this.ws.send(stringifyWithBigInt({ type: 'isInjected', payload: currentProvider && currentProvider.config && currentProvider.config.isInjected }))
  }

  async openDesktopApp() {
    console.log('openDesktopApp')
    this.ws.send(stringifyWithBigInt({ type: 'focus', payload: null }))
  }

  updateComponent(state: DesktopClientState) {
    return (
      <>
        <DesktopClientUI openDesktopApp={this.openDesktopApp.bind(this)} currentContext={state.currentContext} providers={state.providers} disableconnect={state.disableconnect} connected={state.connected} onConnect={this.handleProviderConnect.bind(this)} />
      </>
    )
  }

  render() {
    return (
      <div className="bg-dark" id="desktopClient">
        <PluginViewWrapper useAppContext={true} plugin={this} />
      </div>
    )
  }

  async connectToWebSocket() {
    console.log('Connecting to server')
    try {
      this.ws = new WebSocket(`ws://localhost:${this.params.desktopClientPort}`)
      this.ws.binaryType = 'arraybuffer'
    } catch (e) {
      console.error('CATCH WebSocket error:', e)
      return
    }
    this.ws.onopen = () => {
      console.log('Connected to server')
      this.emit('connected', true)
      this.setConnectionState(desktopConnectionType.connected)
      this.call('terminal', 'log', {
        value: 'Connected to the desktop application.',
        type: 'info',
      })
      //this.blockchain.event.register('contextChanged', this.handleNetworkStatus.bind(this));
    }

    this.ws.onmessage = async (event) => {
      const parsed = JSON.parse(event.data)
      console.log('Message from server:', parsed.method, parsed.id)
      if (parsed && parsed.type === 'error') {
        if (parsed.payload === 'ALREADY_CONNECTED') {
          console.log('ALREADY_CONNECTED')
          this.setConnectionState(desktopConnectionType.alreadyConnected)
          const modalContent: AppModal = {
            id: this.profile.name,
            title: 'Another tab or window is already connected.',
            message: 'Another tab or window is already connected to the desktop application. Please close this tab or window.',
            modalType: ModalTypes.fixed,
            okLabel: null,
          }

          this.call('notification', 'modal' as any, modalContent)
          return
        }
      }
      if (parsed.method === 'eth_sendTransaction' || parsed.method === 'eth_getTransactionReceipt') {
        this.call('terminal', 'log', {
          value: 'Transaction from desktop client: ' + event.data,
          type: 'info',
        })
      }
      if (parsed.method === 'eth_sendTransaction' || parsed.method === 'eth_getTransactionReceipt') {
        console.log('Sending message to web3:', parsed)
      }

      if (parsed.method === 'eth_getTransactionReceipt') {
        console.log('Getting receipt for', parsed.params)
        let receipt = await this.tryTillReceiptAvailable(parsed.params[0])
        console.log('Receipt:', receipt)
        console.log('Sending receipt back to server', parsed.params[0], receipt, stringifyWithBigInt({
          jsonrpc: '2.0',
          result: receipt,
          id: parsed.id,
        }))
        this.ws.send(
          stringifyWithBigInt({
            jsonrpc: '2.0',
            result: receipt,
            id: parsed.id,
          })
        )
      } else {
        await this.isInjected()
        try {
          const provider = this.blockchain.web3().currentProvider

          let result = await provider.sendAsync(parsed)

          console.log('Sending result back to server', result)
          this.ws.send(stringifyWithBigInt(result))

        } catch (e) {

          console.log('No provider...', parsed)
          this.ws.send(stringifyWithBigInt({
            jsonrpc: '2.0',
            result: 'error',
            id: parsed.id,
          }))
          return

        }

      }
    }

    this.ws.onclose = () => {
      console.log('Disconnected from server')
      this.ws = null

      this.emit('connected', false)
      if (this.state.connected !== desktopConnectionType.alreadyConnected) {
        this.setConnectionState(desktopConnectionType.disconnected)

        setTimeout(() => {
          this.connectToWebSocket()
        }, 5000)
      }
    }
  }

  async init() { }

  async sendAsync(payload: any) { }

  async tryTillReceiptAvailable(txhash) {
    try {
      const receipt = await this.call('blockchain', 'getTransactionReceipt', txhash)
      if (receipt) return receipt
    } catch (e) {
      // do nothing
    }
    await this.pause()
    return await this.tryTillReceiptAvailable(txhash)
  }
  async pause() {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, 500)
    })
  }
}

function stringifyWithBigInt(obj) {
  const r = JSON.stringify(obj, (key, value) => (typeof value === 'bigint' ? value.toString() + 'n' : value))
  return r
}

function debounce(func: (...args: any[]) => void, wait: number) {
  let timeout: NodeJS.Timeout
  return function (...args: any[]) {
    clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(this, args), wait)
  }
}
