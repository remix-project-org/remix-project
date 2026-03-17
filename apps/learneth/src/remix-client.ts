import { PluginClient } from '@remixproject/plugin'
import { createClient } from '@remixproject/plugin-webview'
import { store } from './redux/store'
import { router } from './App'

class RemixClient extends PluginClient {
  private currentTutorial: any | null = null

  constructor() {
    super()
    createClient(this)
  }

  startTutorial(name: any, branch: any, id: any): void {
    (window as any).startTutorialCalled = true
    void router.navigate('/home')
    store.dispatch({
      type: 'workshop/loadRepo',
      payload: {
        name,
        branch,
        id,
      },
    })
  }

  getCurrentTutorial(): any {
    return this.currentTutorial
  }

  addRepository(name: any, branch: any) {
    void router.navigate('/home')
    store.dispatch({
      type: 'workshop/loadRepo',
      payload: {
        name,
        branch,
      },
    })
  }

  setCurrentTutorial(tutorial: any): void {
    this.currentTutorial = tutorial
  }

  clearCurrentTutorial(): void {
    this.currentTutorial = null
  }
}

export default new RemixClient()
