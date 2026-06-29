# API Spec: Verify Sync Manifest

## Endpoint

```
POST /storage/api/workspaces/:uuid/verify-manifest
```

**Auth**: Bearer JWT (same as all `/storage/api/workspaces/*` endpoints)

**Purpose**: Accept the browser's sync manifest and diff it against the real S3 objects for that workspace. Returns a structured report of phantoms, missing files, and ETag mismatches. Used by E2E tests to assert sync integrity after file operations.

---

## Request

### Headers

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

### URL Params

| Param | Type   | Description                    |
|-------|--------|--------------------------------|
| uuid  | string | Cloud workspace UUID           |

### Body

```json
{
  "manifest": {
    "version": 1,
    "lastSyncTimestamp": 1741334400000,
    "files": {
      "contracts/Storage.sol": {
        "etag": "\"d41d8cd98f00b204e9800998ecf8427e\"",
        "lastModified": "2026-03-07T10:00:00.000Z",
        "size": 1234
      },
      "scripts/deploy.ts": {
        "etag": "\"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4\"",
        "lastModified": "2026-03-07T10:01:00.000Z",
        "size": 567
      }
    },
    "lastGitZipEtag": "\"abc123\""
  }
}
```

The `manifest` field follows the `SyncManifest` interface — the browser sends it exactly as stored in IndexedDB.

---

## Backend Logic (pseudocode)

```python
def verify_manifest(workspace_uuid, manifest):
    # 1. Resolve the S3 prefix for this workspace
    #    Same prefix used by the STS credentials: users/{user_id}/{workspace_uuid}/
    prefix = get_workspace_s3_prefix(workspace_uuid)

    # 2. LIST all objects under the prefix
    remote_objects = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)

    # 3. Build a map of key → {etag, size}, filtering out non-file keys
    SKIP_KEYS = {'_workspace.zip', '_git.zip'}
    remote_map = {}
    for obj in remote_objects:
        key = obj.Key.removeprefix(prefix)  # strip prefix to get workspace-relative key
        if key.endswith('/'):           continue  # directory marker
        if key in SKIP_KEYS:            continue  # internal ZIP snapshots
        if key.startswith('.git/'):     continue  # git internals
        if key == '.git':               continue
        remote_map[key] = {
            'etag': obj.ETag,           # e.g. '"d41d8cd9..."'
            'size': obj.Size,
        }

    # 4. Diff the manifest against remote
    manifest_files = manifest.get('files', {})
    phantoms   = []  # in manifest but NOT on S3
    missing    = []  # on S3 but NOT in manifest
    mismatched = []  # in both, but ETags differ

    for key, entry in manifest_files.items():
        if key not in remote_map:
            phantoms.append({
                'key': key,
                'localEtag': entry.get('etag'),
                'localSize': entry.get('size'),
            })
        else:
            remote = remote_map[key]
            if normalize_etag(entry.get('etag')) != normalize_etag(remote['etag']):
                mismatched.append({
                    'key': key,
                    'localEtag': entry.get('etag'),
                    'remoteEtag': remote['etag'],
                    'localSize': entry.get('size'),
                    'remoteSize': remote['size'],
                })

    for key, remote in remote_map.items():
        if key not in manifest_files:
            missing.append({
                'key': key,
                'remoteEtag': remote['etag'],
                'remoteSize': remote['size'],
            })

    ok = len(phantoms) == 0 and len(missing) == 0 and len(mismatched) == 0

    # 5. Return
    return {
        'ok': ok,
        'manifestFileCount': len(manifest_files),
        'remoteFileCount': len(remote_map),
        'phantoms': phantoms,
        'missing': missing,
        'mismatched': mismatched,
    }

def normalize_etag(etag):
    """Strip surrounding quotes for comparison. S3 returns '"abc"', 
       the browser may store with or without quotes."""
    if etag is None:
        return ''
    return etag.strip('"')
```

---

## Response

### 200 OK — Sync is consistent

```json
{
  "ok": true,
  "manifestFileCount": 2,
  "remoteFileCount": 2,
  "phantoms": [],
  "missing": [],
  "mismatched": []
}
```

### 200 OK — Mismatch detected

```json
{
  "ok": false,
  "manifestFileCount": 3,
  "remoteFileCount": 2,
  "phantoms": [
    {
      "key": "contracts/Deleted.sol",
      "localEtag": "\"deadbeef...\"",
      "localSize": 100
    }
  ],
  "missing": [],
  "mismatched": [
    {
      "key": "contracts/Storage.sol",
      "localEtag": "\"aaa...\"",
      "remoteEtag": "\"bbb...\"",
      "localSize": 1234,
      "remoteSize": 1240
    }
  ]
}
```

### Error Responses

| Status | When                                           |
|--------|------------------------------------------------|
| 400    | Missing or invalid `manifest` in request body  |
| 401    | Missing or expired Bearer token                |
| 403    | Token doesn't belong to workspace owner        |
| 404    | Workspace UUID not found                       |

---

## Key Decisions

### ETag normalization
S3 returns ETags with surrounding quotes (`"abc123"`). The browser's sync engine may store them with or without quotes depending on how `putObject` returns them. **Always strip quotes before comparing.**

### Multipart upload ETags
S3 multipart uploads produce ETags like `"abc123-3"` (hash + part count). The sync engine uses single-part PUTs for all files (they're source code, not gigabytes), so this shouldn't be an issue. But if you want to be safe, compare with the dash-suffix aware.

### What to skip
- `_workspace.zip` — snapshot ZIP, not a user file
- `_git.zip` — git snapshot, not a user file
- Directory markers (keys ending with `/`) — S3 virtual directories
- `.git/` and `.git` — git internals, managed separately

### Performance
This is a single `ListObjectsV2` call — no file content is read. For a 200-file workspace it's fast and cheap. The endpoint is only called by E2E tests and manual debugging, not in production.

### Access control
Same as other `/storage/api/workspaces/:uuid/*` endpoints: verify the JWT user owns the workspace. No new permissions needed.

---

## TypeScript Types (already in codebase)

These are defined in `libs/remix-ui/workspace/src/lib/cloud/types.ts`:

```typescript
interface ManifestVerifyRequest {
  manifest: SyncManifest
}

interface ManifestFileDiff {
  key: string
  localEtag?: string
  remoteEtag?: string
  localSize?: number
  remoteSize?: number
}

interface ManifestVerifyResponse {
  ok: boolean
  manifestFileCount: number
  remoteFileCount: number
  phantoms: ManifestFileDiff[]
  missing: ManifestFileDiff[]
  mismatched: ManifestFileDiff[]
}
```

---

## Frontend Integration (already done)

- **API client**: `verifyManifest(uuid, manifest)` in `cloud-workspace-api.ts`
- **Engine getters**: `cloudSyncEngine.getManifest()` and `cloudSyncEngine.getWorkspaceUuid()`
- **E2E helper**: `assertCloudSyncIntegrity(browser)` in `apps/remix-ide-e2e/src/helpers/cloud-sync-verify.ts`
- **Window access**: `window.cloudSyncEngine` exposed for browser-side reads

The frontend is ready — just needs the backend endpoint deployed.
