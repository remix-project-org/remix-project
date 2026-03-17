# Workspace Lock API

> **Purpose**: Coordinate multi-device access to cloud workspaces using time-limited locks with heartbeats. Replaces poll-based version checking.

## Overview

Only one device at a time holds a lock on a workspace. The lock has a **60-second TTL** and the client sends a **heartbeat every 20 seconds** to keep it alive. If a device goes offline or closes the tab, the lock expires naturally and another device can acquire it.

**User-agnostic**: The lock system does NOT check who the user is. Auth is already handled upstream (JWT / STS). By the time a lock request reaches the backend, the user is authorized to access the workspace. The lock only tracks `workspace_uuid` → `device_id` — nothing else.

**Redis-only**: No MySQL involvement. Locks are ephemeral by nature (60s TTL) and don't need durability or relational integrity. Redis gives sub-millisecond operations and native TTL expiry for free.

---

## Endpoints

All endpoints are scoped to:

```
/api/workspaces/:uuid/lock
```

Auth middleware validates the JWT/session **before** the request reaches the lock handler, but the lock logic itself is user-agnostic.

### 1. Acquire Lock — `POST /api/workspaces/:uuid/lock`

Called when a device opens a cloud workspace.

**Request Body:**

```json
{
  "device_id": "a1b2c3d4-...",
  "ttl": 60
}
```

| Field       | Type   | Description                                                    |
|-------------|--------|----------------------------------------------------------------|
| `device_id` | string | Unique per browser session (`crypto.randomUUID()` in `sessionStorage`) |
| `ttl`       | number | Lock time-to-live in seconds (client requests 60)              |

**Responses:**

| Status | Meaning         | Body                                                                 |
|--------|-----------------|----------------------------------------------------------------------|
| `200`  | Lock acquired   | `{ "lock": { "device_id": "...", "ttl": 60 } }` |
| `409`  | Already locked  | `{ "error": "workspace_locked", "lock": { "device_id": "...", "ttl_remaining": 45 } }` |

**Notes:**
- If the Redis key doesn't exist (or has expired), set it and return `200`.
- If the key exists with a **different** `device_id`, return `409` with the remaining TTL.
- If the key exists with the **same** `device_id`, reset the TTL (re-acquire) and return `200`.

---

### 2. Heartbeat — `PUT /api/workspaces/:uuid/lock`

Called every **20 seconds** while the workspace is open and the tab is visible.

**Request Body:**

```json
{
  "device_id": "a1b2c3d4-..."
}
```

**Responses:**

| Status | Meaning                  | Body                                                                 |
|--------|--------------------------|----------------------------------------------------------------------|
| `200`  | Lock renewed             | `{ "lock": { "device_id": "...", "ttl": 60 } }`       |
| `409`  | Lock stolen by another   | `{ "error": "lock_stolen", "lock": { "device_id": "...", "ttl_remaining": 55 } }` |
| `404`  | No lock exists           | `{ "error": "no_lock" }`                                            |

**Notes:**
- `200`: The key's value matches this `device_id` — reset TTL to 60s.
- `409`: Key exists but belongs to a different `device_id`. Client must close the workspace.
- `404`: Key expired and nobody re-acquired. Client should re-acquire via `POST`.

---

### 3. Release Lock — `DELETE /api/workspaces/:uuid/lock`

Called on workspace close, `beforeunload`, or explicit deactivation. Enables instant handoff to another device without waiting for TTL expiry.

**Request Body (or query param):**

```json
{
  "device_id": "a1b2c3d4-..."
}
```

**Responses:**

| Status | Meaning              | Body                        |
|--------|----------------------|-----------------------------|
| `200`  | Lock released        | `{ "ok": true }`            |
| `403`  | Not your lock        | `{ "error": "not_owner" }`  |
| `404`  | No lock exists       | `{ "error": "no_lock" }`    |

**Notes:**
- Only delete the key if its value matches the `device_id` (use Lua script for atomicity).
- `403` / `404` are non-fatal — the client can ignore them.
- Consider using `navigator.sendBeacon()` for the `beforeunload` case since `fetch` may be cancelled. If that's easier, this endpoint can also accept a `POST` with `_method=DELETE` or a dedicated `POST /api/workspaces/:uuid/unlock` alias.

---

## Backend: Redis Implementation

### Key Format

```
ws-lock:<workspace_uuid>
```

Value: just the `device_id` string. TTL handled by Redis natively.

### Acquire (POST) — Redis Commands

```lua
-- Atomic acquire via Lua script
local key = KEYS[1]           -- "ws-lock:<uuid>"
local device_id = ARGV[1]     -- requesting device
local ttl = tonumber(ARGV[2]) -- 60

local current = redis.call('GET', key)
if current == false then
  -- No lock exists → acquire
  redis.call('SET', key, device_id, 'EX', ttl)
  return { 'OK', device_id, ttl }
elseif current == device_id then
  -- Same device re-acquire → reset TTL
  redis.call('EXPIRE', key, ttl)
  return { 'OK', device_id, ttl }
else
  -- Different device holds it
  local remaining = redis.call('TTL', key)
  return { 'LOCKED', current, remaining }
end
```

