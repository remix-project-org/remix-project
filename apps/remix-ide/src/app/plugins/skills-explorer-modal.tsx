/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React from 'react'
import { AppAction, appActionTypes } from '@remix-ui/app'
import { PluginViewWrapper } from '@remix-ui/helper'
import { Plugin } from '@remixproject/engine'
import { EventEmitter } from 'events'
import * as packageJson from '../../../../../package.json'
import { RemixUiSkillsExplorerModal } from 'libs/remix-ui/skills-explorer-modal/src/lib/remix-ui-skills-explorer-modal'
import { parseSkillNameFromContent, getSkillsBaseUrl, fetchSkillData, ensureDirectoryExists } from 'libs/remix-ui/skills-explorer-modal/src/lib/helpers'

const pluginProfile = {
  name: 'skillsexplorermodal',
  displayName: 'Skills Explorer Modal',
  description: 'Skills Explorer Modal',
  methods: ['loadSkill'],
  events: [],
  maintainedBy: 'Remix',
  kind: 'skillsexplorermodal',
  location: 'none',
  version: packageJson.version,
  permission: true,
  documentation: ''
}

export class SkillsExplorerModalPlugin extends Plugin {
  element: HTMLDivElement
  dispatch: React.Dispatch<any> = () => { }
  event: EventEmitter
  appStateDispatch: React.Dispatch<AppAction> = () => { }

  constructor() {
    super(pluginProfile)
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'skills-explorer-modal')
    this.dispatch = () => { }
    this.event = new EventEmitter()
  }

  async onActivation(): Promise<void> { }

  onDeactivation(): void { }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  setAppStateDispatch(appStateDispatch: React.Dispatch<AppAction>) {
    this.appStateDispatch = appStateDispatch
  }

  /**
   * Close the modal. Uses two mechanisms for reliability:
   * 1. Plugin's own dispatch → sets isOpen:false in PluginViewWrapper state → modal renders null
   * 2. appStateDispatch → removes the plugin from the DOM entirely
   */
  closeModal() {
    // Primary: update the plugin's own React state via PluginViewWrapper
    this.dispatch({ ...this, isOpen: false })
    // Secondary: remove from DOM via appState (works once setAppStateDispatch has been called)
    try {
      this.appStateDispatch({ type: appActionTypes.showSkillsModal, payload: false })
    } catch (_) { /* appStateDispatch may not be set yet */ }
  }

  render() {
    return (
      <div id="inner-remix-skills-explorer-modal">
        <PluginViewWrapper plugin={this} useAppContext={true} />
      </div>
    )
  }

  async loadSkill (skillId: string) {
    const url = getSkillsBaseUrl() + `/skills/${skillId}`
    const skillData = await fetchSkillData(url)
    // Use the name from SKILL.md frontmatter as the directory name per convention.
    // e.g. "---\nname: my-skill\n---" → skills/my-skill/
    const dirName = parseSkillNameFromContent(skillData.content)
    if (!dirName) {
      throw new Error(`${skillId}: SKILL.md is not in the correct format. Expected YAML frontmatter with a 'name' field (---\nname: skill-name\ndescription: ...\n---)`)
    }
    const skillDir = `skills/${dirName}`
    await ensureDirectoryExists(skillDir, this)
    await this.call('fileManager', 'writeFile', `${skillDir}/SKILL.md`, skillData.content)
    for (const [filename, content] of Object.entries(skillData.resources)) {
      await this.call('fileManager', 'writeFile', `${skillDir}/${filename}`, content)
    }
  }

  renderComponent() {
    this.dispatch({ ...this, isOpen: true })
  }

  updateComponent(state: any) {
    // isOpen defaults to true on first render (when triggered by button),
    // becomes false when closeModal() dispatches { isOpen: false }
    const isOpen = state.isOpen !== false
    return (
      <RemixUiSkillsExplorerModal
        isOpen={isOpen}
        onClose={() => this.closeModal()}
        plugin={this}
        loadSkill={(skillId: string) => this.loadSkill(skillId)}
      />
    )
  }
}
