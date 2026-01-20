# RemixAI Chat History - Persistent Storage Implementation Plan

## Executive Summary

Implement persistent chat history for RemixAI assistant using IndexedDB, enabling conversation management across sessions with a toggleable floating sidebar UI.

**Key Features:**
- Persistent storage via IndexedDB (separate database: `RemixAIChatHistory`)
- Cloud sync capability (AWS S3 or similar) for cross-device access
- Conversation-based organization (global, not workspace-specific)
- Auto-generated conversation titles from first user message
- Auto-archive conversations after 30 days of inactivity
- Floating sidebar UI (toggleable, 280-320px width)
- Search/filter functionality
- Archive view for old conversations

**Core Changes:**
- New `ChatHistoryStorage` service class for IndexedDB operations
- Abstract storage interface for pluggable backends (IndexedDB, S3, etc.)
- Cloud sync service for remote backup/restore
- Enhanced `ChatHistory` core class with persistence layer
- New `ChatHistorySidebar` UI component with conversation list
- Plugin state management for conversation lifecycle
- Sync between UI messages and persistent storage

## Current State Analysis

### Existing Dual History Systems
1. **UI Messages** (`ChatMessage[]`): React state in component, volatile, unlimited size
2. **Core ChatHistory** (`ChatEntry[]`): Static class, in-memory, max 7 entries for AI context

### Key Finding: Sync Gap
- UI messages updated immediately (optimistic)
- ChatHistory only updated when inference completes (`done_cb` in stream handlers)
- Neither system persists to storage (lost on page refresh)

### Storage Infrastructure
- **IndexedDB**: Currently used exclusively for file system (`RemixFileSystem` database)
- **localStorage**: Used for plugin permissions, settings (5-10MB limit)
- **No existing abstraction**: For structured IndexedDB data storage

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         RemixAI Plugin                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │   currentConversationId, conversations[]                  │  │
│  │   - newConversation()                                     │  │
│  │   - loadConversation(id)                                  │  │
│  │   - autoArchiveCheck()                                    │  │
│  └─────────────────────┬───────────────────────────────────────┘  │
│                        │                                          │
└────────────────────────┼──────────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
┌───────────────────┐            ┌──────────────────────┐
│   UI Component    │            │  ChatHistory (Core)  │
│                   │            │                      │
│ messages: []      │            │ chatEntries: []      │
│ showHistorySidebar│◄───────────│ storage: ChatHistory │
│                   │   sync     │         Storage      │
│ - sendPrompt()    │            │                      │
│ - loadConv()      │            │ - pushHistory()      │
└─────────┬─────────┘            │ - loadConversation() │
          │                      └──────────┬───────────┘
          │                                 │
          ▼                                 ▼
┌──────────────────────┐         ┌────────────────────────┐
│  ChatHistorySidebar  │         │  ChatHistoryStorage    │
│                      │         │                        │
│ - ConversationList   │         │ db: IDBDatabase        │
│ - SearchBar          │         │                        │
│ - ArchiveToggle      │         │ - saveMessage()        │
│ - ConversationItem   │         │ - getConversations()   │
└──────────────────────┘         │ - autoArchive()        │
                                 └────────────┬───────────┘
                                              │
                                              ▼
                                 ┌────────────────────────┐
                                 │   IndexedDB            │
                                 │                        │
                                 │ RemixAIChatHistory     │
                                 │ - conversations        │
                                 │ - messages             │
                                 └────────────────────────┘
```

## Architecture Design

### Storage Abstraction Layer

To support both local (IndexedDB) and cloud (AWS S3, etc.) storage, we'll implement a pluggable storage backend system:

#### Storage Interface

```typescript
// Base interface for all storage backends
interface IChatHistoryBackend {
  name: string

  // Initialization
  init(): Promise<void>
  isAvailable(): Promise<boolean>

  // Conversation operations
  saveConversation(metadata: ConversationMetadata): Promise<void>
  getConversations(archived?: boolean): Promise<ConversationMetadata[]>
  getConversation(id: string): Promise<ConversationMetadata | null>
  updateConversation(id: string, updates: Partial<ConversationMetadata>): Promise<void>
  deleteConversation(id: string): Promise<void>

