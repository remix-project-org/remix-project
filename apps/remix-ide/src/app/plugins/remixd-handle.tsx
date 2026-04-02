/* eslint-disable no-unused-vars */
import React, {useRef, useState, useEffect} from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { WebsocketPlugin } from '@remixproject/engine-web'
import * as packageJson from '../../../../../package.json'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { version as remixdVersion } from '../../../../../libs/remixd/package.json'
import { PluginManager } from '@remixproject/engine'
import { AppModal, AlertModal, appPlatformTypes } from '@remix-ui/app'
import { Registry } from '@remix-project/remix-lib'

const LOCALHOST = ' - connect to localhost - '

const profile = {
  name: 'remixd',
  displayName: 'RemixD',
  url: 'ws://127.0.0.1:65520',
  methods: ['folderIsReadOnly', 'resolveDirectory', 'get', 'exists', 'isFile', 'set', 'rename', 'remove', 'isDirectory', 'list', 'createDir'],
  events: [],
  description: 'Using Remixd daemon, allow to access file system',
  kind: 'other',
  version: packageJson.version,
  repo: 'https://github.com/ethereum/remix-project/tree/master/libs/remixd',
  maintainedBy: 'Remix',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/remixd.html',
  authorContact: ''
}

export class RemixdHandle extends WebsocketPlugin {
  localhostProvider: any
  appManager: PluginManager
  dependentPlugins: Array<string>
  constructor(localhostProvider, appManager) {
    super(profile)
    this.localhostProvider = localhostProvider
    this.appManager = appManager
    this.dependentPlugins = ['hardhat', 'truffle', 'slither', 'foundry']
  }

  async deactivate() {
    for (const plugin of this.dependentPlugins) {
      if (await this.appManager.isActive(plugin)) {
        await this.appManager.deactivatePlugin(plugin)
      }
    }
    //@ts-ignore
    if (super.socket) super.deactivate()
    // this.appManager.deactivatePlugin('git') // plugin call doesn't work.. see issue https://github.com/ethereum/remix-plugin/issues/342
    this.localhostProvider.close((error) => {
      if (error) console.log(error)
    })
  }

  async activate() {
    this.connectToLocalhost()
    return true
  }

  async canceled() {
    for (const plugin of this.dependentPlugins) {
      if (await this.appManager.isActive(plugin)) {
        await this.appManager.deactivatePlugin(plugin)
      }
    }

    await this.appManager.deactivatePlugin('remixd')
  }

  async callPluginMethod(key: string, payload?: any[]) {
    if (this.socket.readyState !== this.socket.OPEN) {
      console.log(`${this.profile.name} connection is not opened.`)
      return false
    }
    return super.callPluginMethod(key, payload)
  }

  /**
   * connect to localhost if no connection and render the explorer
   * disconnect from localhost if connected and remove the explorer
   *
   * @param {String} txHash - hash of the transaction
   */
  async connectToLocalhost() {
    const connection = async (error?: any) => {
      if (error) {
        console.log(error)
        const alert: AlertModal = {
          id: 'connectionAlert',
          message: window._intl.formatMessage({ id: 'remixd.connectionAlert1' }),
        }
        this.call('notification', 'alert', alert)
        this.canceled()
      } else {
        const intervalId = setInterval(() => {
          if (!this.socket || (this.socket && this.socket.readyState === 3)) {
            // 3 means connection closed
            clearInterval(intervalId)
            const alert: AlertModal = {
              id: 'connectionAlert',
              message: window._intl.formatMessage({ id: 'remixd.connectionAlert2' }),
            }
            this.call('notification', 'alert', alert)
            this.canceled()
          }
        }, 3000)
        this.localhostProvider.init(() => {
          this.call('filePanel', 'setWorkspace', { name: LOCALHOST, isLocalhost: true }, true)
        })
        for (const plugin of this.dependentPlugins) {
          await this.appManager.activatePlugin(plugin)
        }
      }
    }
    if (this.localhostProvider.isConnected()) {
      this.deactivate()
    } else if (!(Registry.getInstance().get('platform').api.isDesktop())) {
      // warn the user only if he/she is in the browser context
      const mod: AppModal = {
        id: 'remixdConnect',
        title: window._intl.formatMessage({ id: 'remixd.remixdConnect' }),
        message: remixdDialog(),
        okLabel: window._intl.formatMessage({ id: 'remixd.connect' }),
        cancelLabel: window._intl.formatMessage({ id: 'remixd.cancel' }),
      }
      const result = await this.call('notification', 'modal', mod)
      if (result) {
        try {
          this.localhostProvider.preInit()
          super.activate()
          setTimeout(() => {
            if (!this.socket || (this.socket && this.socket.readyState === 3)) {
              // 3 means connection closed
              connection(new Error('Connection with daemon failed.'))
            } else {
              connection()
            }
          }, 3000)
        } catch (error) {
          connection(error)
        }
      } else {
        await this.canceled()
      }
    } else {
      try {
        super.activate()
        setTimeout(() => {
          connection()
        }, 2000)
      } catch (error) {
        connection(error)
      }
    }
  }
}

function remixdDialog() {
  const commandText = 'remixd'
  const fullCommandText = 'remixd -s <path-to-the-shared-folder> -u <remix-ide-instance-URL>'
  return (
    <>
      <div className="">
        <div className="mb-2 break-words">
          <FormattedMessage
            id="remixd.text1"
            values={{
              a: (chunks) => (
                <a target="_blank" href="https://www.npmjs.com/package/@remix-project/remixd">
                  {chunks}
                </a>
              ),
            }}
          />
        </div>
        <div className="mb-2 break-words">
          <FormattedMessage
            id="remixd.text2"
            values={{
              a: (chunks) => (
                <a target="_blank" href="https://remix-ide.readthedocs.io/en/latest/remixd.html">
                  {chunks}
                </a>
              ),
            }}
          />
        </div>
        <div className="mb-2 break-words">
          <FormattedMessage id="remixd.text3" />
          <br />
          <b>{commandText}</b>
        </div>
        <div className="mb-2 break-words">
          <FormattedMessage id="remixd.text4" />
        </div>
        <div className="mb-2 break-words">
          <FormattedMessage id="remixd.text5" /> <br />
          <b>{fullCommandText}</b>
        </div>
        <div className="mb-2 break-words">
          <FormattedMessage
            id="remixd.text6"
            values={{
              a: (chunks) => (
                <a target="_blank" href="https://remix-ide.readthedocs.io/en/latest/remixd.html#ports-usage">
                  {chunks}
                </a>
              ),
            }}
          />
        </div>
        <div className="mb-2 break-words">
          <FormattedMessage id="remixd.text7" />
        </div>
        <div className="mb-2 break-words">
          <h6 className="text-danger">
            <FormattedMessage id="remixd.text8" /> <b>v{remixdVersion}</b>
            <br></br>
            <a target="_blank" href="https://remix-ide.readthedocs.io/en/latest/remixd.html#update-to-the-latest-remixd">
              <FormattedMessage id="remixd.text9" />
            </a>
          </h6>
        </div>
      </div>
    </>
  )
}
