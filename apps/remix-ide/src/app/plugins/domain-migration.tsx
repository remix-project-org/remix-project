import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import { PluginViewWrapper } from '@remix-ui/helper'
import { trackMatomoEvent } from '@remix-api'
import { DomainMigration, parseMigrationConfig } from '@remix-ui/domain-migration'
import { RemixAppManager } from '../../remixAppManager'

const profile = {
  name: 'domainMigration',
  displayName: 'Move your workspaces',
  description: 'Export and import your workspaces and settings when moving between Remix domains',
  location: 'mainPanel',
  methods: ['showMigration'],
  events: []
}

export class DomainMigrationPlugin extends ViewPlugin {
  dispatch: React.Dispatch<any> = () => {}
  appManager: RemixAppManager
  element: HTMLDivElement
  payload: { mode?: 'export' | 'import'; targetOrigin?: string; fromDomains?: string[]; deadline?: string | null }

  constructor(appManager: RemixAppManager) {
    super(profile)
    this.appManager = appManager
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'domainMigration')
    this.payload = {}
  }

  async onActivation() {
    trackMatomoEvent(this, { category: 'plugin', action: 'activated', name: 'domainMigration', isClick: true })
    await this._loadTargetOrigin()
  }

  onDeactivation(): void {}

  /** @param mode 'import' when arriving on the new domain via the handoff link. */
  async showMigration(mode?: 'export' | 'import') {
    this.payload = { ...this.payload, mode: mode === 'import' ? 'import' : 'export' }
    if (!this.payload.targetOrigin) await this._loadTargetOrigin()
    await this.call('tabs', 'focus', 'domainMigration')
    this.renderComponent()
  }

  private async _loadTargetOrigin(): Promise<void> {
    try {
      const raw: any = await this.call('auth' as any, 'getAppConfig')
      const read = (key: string) =>
        Array.isArray(raw) ? raw.find((entry: any) => entry?.key === key)?.value : raw?.[key]
      const config = parseMigrationConfig(read)
      this.payload = {
        ...this.payload,
        targetOrigin: config.toDomain || undefined,
        fromDomains: config.fromDomains,
        deadline: config.deadline
      }
      this.renderComponent()
    } catch {
      // Auth not ready — the wizard falls back to copy without a handoff link.
    }
  }

  setDispatch(dispatch: React.Dispatch<any>): void {
    this.dispatch = dispatch
    this.renderComponent()
  }

  render() {
    return (
      <div id="domainMigration" className="h-100">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  renderComponent() {
    this.dispatch({ ...this, ...this.payload })
  }

  updateComponent(state: any) {
    return (
      <DomainMigration
        plugin={this}
        targetOrigin={state?.targetOrigin}
        fromDomains={state?.fromDomains}
        deadline={state?.deadline}
        initialMode={state?.mode}
      />
    )
  }
}
