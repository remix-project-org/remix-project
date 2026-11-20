import tape from 'tape'
import { ChatHistoryStorageManager } from '../src/storage/storageManager'
import { IChatHistoryBackend, SyncOperation, SyncResult } from '../src/storage/interfaces'

const successfulResult: SyncResult = {
  success: true,
  conversationsSynced: 1,
  messagesSynced: 0,
  errors: [],
  timestamp: Date.now()
}

const createLocalBackend = (): IChatHistoryBackend => ({
  name: 'local',
  async init () {},
  async isAvailable () { return true },
  supportsSync () { return false },
  async saveConversation () {},
  async getConversations () { return [] },
  async getConversation () { return null },
  async updateConversation () {},
  async deleteConversation () {},
  async saveMessage () {},
  async saveBatch () {},
  async getMessages () { return [] }
})

tape('ChatHistoryStorageManager sync queue forwarding', t => {
  t.test('forwards queued local operations to the cloud backend', async st => {
    const queued: SyncOperation[] = []
    const cloudBackend: IChatHistoryBackend = {
      name: 'cloud',
      async init () {},
      async isAvailable () { return true },
      supportsSync () { return true },
      queueSync (operation) { queued.push(operation) },
      async push () {
        st.equal(queued.length, 1, 'push sees the operation queued by the manager')
        return successfulResult
      },
      async saveConversation () {},
      async getConversations () { return [] },
      async getConversation () { return null },
      async updateConversation () {},
      async deleteConversation () {},
      async saveMessage () {},
      async saveBatch () {},
      async getMessages () { return [] }
    }

    const manager = new ChatHistoryStorageManager(createLocalBackend(), cloudBackend)
    await manager.init()
    await manager.createConversation('default')

    st.equal(queued.length, 1, 'cloud backend receives the pending operation')
    st.equal(queued[0].type, 'conversation')
    st.equal(queued[0].action, 'create')

    await manager.syncToCloud()
    manager.destroy()
    st.end()
  })
})