  // Message operations
  saveMessage(message: PersistedChatMessage): Promise<void>
  saveBatch(conversationId: string, messages: ChatMessage[]): Promise<void>
  getMessages(conversationId: string): Promise<ChatMessage[]>

  // Sync operations (for cloud backends)
  supportsSync(): boolean
  push?(): Promise<SyncResult>
  pull?(): Promise<SyncResult>
  getLastSyncTime?(): Promise<number | null>
}

interface SyncResult {
  success: boolean
  conversationsSynced: number
  messagesSynced: number
  errors?: string[]
  timestamp: number
}

// Storage manager that coordinates multiple backends
export class ChatHistoryStorageManager {
  private localBackend: IChatHistoryBackend
  private cloudBackend?: IChatHistoryBackend
  private syncEnabled: boolean = false

  constructor(local: IChatHistoryBackend, cloud?: IChatHistoryBackend) {
    this.localBackend = local
    this.cloudBackend = cloud
  }

  async init() {
    await this.localBackend.init()
    if (this.cloudBackend) {
      await this.cloudBackend.init()
      this.syncEnabled = await this.cloudBackend.isAvailable()
    }
  }

  // All operations route to local first, then optionally sync to cloud
  async saveMessage(message: PersistedChatMessage): Promise<void> {
    await this.localBackend.saveMessage(message)
    if (this.syncEnabled) {
      await this.queueCloudSync('message', message)
    }
  }

  // Pull from cloud on startup if available
  async pullFromCloud(): Promise<SyncResult | null> {
    if (!this.cloudBackend?.pull) return null
    const result = await this.cloudBackend.pull()
    if (result.success) {
      // Merge cloud data into local
      await this.mergeCloudData(result)
    }
    return result
  }

  // Manual sync trigger
  async syncToCloud(): Promise<SyncResult | null> {
    if (!this.cloudBackend?.push) return null
    return await this.cloudBackend.push()
  }
}
```

### Storage Layer

#### Backend 1: IndexedDB (Local)

#### New IndexedDB Database: `RemixAIChatHistory`

**Object Stores:**
1. **conversations** - Store complete conversation threads
   - Key: `conversationId` (UUID)
   - Indexes: `timestamp`, `archived`, `workspace`

2. **messages** - Individual message records
   - Key: `messageId` (UUID)
   - Indexes: `conversationId`, `timestamp`, `role`

**Data Structures:**
```typescript
interface ConversationMetadata {
  id: string
  title: string                 // Auto-generated from first prompt (max 50 chars)
  createdAt: number
  updatedAt: number
  lastAccessedAt: number        // For auto-archive logic
  archived: boolean
  archivedAt?: number           // When it was archived
  messageCount: number
  preview: string               // First 100 chars of first message
}

interface PersistedChatMessage extends ChatMessage {
  conversationId: string
  // Inherits: id, role, content, timestamp, sentiment
}
```

#### Storage Service Class: `ChatHistoryStorage`
Location: `libs/remix-ai-core/src/storage/chatHistoryStorage.ts`

```typescript
export class ChatHistoryStorage {
  private db: IDBDatabase | null = null
  private dbName = 'RemixAIChatHistory'
  private dbVersion = 1

  // Initialization
  async init(): Promise<void>

  // Conversation management
  async createConversation(workspace: string): Promise<string>
  async getConversations(archived?: boolean): Promise<ConversationMetadata[]>
  async getConversation(id: string): Promise<ConversationMetadata | null>
  async updateConversation(id: string, updates: Partial<ConversationMetadata>): Promise<void>
  async archiveConversation(id: string): Promise<void>
  async deleteConversation(id: string): Promise<void>

  // Message operations
  async saveMessage(message: PersistedChatMessage): Promise<void>
  async saveBatch(conversationId: string, messages: ChatMessage[]): Promise<void>
  async getMessages(conversationId: string): Promise<ChatMessage[]>
  async updateMessageSentiment(messageId: string, sentiment: 'like' | 'dislike' | 'none'): Promise<void>