- `OK` → HTTP `200`
- `LOCKED` → HTTP `409`

### Heartbeat (PUT) — Redis Commands

```lua
local key = KEYS[1]
local device_id = ARGV[1]
local ttl = 60

local current = redis.call('GET', key)
if current == false then
  return { 'NOT_FOUND' }
elseif current == device_id then
  redis.call('EXPIRE', key, ttl)
  return { 'OK', device_id, ttl }
else
  local remaining = redis.call('TTL', key)
  return { 'STOLEN', current, remaining }
end
```

- `OK` → HTTP `200`
- `STOLEN` → HTTP `409`
- `NOT_FOUND` → HTTP `404`

### Release (DELETE) — Redis Commands

```lua
-- Atomic delete-if-owner
local key = KEYS[1]
local device_id = ARGV[1]

local current = redis.call('GET', key)
if current == false then
  return 'NOT_FOUND'
elseif current == device_id then
  redis.call('DEL', key)
  return 'OK'
else
  return 'NOT_OWNER'
end
```

- `OK` → HTTP `200`
- `NOT_OWNER` → HTTP `403`
- `NOT_FOUND` → HTTP `404`

### Why Lua Scripts?

Each operation (check + set/delete) must be atomic. Without Lua, a race condition exists between `GET` and `SET`/`DEL`. Redis Lua scripts execute atomically — no other command runs between the GET and SET within the script.

---

## Client-Side Flow

```
┌──────────────────────────────────────────────────┐
│  Open Workspace                                  │
│  ┌─────────────────────────┐                     │
│  │ POST /lock              │                     │
│  │ { device_id, ttl: 60 }  │                     │
│  └────────┬────────────────┘                     │
│           │                                      │
│     200 ──┤──→ Pull workspace, start heartbeat   │
│     409 ──┤──→ Show "workspace in use" message   │
│           │                                      │
│  ┌────────▼────────────────┐                     │
│  │ Every 20s (tab visible) │                     │
│  │ PUT /lock               │                     │
│  │ { device_id }           │                     │
│  └────────┬────────────────┘                     │
│           │                                      │
│     200 ──┤──→ Continue working                  │
│     409 ──┤──→ Lock stolen → close workspace     │
│     404 ──┤──→ Lock expired → re-acquire (POST)  │
│           │                                      │
│  ┌────────▼────────────────┐                     │
│  │ Tab hidden / offline    │                     │
│  │ → Stop heartbeat        │                     │
│  │ → Lock expires in ≤60s  │                     │
│  └─────────────────────────┘                     │
│                                                  │
│  ┌─────────────────────────┐                     │
│  │ Close workspace /       │                     │
│  │ beforeunload            │                     │
│  │ DELETE /lock            │                     │
│  │ { device_id }           │                     │
│  └─────────────────────────┘                     │
└──────────────────────────────────────────────────┘
```

### Key Client Behaviors

| Event                | Action                                                      |
|----------------------|-------------------------------------------------------------|
| Open workspace       | `POST /lock` → on `200` pull & start heartbeat              |
| Tab visible          | Resume heartbeat (`PUT /lock` every 20s)                    |
| Tab hidden           | Pause heartbeat (lock will expire after TTL)                |
| Browser offline      | Close workspace immediately (no network = no work)          |
| Browser online       | Re-open workspace (`POST /lock` + pull)                     |
| `beforeunload`       | `DELETE /lock` via `sendBeacon` for clean handoff            |
| Heartbeat `409`      | Another device took over → close workspace, show message    |
| Heartbeat `404`      | Lock expired naturally → re-acquire via `POST`              |

### Device ID

- Generated once per browser session: `crypto.randomUUID()`
- Stored in `sessionStorage` (not `localStorage`) so each tab gets its own identity
- This means two tabs in the same browser are treated as two separate devices

---

## What This Replaces

- **`checkRemoteVersion()`** — no longer needed; heartbeat serves as the "am I still the owner?" check
- **`pullIfChanged()` on tab focus** — replaced by heartbeat response; if `409` we re-pull everything
- **`expected_version` in PATCH** — can remain as an optional safety net but is no longer the primary coordination mechanism
- **Visibility/online event listeners** that call `checkRemoteVersion` — replaced by heartbeat start/stop logic

---

## Timing Summary

| Parameter           | Value  |
|---------------------|--------|
| Lock TTL            | 60s    |
| Heartbeat interval  | 20s    |
| Max missed beats    | ~2-3 before expiry |
| Handoff latency     | 0s (DELETE) or ≤60s (natural expiry) |
