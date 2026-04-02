import React from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { Plugin } from '@remixproject/engine'
import { AppModal } from '@remix-ui/app'
import { PermissionHandlerDialog, PermissionHandlerValue } from '@remix-ui/permission-handler'
import { Profile } from '@remixproject/plugin-utils'

const profile = {
  name: 'permissionhandler',
  displayName: 'permissionhandler',
  description: 'Plugin to handle permissions',
  methods: ['askPermission']
}
export class PermissionHandlerPlugin extends Plugin {
  permissions: any
  sessionPermissions: any
  currentVersion: number
  fallbackMemory: boolean
  constructor() {
    super(profile)
    this.fallbackMemory = false
    this.permissions = this._getFromLocal()
    this.sessionPermissions = {}
    this.currentVersion = 1
    // here we remove the old permissions saved before adding 'permissionVersion'
    // since with v1 the structure has been changed because of new engine ^0.2.0-alpha.6 changes
    if (!localStorage.getItem('permissionVersion')) {
      localStorage.setItem('plugins/permissions', '')
      localStorage.setItem('permissionVersion', this.currentVersion.toString())
    }
  }

  _getFromLocal() {
    if (this.fallbackMemory) return this.permissions
    const permission = localStorage.getItem('plugins/permissions')
    return permission ? JSON.parse(permission) : {}
  }

  persistPermissions() {
    const permissions = JSON.stringify(this.permissions)
    try {
      localStorage.setItem('plugins/permissions', permissions)
    } catch (e) {
      this.fallbackMemory = true
      console.log(e)
    }
  }

  switchMode(from: Profile, to: Profile, method: string, set: boolean, sensitiveCall: boolean) {
    if (sensitiveCall) {
      set ? (this.sessionPermissions[to.name][method][from.name] = {}) : delete this.sessionPermissions[to.name][method][from.name]
    } else {
      set ? (this.permissions[to.name][method][from.name] = {}) : delete this.permissions[to.name][method][from.name]
    }
  }

  clear() {
    localStorage.removeItem('plugins/permissions')
    this.permissions = this._getFromLocal()
    this.sessionPermissions = {}
  }

  notAllowWarning(from: Profile, to: Profile, method: string) {
    return `${from.displayName || from.name} is not allowed to call ${method} method of ${to.displayName || to.name}.`
  }

  async getTheme() {
    return (await this.call('theme', 'currentTheme')).quality
  }

  /**
   * Check if a plugin has the permission to call another plugin and askPermission if needed
   * @param {PluginProfile} from the profile of the plugin that make the call
   * @param {ModuleProfile} to The profile of the module that receive the call
   * @param {string} method The name of the function to be called
   * @param {string} message from the caller plugin to add more details if needed
   * @returns {Promise<boolean>}
   */
  async askPermission(from: Profile, to: Profile, method: string, message: string, sensitiveCall: boolean) {
    try {
      if (sensitiveCall) {
        if (!this.sessionPermissions[to.name]) this.sessionPermissions[to.name] = {}
        if (!this.sessionPermissions[to.name][method]) this.sessionPermissions[to.name][method] = {}
        if (!this.sessionPermissions[to.name][method][from.name]) return this.openPermission(from, to, method, message, sensitiveCall)
      } else {
        this.permissions = this._getFromLocal()
        if (!this.permissions[to.name]) this.permissions[to.name] = {}
        if (!this.permissions[to.name][method]) this.permissions[to.name][method] = {}
        if (!this.permissions[to.name][method][from.name]) return this.openPermission(from, to, method, message, sensitiveCall)
      }

      const { allow, hash } = sensitiveCall ? this.sessionPermissions[to.name][method][from.name] : this.permissions[to.name][method][from.name]
      if (!allow) {
        const warning = this.notAllowWarning(from, to, method)
        const warnEl =
        <div className='flex flex-col'>
          <span>{ warning }</span>
          <div className='flex flex-row'>
            <span onClick={()=>{}}>To change the permission go to </span>
            <span className='px-2' style={{ fontWeight: 'bolder' }}>Plugin Manager</span>
            <img alt="" id="permissionModalImagesFrom" src="assets/img/pluginManager.webp" style={{ height: '1rem', width: '1rem' }} />
            <span className='pl-1' style={{ fontWeight: 'bolder' }}> / Permissions</span>
          </div>
        </div>
        this.call('notification', 'toast', warnEl)
        return false
      }
      return hash === from.hash
        ? true // Allow
        : await this.openPermission(from, to, method, message, sensitiveCall)
    } catch (err) {
      throw new Error(err)
    }
  }

  async openPermission(from: Profile, to: Profile, method: string, message: string, sensitiveCall: boolean) {
    let remember
    if (sensitiveCall) {
      remember = this.sessionPermissions[to.name][method][from.name]
    } else {
      remember = this.permissions[to.name][method][from.name]
    }
    const value: PermissionHandlerValue = {
      from,
      to,
      method,
      message,
      remember,
      sensitiveCall
    }
    const modal: AppModal = {
      id: 'PermissionHandler',
      title: <FormattedMessage id="permissionHandler.permissionNeededFor" values={{ to: to.displayName || to.name }} />,
      message: <PermissionHandlerDialog plugin={this} theme={await this.getTheme()} value={value}></PermissionHandlerDialog>,
      okLabel: <FormattedMessage id="permissionHandler.accept" />,
      cancelLabel: <FormattedMessage id="permissionHandler.decline" />
    }

    const result = await this.call('notification', 'modal', modal)
    return new Promise((resolve, reject) => {
      if (result) {
        if (sensitiveCall) {
          if (this.sessionPermissions[to.name][method][from.name]) {
            this.sessionPermissions[to.name][method][from.name] = {
              allow: true,
              hash: from.hash
            }
          }
        } else {
          if (this.permissions[to.name][method][from.name]) {
            this.permissions[to.name][method][from.name] = {
              allow: true,
              hash: from.hash
            }
            this.persistPermissions()
          }
        }
        resolve(true)
      } else {
        if (sensitiveCall) {
          if (this.sessionPermissions[to.name][method][from.name]) {
            this.sessionPermissions[to.name][method][from.name] = {
              allow: false,
              hash: from.hash
            }
          }
        } else {
          if (this.permissions[to.name][method][from.name]) {
            this.permissions[to.name][method][from.name] = {
              allow: false,
              hash: from.hash
            }
            this.persistPermissions()
          }
        }
        reject(this.notAllowWarning(from, to, method))
      }
    })
  }
}
