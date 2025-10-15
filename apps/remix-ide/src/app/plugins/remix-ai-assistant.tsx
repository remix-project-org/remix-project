import React, { useEffect, useRef, createRef } from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import * as packageJson from '../../../../../package.json'
import { PluginViewWrapper } from '@remix-ui/helper'
import { ChatMessage, RemixUiRemixAiAssistant, RemixUiRemixAiAssistantHandle } from '@remix-ui/remix-ai-assistant'
import { EventEmitter } from 'events'
import { trackMatomoEvent } from '@remix-api'

const profile = {
  name: 'remixaiassistant',
  displayName: 'RemixAI Assistant',
  icon: 'assets/img/remixai-logoAI.webp',
  description: 'AI code assistant for Remix IDE',
  kind: 'remixaiassistant',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/ai.html',
  version: packageJson.version,
  maintainedBy: 'Remix',
  permission: true,
  events: [],
  methods: ['chatPipe']
}

export class RemixAIAssistant extends ViewPlugin {
  element: HTMLDivElement
  dispatch: React.Dispatch<any> = () => { }
  queuedMessage: { text: string, timestamp: number } | null = null
  event: any
  chatRef: React.RefObject<RemixUiRemixAiAssistantHandle>
  history: ChatMessage[] = []

  constructor() {
    super(profile)
    this.event = new EventEmitter()
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'remix-ai-assistant')
    this.chatRef = createRef<RemixUiRemixAiAssistantHandle>()
    ;(window as any).remixAIChat = this.chatRef
  }

  async onActivation() {
    if (!localStorage.getItem('remixaiassistant_firstload_flag')) {
      this.call('sidePanel', 'pinView', this.profile)
      await this.call('layout', 'maximiseSidePanel')
    }
    localStorage.setItem('remixaiassistant_firstload_flag', '1')
  }

  onDeactivation() {}

  async makePluginCall(pluginName: string, methodName: string, payload: any) {
    try {
      const result = await this.call(pluginName, methodName, payload)
      return result
    } catch (error) {
      if (pluginName === 'fileManager' && methodName === 'getCurrentFile') {
        await this.call('notification', 'alert', 'No file is open')
        return null
      }
      console.error(error)
      return null
    }
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent() {
    this.dispatch({
      queuedMessage: this.queuedMessage,
    })
  }

  chatPipe = (message: string) => {
    // If the inner component is mounted, call it directly
    if (this.chatRef?.current) {
      this.chatRef.current.sendChat(message)
      return
    }

    // Otherwise queue it for first render
    this.queuedMessage = {
      text: message,
      timestamp: Date.now()
    }
    this.renderComponent()
  }

  onReady() {
    console.log('RemixAiAssistant onReady')
  }

  render() {
    return (
      <div id="remix-ai-assistant"
        data-id="remix-ai-assistant">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  async handleActivity(type: string, payload: any) {
    // Use the proper type-safe tracking helper with RemixAI events
    trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: `${type}-${payload}`, isClick: true })
  }

  updateComponent(state: {
    queuedMessage: { text: string, timestamp: number } | null
  }) {
    return (
      <RemixUiRemixAiAssistant
        onActivity={this.handleActivity.bind(this)}
        ref={this.chatRef}
        plugin={this}
        initialMessages={this.history}
        onMessagesChange={(msgs) => { this.history = msgs }}
        queuedMessage={state.queuedMessage}
      />
    )
  }

}
