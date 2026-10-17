/// <reference types="mocha" />
import { expect } from 'chai'
import { ethers, Transaction } from 'ethers'
import { KMSClient, GetPublicKeyCommand, SignCommand, CreateKeyCommand } from '@aws-sdk/client-kms'
import { KMSSigner, kmsGetAddress, kmsCreateKey, KMSSignerConfig } from '../src/lib/actions/providers/kms-signer'

const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')

// A fixed, well-known test private key. Its address is derived from it below.
const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const CONFIG: KMSSignerConfig = { keyId: 'test-key', region: 'eu-central-1', accessKeyId: 'AKIA', secretAccessKey: 'secret' }

// --- minimal DER helpers, mirroring what real AWS KMS returns -----------------

function toMinimalDerInt(x: bigint): Buffer {
  let hex = x.toString(16)
  if (hex.length % 2) hex = '0' + hex
  let buf = Buffer.from(hex, 'hex')
  let i = 0
  while (i < buf.length - 1 && buf[i] === 0) i++
  buf = buf.subarray(i)
  // DER integers are signed: prepend 0x00 when the high bit would imply a negative
  if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0x00]), buf])
  return buf
}

function derEncodeSignature(r: bigint, s: bigint): Uint8Array {
  const rb = toMinimalDerInt(r)
  const sb = toMinimalDerInt(s)
  const body = Buffer.concat([Buffer.from([0x02, rb.length]), rb, Buffer.from([0x02, sb.length]), sb])
  return new Uint8Array(Buffer.concat([Buffer.from([0x30, body.length]), body]))
}

// SubjectPublicKeyInfo DER: fixed secp256k1 SPKI header + uncompressed public key.
function spkiPublicKey(privateKey: string): Uint8Array {
  const uncompressed = ethers.SigningKey.computePublicKey(privateKey, false) // 0x04 || X || Y
  const header = Buffer.from('3056301006072a8648ce3d020106052b8104000a034200', 'hex')
  return new Uint8Array(Buffer.concat([header, Buffer.from(uncompressed.slice(2), 'hex')]))
}

// --- KMS mock: patches KMSClient.prototype.send for all instances -------------

interface MockOptions { forceHighS?: boolean }

function installKmsMock(privateKey: string, opts: MockOptions = {}) {
  const signingKey = new ethers.SigningKey(privateKey)
  const publicKey = spkiPublicKey(privateKey)
  const original = KMSClient.prototype.send
  let signCalls = 0

  ;(KMSClient.prototype as any).send = async function (command: any) {
    if (command instanceof GetPublicKeyCommand) {
      return { PublicKey: publicKey }
    }
    if (command instanceof SignCommand) {
      signCalls++
      expect(command.input.MessageType).to.equal('DIGEST')
      expect(command.input.SigningAlgorithm).to.equal('ECDSA_SHA_256')
      const digest = ethers.hexlify(command.input.Message as Uint8Array)
      const sig = signingKey.sign(digest)
      let r = BigInt(sig.r)
      let s = BigInt(sig.s)
      // ethers returns a canonical low-s; optionally push it high to test normalization
      if (opts.forceHighS) s = SECP256K1_N - s
      return { Signature: derEncodeSignature(r, s) }
    }
    if (command instanceof CreateKeyCommand) {
      return { KeyMetadata: { KeyId: 'kms-created-key-id' } }
    }
    throw new Error('unexpected KMS command in mock')
  }

  return {
    signCalls: () => signCalls,
    restore: () => { (KMSClient.prototype as any).send = original }
  }
}

describe('kms-signer', () => {
  let mock: ReturnType<typeof installKmsMock>
  let expectedAddress: string

  beforeEach(() => {
    mock = installKmsMock(PRIVATE_KEY)
    expectedAddress = new ethers.Wallet(PRIVATE_KEY).address
  })
  afterEach(() => mock.restore())

  describe('address derivation', () => {
    it('kmsGetAddress recovers the Ethereum address from the KMS public key', async () => {
      const address = await kmsGetAddress(CONFIG)
      expect(address).to.equal(expectedAddress)
    })

    it('KMSSigner.getAddress matches and caches the derived address', async () => {
      const signer = new KMSSigner(CONFIG)
      expect(await signer.getAddress()).to.equal(expectedAddress)
      // second call must not hit KMS again (no Sign/GetPublicKey needed)
      expect(await signer.getAddress()).to.equal(expectedAddress)
    })
  })

  describe('signMessage', () => {
    it('produces a signature that recovers to the KMS address', async () => {
      const signer = new KMSSigner(CONFIG)
      const message = 'hello remix'
      const sig = await signer.signMessage(message)
      expect(ethers.verifyMessage(message, sig)).to.equal(expectedAddress)
    })

    it('normalizes a high-s signature so it still recovers correctly', async () => {
      mock.restore()
      mock = installKmsMock(PRIVATE_KEY, { forceHighS: true })
      const signer = new KMSSigner(CONFIG)
      const message = 'malleable-s test'
      const sig = await signer.signMessage(message)
      // recovery must succeed AND the emitted s must be canonical (low half)
      expect(ethers.verifyMessage(message, sig)).to.equal(expectedAddress)
      expect(BigInt(ethers.Signature.from(sig).s) <= SECP256K1_N / 2n).to.equal(true)
    })
  })

  describe('signTypedData (EIP-712)', () => {
    it('produces a signature that recovers to the KMS address', async () => {
      const signer = new KMSSigner(CONFIG)
      const domain = { name: 'Remix', version: '1', chainId: 11155111, verifyingContract: '0x' + '11'.repeat(20) }
      const types = { Mail: [{ name: 'contents', type: 'string' }] }
      const value = { contents: 'gm' }
      const sig = await signer.signTypedData(domain, types, value)
      expect(ethers.verifyTypedData(domain, types, value, sig)).to.equal(expectedAddress)
    })
  })

  describe('signTransaction', () => {
    it('signs a fully-populated EIP-1559 transaction that recovers to the KMS address', async () => {
      // ethers' populateTransaction requires a provider even when every field is supplied;
      // this stub answers the metadata calls without touching the network.
      const fakeProvider: any = {
        getNetwork: async () => ({ chainId: 11155111n, name: 'sepolia' }),
        getTransactionCount: async () => 3,
        getFeeData: async () => ({ maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n, gasPrice: null }),
        estimateGas: async () => 21000n,
        resolveName: async (n: string) => n
      }
      const signer = new KMSSigner(CONFIG, fakeProvider)
      const tx = {
        type: 2,
        chainId: 11155111,
        nonce: 3,
        to: '0x' + 'ab'.repeat(20),
        value: 1000n,
        gasLimit: 21000n,
        maxFeePerGas: 2_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
        data: '0x',
        from: expectedAddress
      }
      const serialized = await signer.signTransaction(tx)
      const parsed = Transaction.from(serialized)
      expect(parsed.from).to.equal(expectedAddress)
      expect(parsed.chainId).to.equal(11155111n)
      expect(parsed.nonce).to.equal(3)
      expect(parsed.to).to.equal(ethers.getAddress(tx.to))
    })
  })

  describe('kmsCreateKey', () => {
    it('returns the KeyId of the newly created secp256k1 key', async () => {
      const keyId = await kmsCreateKey(CONFIG.region, CONFIG.accessKeyId, CONFIG.secretAccessKey)
      expect(keyId).to.equal('kms-created-key-id')
    })
  })
})
