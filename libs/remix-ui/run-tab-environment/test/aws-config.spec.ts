/// <reference types="mocha" />
import { expect } from 'chai'
import { applyAwsValues, parseAwsConfig, KMSFormState } from '../src/lib/actions/providers/aws-config'

function emptyState(): KMSFormState {
  return { region: '', keyId: '', rpcUrl: '', accessKeyId: '', secretAccessKey: '', sessionToken: '' }
}

describe('aws-config: parseAwsConfig', () => {
  it('parses AWS-style INI, ignoring [section] headers, comments and blank lines', () => {
    const content = [
      '[default]',
      '# a comment',
      '; another comment',
      '',
      'aws_access_key_id = AKIAEXAMPLE',
      'aws_secret_access_key=secret/with=equals',
      '  region  =  eu-central-1  '
    ].join('\n')
    const values = parseAwsConfig(content)
    expect(values.aws_access_key_id).to.equal('AKIAEXAMPLE')
    // only the first '=' splits key/value — the rest is part of the value
    expect(values.aws_secret_access_key).to.equal('secret/with=equals')
    // keys and values are trimmed
    expect(values.region).to.equal('eu-central-1')
  })

  it('parses a flat JSON object', () => {
    const values = parseAwsConfig(JSON.stringify({ region: 'us-east-1', keyId: 'abc' }))
    expect(values.region).to.equal('us-east-1')
    expect(values.keyId).to.equal('abc')
  })

  it('flattens a single-profile JSON object (e.g. { default: { … } })', () => {
    const values = parseAwsConfig(JSON.stringify({ default: { region: 'ap-south-1', aws_access_key_id: 'AKIA' } }))
    expect(values.region).to.equal('ap-south-1')
    expect(values.aws_access_key_id).to.equal('AKIA')
  })

  it('coerces non-string JSON values to strings', () => {
    const values = parseAwsConfig(JSON.stringify({ region: 1, keyId: true }))
    expect(values.region).to.equal('1')
    expect(values.keyId).to.equal('true')
  })

  it('falls back to INI parsing when JSON is malformed', () => {
    // starts with `{` so JSON is attempted first, fails, then INI parsing kicks in
    const values = parseAwsConfig('{\nregion = fallback-region\nkeyId = k1\n')
    expect(values.region).to.equal('fallback-region')
    expect(values.keyId).to.equal('k1')
  })

  it('handles CRLF line endings', () => {
    const values = parseAwsConfig('region=eu-west-1\r\nkeyId=xyz\r\n')
    expect(values.region).to.equal('eu-west-1')
    expect(values.keyId).to.equal('xyz')
  })
})

describe('aws-config: applyAwsValues', () => {
  it('maps Remix-style field names onto the form state', () => {
    const state = emptyState()
    applyAwsValues(state, { region: 'eu-central-1', keyId: 'key-1', rpcUrl: 'https://rpc', accessKeyId: 'AK', secretAccessKey: 'SK', sessionToken: 'ST' })
    expect(state).to.deep.equal({ region: 'eu-central-1', keyId: 'key-1', rpcUrl: 'https://rpc', accessKeyId: 'AK', secretAccessKey: 'SK', sessionToken: 'ST' })
  })

  it('maps standard AWS credential/config names', () => {
    const state = emptyState()
    applyAwsValues(state, {
      aws_region: 'us-east-2',
      kms_key_id: 'arn:aws:kms:us-east-2:111:key/abc',
      rpc_url: 'https://sepolia',
      aws_access_key_id: 'AKIA',
      aws_secret_access_key: 'ssss',
      aws_session_token: 'tok'
    })
    expect(state.region).to.equal('us-east-2')
    expect(state.keyId).to.equal('arn:aws:kms:us-east-2:111:key/abc')
    expect(state.rpcUrl).to.equal('https://sepolia')
    expect(state.accessKeyId).to.equal('AKIA')
    expect(state.secretAccessKey).to.equal('ssss')
    expect(state.sessionToken).to.equal('tok')
  })

  it('is case-insensitive on keys', () => {
    const state = emptyState()
    applyAwsValues(state, { AWS_REGION: 'eu-west-3', KMSKEYID: 'k' })
    expect(state.region).to.equal('eu-west-3')
    expect(state.keyId).to.equal('k')
  })

  it('accepts aws_security_token as an alias for the session token', () => {
    const state = emptyState()
    applyAwsValues(state, { aws_security_token: 'legacy-tok' })
    expect(state.sessionToken).to.equal('legacy-tok')
  })

  it('leaves existing fields untouched when a value is absent or empty', () => {
    const state = emptyState()
    state.region = 'preset-region'
    applyAwsValues(state, { region: '', keyId: 'only-key' })
    // empty string is treated as "not provided" and must not overwrite
    expect(state.region).to.equal('preset-region')
    expect(state.keyId).to.equal('only-key')
  })

  it('prefers the first matching alias in priority order', () => {
    const state = emptyState()
    // both `keyId` and `kms_key_id` present — Remix-style `keyId` wins
    applyAwsValues(state, { keyId: 'primary', kms_key_id: 'secondary' })
    expect(state.keyId).to.equal('primary')
  })
})