  // Search & filtering
  async searchConversations(query: string): Promise<ConversationMetadata[]>

  // Auto-archive logic
  async autoArchiveOldConversations(daysThreshold: number): Promise<string[]>
  async touchConversation(id: string): Promise<void> // Update lastAccessedAt

  // Cleanup
  async clearAll(): Promise<void>
}
```

#### Backend 2: AWS S3 Cloud Storage

Location: `libs/remix-ai-core/src/storage/cloudBackend.ts`

**Architecture:**
- Each conversation stored as separate JSON file
- S3 structure: `user-{userId}/conversations/{conversationId}.json`
- Conversations list stored as index file: `user-{userId}/index.json`
- Uses AWS SDK v3 for S3 operations
- Authentication via Remix Pro token or IAM credentials

```typescript
export class S3ChatHistoryBackend implements IChatHistoryBackend {
  name = 's3'
  private s3Client: S3Client
  private bucketName: string
  private userId: string
  private syncQueue: SyncOperation[] = []

  constructor(config: S3Config) {
    this.bucketName = config.bucketName
    this.userId = config.userId
    this.s3Client = new S3Client({
      region: config.region,
      credentials: config.credentials
    })
  }

  async init(): Promise<void> {
    // Test S3 access
    try {
      await this.s3Client.send(new HeadBucketCommand({
        Bucket: this.bucketName
      }))
    } catch (error) {
      console.error('S3 backend unavailable:', error)
    }
  }

  async isAvailable(): Promise<boolean> {
    // Check if user is authenticated and has cloud sync enabled
    const token = localStorage.getItem('remix_pro_token')
    return !!token && !!this.userId
  }

  supportsSync(): boolean {
    return true
  }

  // Push local data to S3
  async push(): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      conversationsSynced: 0,
      messagesSynced: 0,
      errors: [],
      timestamp: Date.now()
    }

    try {
      // Process sync queue
      for (const operation of this.syncQueue) {
        await this.executeSyncOperation(operation)
        if (operation.type === 'conversation') result.conversationsSynced++
        if (operation.type === 'message') result.messagesSynced++
      }

      this.syncQueue = []
      result.success = true
      await this.setLastSyncTime(result.timestamp)
    } catch (error) {
      result.errors?.push(error.message)
    }

    return result
  }

  // Pull cloud data to local
  async pull(): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      conversationsSynced: 0,
      messagesSynced: 0,
      timestamp: Date.now()
    }

    try {
      // Download index file
      const indexKey = `user-${this.userId}/index.json`
      const indexData = await this.getObject(indexKey)
      const index = JSON.parse(indexData) as CloudIndex

      // Download each conversation that's newer than local
      for (const convMeta of index.conversations) {
        const localConv = await this.localBackend.getConversation(convMeta.id)
        if (!localConv || convMeta.updatedAt > localConv.updatedAt) {
          const convKey = `user-${this.userId}/conversations/${convMeta.id}.json`
          const convData = await this.getObject(convKey)
          const conversation = JSON.parse(convData) as ConversationData

          // Return data for local backend to merge
          result.conversationsSynced++
          result.messagesSynced += conversation.messages.length
        }
      }

      result.success = true
    } catch (error) {
      result.errors = [error.message]
    }

    return result
  }

  async getLastSyncTime(): Promise<number | null> {
    return parseInt(localStorage.getItem('remix-ai-last-cloud-sync') || '0')
  }

  private async setLastSyncTime(timestamp: number): Promise<void> {
    localStorage.setItem('remix-ai-last-cloud-sync', timestamp.toString())
  }

  private async getObject(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    })
    const response = await this.s3Client.send(command)
    return await response.Body.transformToString()
  }

  private async putObject(key: string, data: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ContentType: 'application/json'
    })
    await this.s3Client.send(command)
  }
}
```

**Cloud Storage Structure:**
```
remix-ai-chat-history-bucket/
├── user-abc123/
│   ├── index.json                    # List of all conversations
│   └── conversations/
│       ├── conv-uuid-1.json          # Conversation + messages
│       ├── conv-uuid-2.json
│       └── ...
├── user-def456/
│   └── ...
```

**Sync Strategy:**
- **Optimistic local-first**: All writes go to local IndexedDB immediately
- **Background sync**: Queue cloud sync operations, batch upload periodically
- **Conflict resolution**: Last-write-wins based on `updatedAt` timestamp
- **Offline support**: Full functionality without cloud connectivity
- **Pull on startup**: Check cloud for newer data when plugin activates

**Authentication:**
- Use existing `remix_pro_token` from localStorage
- Token validated via Remix backend API
- User ID extracted from token payload
- Fallback to anonymous mode (local-only) if no token

### Integration Layer

#### Enhanced ChatHistory (Core)
Location: `libs/remix-ai-core/src/prompts/chat.ts`

Changes:
- Add `storage: ChatHistoryStorage` instance
- Add `currentConversationId: string | null`
- Enhance `pushHistory()` to persist via storage
- Add `loadConversation(id: string)` method
- Keep existing queue behavior (max 7 for context)

```typescript
export abstract class ChatHistory {
  private static chatEntries: ChatEntry[] = []
  private static storage: ChatHistoryStorage
  private static currentConversationId: string | null = null
  static queueSize: number = 7

