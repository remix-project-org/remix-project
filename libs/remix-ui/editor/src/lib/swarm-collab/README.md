# Swarm live collaboration

Real-time collaborative editing of a Remix workspace. Edits travel peer to peer over WebRTC, and the document is
persisted on [Swarm](https://ethswarm.org), so a peer that was offline catches up from there. It is built on
[`@solarpunkltd/swarm-collaborative-docs`](https://github.com/Solar-Punk-Ltd/swarm-collaborative-docs). This folder only integrates it with Remix.

---

## Using it

1. Click **Collaborate** in the top-right corner of the editor.
2. Enter a name, a Bee node URL and a postage stamp, then click **Start session**. The workspace you are in is now
   shared.
3. Click **Copy invite** and send the link to the people you want to edit with.
4. When someone opens the link, Remix shows the join dialog, also in a tab that already has Remix open. They join into
   a workspace of their own, named `swarm-collab-<room id>`, so their existing workspaces are never touched. The
   editor stays read-only until the shared files have arrived.

**Joining without opening the link.** Click **Collaborate**, then **Join a session**, and either paste the invite link
or enter the room key and host address. Anyone in the session finds both under **Room key and host address** in their
session panel. Neither names the transport, so the joiner picks the room's transport under **Connection**. The room
key gives the same full access as the link.

**Opening a second invite.** An invite for another room asks before switching, and joining leaves the current session.
The invite of the current room just opens the session panel.

**Reloading** rejoins the same session in the same workspace. **Leaving** happens through **Leave session** or by
switching to another workspace.

---

## Setup

Every participant needs:

- **a Bee node reachable from the browser**, since every participant writes their own Swarm feeds;
- **a usable postage stamp on that node**, which is checked when the session starts.

| Setting          | Default                        | Notes                                                                                                                       |
| ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Bee node URL     | `http://localhost:1633`        | Prefilled from Remix's `settings/swarm-private-bee-address`.                                                                |
| Postage stamp    | —                              | Required. 64 hex characters, owned by that node. Prefilled from `settings/swarm-postage-stamp-id`.                          |
| Transport        | WebRTC via a signaling server  | The alternative signals over Swarm feeds: no server, but slower to connect. A room keeps the transport it was created with. |
| Signaling server | `ws://localhost:4444`          | A [y-webrtc](https://github.com/yjs/y-webrtc) signaling server.                                                             |
| STUN / TURN      | `stun:stun.l.google.com:19302` | Comma-separated. Add a TURN server for peers behind symmetric NATs.                                                         |

The defaults are `DEFAULT_SETTINGS` in [`settings.ts`](./settings.ts). Each browser keeps its own values in
`localStorage` under `remix.swarmCollab.settings`.

### Running it locally

```bash
PORT=4444 npx y-webrtc-signaling      # signaling server, from the y-webrtc package
yarn serve                            # Remix, as usual
```

Run a Bee node (v2.8.1 or later) with a usable stamp for each participant, and open the invite link in a second
browser profile.

### Hosted deployments

- **Use `wss://` for the signaling server.** An `https://` page cannot open a `ws://` socket except to localhost.
- **Serve the Bee node over `https://`, with CORS set for the Remix origin.** Browsers block an `http://` node from an
  `https://` page, except on localhost.
- **The signaling server learns nothing.** Signaling is encrypted with a password derived from the room key, and the
  room name reveals no feed address, so the server can neither read the traffic nor join the room.

---

## How it works

### Components

```
remix-ui-editor.tsx   mounts <SwarmCollab />                                      (+2 lines)
actions/editor.ts     SET_VALUE hands writes for a shared model to its binding     (+2 lines)

SwarmCollab.tsx         toolbar button, create/join dialog, session panel, remote carets
 └ collabSession.ts       one session: workspace, SwarmDoc, library events → CollabState
    ├ workspaceSync.ts      workspace files on disk ⇄ shared document
    └ monacoBinding.ts      the open file's Monaco model ⇄ its shared text
text.ts               minimal text diffs, line-ending normalisation, echo detection
settings.ts           settings, identity, session id, invite links, workspace names
```

`CollabSession` holds all state and exposes it as one `CollabState` snapshot through `subscribe()`. The React
component only renders that snapshot and calls `create`, `join`, `leave` and `setActiveFile`.

### Session phases

```
idle ──create/join/resume──▶ connecting ──DOC_READY──▶ syncing ──DOC_SYNC_STATE{synced}──▶ live
  ▲                              │                        │                                 │
  └──────────── leave(error?) ◀──┴────────────────────────┴─────────────────────────────────┘
```

| Phase        | What happens                                                                                                                                                | The user sees                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `connecting` | The editor goes read-only, Remix switches to the room's workspace (creating it for a joiner), and the `SwarmDoc` starts.                                    | Connecting…                    |
| `syncing`    | The library's Swarm start-up is done: the stamp is valid, the session's feed position is known and the members are read. It waits for peers that owe state. | Syncing… (waiting for N peers) |
| `live`       | The creator seeds if the room is empty, file events are wired, the editor is writable and the open file is bound.                                           | Live · N connected             |

Any failure leaves the session and shows the error. A peer that never delivers its state does not block a session:
the library opens it anyway after a grace period.

### The shared document

```
Y.Map  "remix:files"             index of shared paths
Y.Text "file:<path>"             one root-level text per file
```

Root-level types are identified by name, so two peers touching the same file always edit the same text. A text held
inside the map could be replaced by a concurrent `set`, losing whatever was typed into it. Root-level types cannot be
deleted, so the index says which files exist, and a removed file's text is emptied.

**What is shared.** Text source and config files, up to 500 files of at most 512 KB each.

- **Skipped as build output and dependencies:** `artifacts`, `.deps`, `.states`, `.git`, `node_modules`, `cache` and
  `build`.
- **Never shared, as secrets:** `.env`, `.env.*`, `*.env`, `*.pem` and `*.key`. Room content is stored on Swarm and is
  readable by anyone with the room key.

The rules are `isShareable` in [`workspaceSync.ts`](./workspaceSync.ts).

**Who seeds.** Only the room's creator writes its workspace into the document, and only once synced and while the
index is empty. Joiners mirror the index into their own workspace and never seed. Every new Remix workspace starts from
the same template files, and if every peer seeded, Yjs would merge the copies into duplicated content.

### Flows

```
local keystroke   Monaco model ──▶ YTextModelBinding ──▶ Y.Text ──▶ peers (WebRTC) and Swarm snapshot
remote edit       Y.Text ──▶ YTextModelBinding ──▶ Monaco model        (the open file; autosave writes it)
                  Y.Text ──▶ WorkspaceSync ──▶ fileManager.writeFile    (other files; 400 ms debounce)
file event        add / remove / rename / save ──▶ WorkspaceSync ──▶ index and Y.Text
```

- **The open file** is bound directly to its text. Remix's autosave writes it to disk as usual, so `WorkspaceSync`
  leaves that one file alone.
- **Every other shared file** is written to disk when a remote change arrives, and read back into the document when
  a Remix file event reports a local change: autosave, another plugin, or remixd.
- **Text changes are minimal edits.** A changed file is applied as the smallest replacement that turns the old text
  into the new one, never as a whole-text replace, so concurrent edits elsewhere in the file survive.
- **Line endings are LF everywhere.** Monaco and Yjs must agree on character offsets, and a CRLF counts as two.

### Echoes, and the `SET_VALUE` guard

Every change is written onward, so each layer also receives its own writes back. Some of these echoes are stale. The
important one is Remix's own: after each save, `fileManager.syncEditor` writes the saved text back into the open model
with `setValue`. If remote edits arrived while the save was in flight, that replaces them for everyone.

Both sync layers therefore remember the last few versions of each text, as 32-bit hashes (`RecentTexts` in
[`text.ts`](./text.ts)):

- content that was held recently is an echo, and is ignored;
- content never held is a real change, and is applied as a minimal edit.

The guard in `actions/editor.ts` sends every `setValue` for a shared model through this check, so the save echo is
dropped while a write from another plugin, for example an AI edit, still reaches everyone.

### Binding Monaco

`YTextModelBinding` does what `y-monaco` does, apart from awareness, using only the model API. `y-monaco` imports
`monaco-editor/esm/...`, while Remix loads Monaco as a global and externalises only the bare `monaco-editor` import,
so it would bundle a second copy of Monaco.

### Identity and invites

- **Identity.** Each browser gets one random key on first use, kept in `localStorage`
  (`remix.swarmCollab.identitySeed`). It owns the user's announce feed, and each tab's signing key is derived from it.
  It is not a wallet.
- **Sessions.** Each tab is a separate session, with an id in `sessionStorage`. One person with two tabs shows as one
  person with two tabs.
- **Invites.** The room key travels only in the URL fragment, which browsers do not send to servers. It is removed
  from the address bar as soon as it is read, and Remix's own hash parameters stay. Anyone holding it can read and edit
  the workspace. There is no per-person access and no revocation.

---

## Dependencies

| Package                                  | Version    | Why                                                                                                  |
| ---------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `@solarpunkltd/swarm-collaborative-docs` | `^0.1.0`   | The session. Brings its own `@ethersphere/bee-js` 13; Remix's `bee-js` 8 for publish-to-Swarm stays. |
| `yjs`                                    | `^13.6.30` | A peer dependency of the library, so Remix and the library share one Yjs instance.                   |
| `y-webrtc`                               | `^10.3.0`  | The signaling-server transport. Loaded only when a session starts.                                   |

---

## Known limitations and improvements

- **Small groups:** every session connects to every other one, and member discovery reads up to 32 identities.
- **Plaintext on Swarm:** content is stored unencrypted, and older snapshots keep content that was later deleted.
- **Undo:** remote edits bypass Monaco's undo stack. Undo worked in testing; a `Y.UndoManager` would limit it to your own edits.
- **Rejoining:** changes made to shared files while outside the session are overwritten by the room's version.
- **Renames:** a peer's concurrent edits to a file being renamed are dropped.
- **Remote carets:** they use plain offsets, and can drift briefly while someone types above them.
- **Concurrent creation:** two peers creating the same new path at once merge both contents into it.
- **Echo detection:** an external write that equals a recent version of the file is ignored.
- **Large files:** each keystroke hashes the open file, which is linear in its size.
- **Identity key:** it is kept in plain `localStorage`.
- **Stamp cost:** every participant pays for their own writes.

---
