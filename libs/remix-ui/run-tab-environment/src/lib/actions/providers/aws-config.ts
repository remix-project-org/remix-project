export interface KMSFormState {
  region: string
  keyId: string
  rpcUrl: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
}

/**
 * Map a set of loosely-named keys onto the KMS form fields.
 * Supports both Remix-style names (region, keyId, rpcUrl, …) and
 * standard AWS credential/config names (aws_access_key_id, …).
 */
export function applyAwsValues(state: KMSFormState, values: Record<string, string>) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(values).find((vk) => vk.toLowerCase() === k.toLowerCase())
      if (found && values[found] !== undefined && values[found] !== '') return String(values[found])
    }
    return undefined
  }
  const region = get('region', 'aws_region')
  const keyId = get('keyId', 'key_id', 'kms_key_id', 'kmsKeyId')
  const rpcUrl = get('rpcUrl', 'rpc_url', 'rpc')
  const accessKeyId = get('accessKeyId', 'aws_access_key_id')
  const secretAccessKey = get('secretAccessKey', 'aws_secret_access_key')
  const sessionToken = get('sessionToken', 'aws_session_token', 'aws_security_token')

  if (region !== undefined) state.region = region
  if (keyId !== undefined) state.keyId = keyId
  if (rpcUrl !== undefined) state.rpcUrl = rpcUrl
  if (accessKeyId !== undefined) state.accessKeyId = accessKeyId
  if (secretAccessKey !== undefined) state.secretAccessKey = secretAccessKey
  if (sessionToken !== undefined) state.sessionToken = sessionToken
}

/** Parse a `.aws` file: JSON object first, otherwise AWS-style INI (key = value). */
export function parseAwsConfig(content: string): Record<string, string> {
  const trimmed = content.trim()
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed)
      // flatten a single profile section if present (e.g. { default: { … } })
      if (json && typeof json === 'object') {
        const values: Record<string, string> = {}
        for (const [k, v] of Object.entries(json)) {
          if (v && typeof v === 'object') {
            for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) values[ik] = String(iv)
          } else {
            values[k] = String(v)
          }
        }
        return values
      }
    } catch (e) {
      // fall through to INI parsing
    }
  }
  // INI / properties style: `key = value`, ignoring [section] headers and comments
  const values: Record<string, string> = {}
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('[')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key) values[key] = value
  }
  return values
}
