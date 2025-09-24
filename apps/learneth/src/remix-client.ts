import { PluginClient } from '@remixproject/plugin'
import { createClient } from '@remixproject/plugin-webview'
import { store } from './redux/store'
import { router } from './App'

class RemixClient extends PluginClient {
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
}

export default new RemixClient()
