import { ElectronBasePlugin, ElectronBasePluginClient } from "@remixproject/plugin-electron"
import { Profile } from "@remixproject/plugin-utils"
import { handleRequest, startHostServer } from "../lib/server"
import EventEmitter from "events"
import { ipcMain, shell } from "electron"
import { RequestArguments } from "../types"
import fs from 'fs'
import path from 'path'
import os from 'os'
import { isE2E, isE2ELocal, isPackaged } from "../main"
import puppeteer from 'puppeteer'

const logFilePath = isPackaged ? path.join(os.tmpdir(), 'desktopHost.log') : path.join(__dirname, 'desktopHost.log')

const profile = {
  displayName: 'desktopHost',
  name: 'desktopHost',
  description: 'desktopHost',
}

const eventEmitter = new EventEmitter()
let isConnected = false

let ports: {
  http_port: number
  websocket_port: number
}

export class DesktopHostPlugin extends ElectronBasePlugin {
  clients: DesktopHostPluginClient[] = []
  constructor() {
    super(profile, clientProfile, DesktopHostPluginClient)
    this.methods = [...super.methods]
    this.startServer()
    eventEmitter.on('connected', (payload) => {
      console.log('connected', payload)
      if (isConnected && payload === false) {
        console.log('suddenly disconnected')
        for (const client of this.clients) {
          client.sendDisconnectAlert()
        }
      }
      isConnected = payload
    })
    eventEmitter.on('isInjected', (isInjected: boolean) => {
      console.log('isInjected', isInjected)
      for (const client of this.clients) {
        client.setIsInjected(isInjected)
      }
    })
    eventEmitter.on('focus', () => {
      console.log('focus')
      ipcMain.emit('focus-window', 0)
    })
    eventEmitter.on('contextChanged', (context) => {
      console.log('contextChanged', context)
      for (const client of this.clients) {
        client.emit('chainChanged', context)
      }
    })
  }

  async startServer(): Promise<void> {
    console.log('desktopHost activated')
    ports = await startHostServer(eventEmitter)
    console.log('desktopHost server started', ports)
  }
}

const clientProfile: Profile = {
  name: 'desktopHost',
  displayName: 'desktopHost',
  description: 'desktopHost',
  methods: ['getIsConnected', 'sendAsync', 'init'],
  kind: 'provider',
}

export class DesktopHostPluginClient extends ElectronBasePluginClient {

  isInjected: boolean
  constructor(webContentsId: number, profile: Profile) {
    super(webContentsId, profile)
    this.isInjected = null
  }

  async sendDisconnectAlert() {
    this.call('notification' as any, 'alert', {
      id: 'desktopHostAlert',
      title: 'Disconnected',
      message: 'You are disconnected from the Browser wallet.',
    })
    this.emit('disconnected')

  }

  async setIsInjected(isInjected: boolean) {
    if (this.isInjected !== isInjected && isConnected) {
      this.isInjected = isInjected

      await this.sendConnectionStatus()
      if (isInjected) {
        this.call('notification' as any, 'toast', 'You are now connected to Metamask!')
      } else {
        this.call('notification' as any, 'toast', 'You are not yet connected to Metamask. Please connect to Metamask in the browser')
      }
    }
  }

  async sendConnectionStatus() {
    const provider = await this.call('blockchain' as any, 'getProvider')
    console.log('provider', provider)
    if (provider === 'desktopHost' && !this.isInjected) {
      this.emit('connectedToBrowser')
    } else if (provider === 'desktopHost' && this.isInjected) {
      this.emit('connectedToMetamask')
    } else {
      this.emit('disconnected')
    }
  }


  getIsConnected() {
    console.log('getIsConnected', isConnected)
    return isConnected
  }

  async openInCI() {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ]
    });
    const page = await browser.newPage();
    await page.goto(
      `http://localhost:${ports.http_port}/?activate=udapp,desktopClient&desktopClientPort=${ports.websocket_port}`,
      { waitUntil: 'networkidle0', timeout: 30000 }
    );
  }


  async init() {
    console.log('SETTING UP REMOTE WEBSOCKET...', this.webContentsId)

    if (!isConnected) {
      if (isE2E && !isE2ELocal) {
        await this.openInCI();
      } else {
        await shell.openExternal(`http://localhost:${ports.http_port}/?activate=udapp,desktopClient&desktopClientPort=${ports.websocket_port}`);
      }
    }

    // wait for the connection
    while (!isConnected) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    console.log('CONNECTED TO REMOTE WEBSOCKET', this.webContentsId)
  }



  async sendAsync(data: RequestArguments) {
    if (!isConnected) {
      console.log('NOT CONNECTED', this.webContentsId)
      return { error: 'Not connected to the remote websocket' }
    }
    console.log('SEND ASYNC', data, this.webContentsId, this.isInjected)


    if (data.method === 'eth_getTransactionReceipt') {
      ipcMain.emit('focus-window', this.webContentsId)
    }
    const result = await handleRequest(data, eventEmitter)

    if (!isPackaged) {
      const logEntry = `
        webContentsId: ${this.webContentsId}
        Request: ${JSON.stringify(data, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2)}
        Result: ${JSON.stringify(result, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2)}
        `

      fs.appendFileSync(logFilePath, logEntry)
    }
    return result
  }
}