  static async init() {
    this.storage = new ChatHistoryStorage()
    await this.storage.init()
  }

  static async startNewConversation(workspace: string) {
    this.currentConversationId = await this.storage.createConversation(workspace)
    this.clearHistory() // Clear in-memory context
  }

  public static async pushHistory(prompt: string, result: string) {
    // Existing in-memory logic
    // ... existing code ...

    // Persist to IndexedDB
    if (this.storage && this.currentConversationId) {
      const userMsg = { /* ChatMessage for user */ }
      const assistantMsg = { /* ChatMessage for assistant */ }
      await this.storage.saveBatch(this.currentConversationId, [userMsg, assistantMsg])
    }
  }

  static async loadConversation(id: string) {
    const messages = await this.storage.getMessages(id)
    this.currentConversationId = id
    // Rebuild chatEntries from last 7 messages
    this.chatEntries = messages.slice(-7).map(/* convert to tuple */)
  }
}
```

#### Plugin State Management
Location: `apps/remix-ide/src/app/plugins/remix-ai-assistant.tsx`

Changes:
- Add `currentConversationId: string | null`
- Add `conversations: ConversationMetadata[]`
- Initialize ChatHistory storage in `onActivation()`
- Add methods: `loadConversation()`, `newConversation()`, `archiveConversation()`

```typescript
export class RemixAIAssistant extends ViewPlugin {
  history: ChatMessage[] = []
  currentConversationId: string | null = null
  conversations: ConversationMetadata[] = []

  async onActivation() {
    await ChatHistory.init()
    // Load or create conversation
    const workspace = await this.call('fileManager', 'getCurrentWorkspace')
    await this.loadOrCreateConversation(workspace)
  }

  async loadOrCreateConversation(workspace: string) {
    // Try to load last active conversation, or create new
  }

  async newConversation() {
    const workspace = await this.call('fileManager', 'getCurrentWorkspace')
    this.currentConversationId = await ChatHistory.startNewConversation(workspace)
    this.history = []
    this.renderComponent()
  }

  async loadConversation(id: string) {
    const messages = await ChatHistory.storage.getMessages(id)
    this.history = messages
    this.currentConversationId = id
    await ChatHistory.loadConversation(id)
    this.renderComponent()
  }
}
```

### UI Layer

#### Chat History Sidebar Component
New file: `libs/remix-ui/remix-ai-assistant/src/components/chatHistorySidebar.tsx`

Features:
- List of conversations with previews
- Search/filter functionality
- Archive view toggle
- New chat button
- Conversation actions (rename, archive, delete)

Layout:
```tsx
<div className="chat-history-sidebar">
  <ChatHistoryHeading onNewChat={...} onToggleArchive={...} />
  <SearchBar value={searchQuery} onChange={...} />
  <div className="conversation-list">
    {conversations.map(conv => (
      <ConversationItem
        key={conv.id}
        conversation={conv}
        active={conv.id === currentConversationId}
        onClick={() => loadConversation(conv.id)}
        onArchive={() => archiveConversation(conv.id)}
        onDelete={() => deleteConversation(conv.id)}
      />
    ))}
  </div>
</div>
```

#### Enhanced Chat History Heading
Location: `libs/remix-ui/remix-ai-assistant/src/components/chatHistoryHeading.tsx`

Make icons functional:
- History icon: Toggle chat history sidebar
- Archive icon: Show archived conversations
- New chat button: Create new conversation

#### Main Component Integration
Location: `libs/remix-ui/remix-ai-assistant/src/components/remix-ui-remix-ai-assistant.tsx`

Changes:
- Add `showHistorySidebar` state
- Add `conversations` prop from plugin
- Pass conversation management methods
- Conditional rendering for sidebar vs fullscreen

### Auto-Archive Mechanism

#### Configuration
- **Threshold**: 30 days (configurable via settings)
- **Check Frequency**: On plugin activation and every 24 hours
- **Storage Key**: `remix-ai-chat-archive-threshold` in localStorage

#### Logic
```typescript
// Run on plugin activation
async autoArchiveCheck() {
  const threshold = parseInt(localStorage.getItem('remix-ai-chat-archive-threshold') || '30')
  const archivedIds = await this.storage.autoArchiveOldConversations(threshold)

  if (archivedIds.length > 0) {
    console.log(`Auto-archived ${archivedIds.length} conversations older than ${threshold} days`)
  }
}

// In storage class
async autoArchiveOldConversations(daysThreshold: number): Promise<string[]> {
  const cutoffTime = Date.now() - (daysThreshold * 24 * 60 * 60 * 1000)
  const conversations = await this.getConversations(false) // Non-archived only

  const toArchive = conversations.filter(conv =>
    conv.lastAccessedAt < cutoffTime
  )

  const archivedIds: string[] = []
  for (const conv of toArchive) {
    await this.archiveConversation(conv.id)
    archivedIds.push(conv.id)
  }

  return archivedIds
}
```

#### User Experience
- Archived conversations still accessible via archive view
- No data loss, just organizational separation
- User can manually restore from archive
- Badge shows count of archived items

### Responsive UI Modes

#### Floating Sidebar (Toggleable)
- Default state: Hidden
- Activated by: History icon in chat heading
- Position: Floats to the left of the active chat area
- Width: 280-320px (fixed, not resizable in MVP)
- Background: Semi-transparent overlay or solid panel
- Can be toggled on/off by user
- Persists visibility preference in localStorage

#### Layout Behavior
- When sidebar visible: Chat area width adjusts (shrinks)
- When sidebar hidden: Chat area uses full width
- Sidebar overlays chat on mobile/narrow screens
- Click outside sidebar (on overlay) closes it on mobile

## Implementation Steps

### Phase 1: Storage Abstraction & IndexedDB
1. Define `IChatHistoryBackend` interface and related types
2. Create `ChatHistoryStorageManager` coordinator class
3. Implement `IndexedDBChatHistoryBackend` class with full CRUD operations
4. Add TypeScript interfaces for all data structures
5. Add error handling and quota management
6. Write unit tests for IndexedDB backend

### Phase 2: Cloud Sync Infrastructure
7. Implement `S3ChatHistoryBackend` class
8. Add sync queue and batching logic
9. Implement conflict resolution (last-write-wins)
10. Add authentication layer (Remix Pro token integration)
11. Create sync status indicator for UI
12. Write unit tests for cloud backend
13. Add integration tests for sync operations

### Phase 3: Core Integration
14. Enhance `ChatHistory` class with StorageManager integration
15. Update `pushHistory()` to persist messages
16. Add conversation management methods
17. Initialize storage manager in plugin `onActivation()`
18. Pull from cloud on plugin activation
19. Update message flow to create/load conversations

### Phase 4: UI Components
20. Create `ChatHistorySidebar` component
21. Create `ConversationItem` component
22. Add search/filter functionality
23. Enhance `ChatHistoryHeading` with functional icons
24. Add sync status indicator (cloud icon with animation)
25. Implement archive view

### Phase 5: State Management
26. Update plugin to manage conversation state
27. Pass conversation data to UI components
28. Implement conversation switching
29. Handle new conversation creation
30. Sync sentiment updates to storage
31. Add background sync timer (every 5 minutes when cloud enabled)

### Phase 6: Responsive Layout
32. Implement sidebar toggle logic
33. Add fullscreen split-view layout
34. Add responsive breakpoints
35. Test on mobile/tablet viewports

### Phase 7: Polish & Testing
36. Add loading states and transitions
37. Implement error boundaries
38. Add empty states (no conversations)
39. Add sync error handling and retry logic
40. Write E2E tests for conversation flow
41. Write E2E tests for cloud sync
42. Test IndexedDB quota handling
43. Test S3 connection failures
44. Add migration logic for existing users
45. Performance testing with large conversation histories

## Critical Files to Modify

### New Files
- `libs/remix-ai-core/src/storage/interfaces.ts` - Storage interfaces and types
- `libs/remix-ai-core/src/storage/storageManager.ts` - ChatHistoryStorageManager
- `libs/remix-ai-core/src/storage/indexedDBBackend.ts` - IndexedDB backend implementation
- `libs/remix-ai-core/src/storage/cloudBackend.ts` - S3 cloud backend implementation
- `libs/remix-ai-core/src/storage/syncQueue.ts` - Sync operation queue
- `libs/remix-ui/remix-ai-assistant/src/components/chatHistorySidebar.tsx` - History sidebar UI
- `libs/remix-ui/remix-ai-assistant/src/components/conversationItem.tsx` - Conversation list item
- `libs/remix-ui/remix-ai-assistant/src/components/syncStatusIndicator.tsx` - Cloud sync status
- `libs/remix-ui/remix-ai-assistant/src/hooks/useChatHistory.ts` - Chat history React hook
- `libs/remix-ui/remix-ai-assistant/src/hooks/useCloudSync.ts` - Cloud sync React hook

### Modified Files
- `libs/remix-ai-core/src/prompts/chat.ts` - Add storage manager integration
- `apps/remix-ide/src/app/plugins/remix-ai-assistant.tsx` - Conversation & sync state
- `libs/remix-ui/remix-ai-assistant/src/components/chatHistoryHeading.tsx` - Functional icons + sync indicator
- `libs/remix-ui/remix-ai-assistant/src/components/remix-ui-remix-ai-assistant.tsx` - UI integration + sidebar
- `libs/remix-ui/remix-ai-assistant/src/lib/types.ts` - Add conversation, sync types
- `package.json` - Add AWS SDK v3 dependencies

### Dependencies to Add
```json
{
  "@aws-sdk/client-s3": "^3.x",
  "@aws-sdk/credential-providers": "^3.x"
}
```

## Testing Strategy

### Unit Tests
- **IndexedDB Backend**: CRUD operations, error handling, quota management
- **Cloud Backend**: S3 operations, sync queue, authentication
- **Storage Manager**: Backend coordination, fallback logic
- **Conversation Logic**: Creation, loading, archiving
- **Message Operations**: Batch saves, sentiment updates
- **Search/Filter**: Query matching, result ordering

### Integration Tests
- **Local Persistence Flow**: Message → IndexedDB → retrieval
- **Cloud Sync Flow**: Local write → queue → S3 upload → download → merge
- **Conflict Resolution**: Concurrent updates, timestamp comparison
- **Conversation Switching**: State transitions, message loading
- **Archive Operations**: Auto-archive, manual archive/restore
- **Authentication Flow**: Token validation, fallback to local-only

### E2E Tests
- **Basic Flow**: Create conversation, send messages, persist, reload page
- **Multi-Conversation**: Create 3+ conversations, switch between them
- **Search**: Filter conversations by title/content
- **Archive**: Auto-archive old conversations, view archive, restore
- **Cloud Sync**: Enable cloud, sync conversations, access from "different device" (clear local)
- **Offline Mode**: Disable network, verify full functionality, re-enable, verify sync
- **Conflict Resolution**: Simulate concurrent updates from multiple devices

## Verification Plan

### 1. Local Storage Verification
- Open DevTools → Application → IndexedDB
- Verify `RemixAIChatHistory` database exists
- Check `conversations` and `messages` object stores
- Verify data structure matches schema
- Check localStorage for preferences (`remix-ai-chat-archive-threshold`, sidebar visibility)

### 2. Cloud Sync Verification
- **AWS Console**: Check S3 bucket for user data
- Verify folder structure: `user-{userId}/conversations/`
- Check `index.json` file format
- Verify individual conversation JSON files
- Check file timestamps match `updatedAt`

### 3. Conversation Flow
- Send messages in new conversation
- Verify IndexedDB write
- If cloud enabled, verify S3 upload (check sync indicator)
- Refresh page
- Verify messages persist from IndexedDB
- Create second conversation
- Switch between conversations
- Verify correct messages displayed
- Check network tab for S3 requests

### 4. Cross-Device Sync
- Device A: Create conversation with messages
- Wait for sync (or trigger manual sync)
- Device B (or incognito): Login with same account
- Verify conversation appears in list
- Verify messages load correctly
- Device B: Add new message
- Device A: Verify new message syncs down

### 5. Conflict Resolution
- Device A: Go offline, send message
- Device B: Send message to same conversation
- Device A: Go online
- Verify last-write-wins based on timestamp
- Verify no message loss

### 6. UI States
- Test sidebar toggle (persists preference)
- Test search functionality
- Test archive view toggle
- Test empty states (no conversations, no messages)
- Test sync status indicator (syncing, synced, error)

### 7. Edge Cases
- **IndexedDB quota exceeded**: Verify graceful degradation, user notification
- **S3 connection failure**: Verify local-only mode continues working
- **Authentication expiry**: Verify fallback to local-only
- **Corrupted IndexedDB**: Verify recovery or clear+resync from cloud
- **Network intermittent**: Verify queuing and retry logic
- **Large conversation history**: Test performance with 100+ conversations, 1000+ messages

## Requirements Confirmed

1. **Sidebar Layout**: Floating panel to the left of active chat (toggleable visibility)
2. **Conversation Scope**: Global across all workspaces
3. **Conversation Titles**: Auto-generated from first user message (no manual editing)
4. **Retention**: Auto-archive conversations older than configurable threshold (default 30 days)
5. **Cloud Sync**: Support AWS S3 or similar for cross-device access
6. **Storage Abstraction**: Pluggable backend system (IndexedDB + Cloud)
7. **Offline-First**: Full functionality without cloud, opportunistic sync when available

## Notes

### Storage Considerations
- **IndexedDB quota**: Typically 50MB+ (much larger than localStorage's 5-10MB)
- **S3 costs**: Minimal for chat history (text-only, compressed JSON)
- **Data sovereignty**: User data stays in their S3 bucket (configurable region)

### Implementation Priorities
1. **Phase 1 MVP**: IndexedDB local storage + UI
2. **Phase 2 Enhancement**: Cloud sync abstraction + S3 backend
3. **Future**: Support for other cloud providers (Google Cloud Storage, Azure Blob, etc.)

### Sync Performance
- **Batch operations**: Group multiple message writes into single S3 upload
- **Incremental sync**: Only sync modified conversations
- **Compression**: gzip JSON before S3 upload to reduce storage/transfer costs
- **Background sync**: Non-blocking, doesn't interrupt user experience

### Security & Privacy
- **Encryption at rest**: S3 server-side encryption (SSE-S3 or SSE-KMS)
- **Encryption in transit**: HTTPS for all S3 operations
- **Access control**: User-specific S3 paths, IAM policies
- **Token security**: Remix Pro token never sent to S3, only used for auth with Remix API

### Conversation Metadata
- Titles auto-generated using first 50 chars of first user message
- Archive feature allows cleanup without data loss
- Search can be enhanced later with full-text indexing
