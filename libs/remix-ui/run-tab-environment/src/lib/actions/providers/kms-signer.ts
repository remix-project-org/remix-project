import { KMSClient, GetPublicKeyCommand, SignCommand, CreateKeyCommand } from '@aws-sdk/client-kms'
import { AbstractSigner, Provider, Transaction, TypedDataDomain, TypedDataField, ethers } from 'ethers'

const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')

export interface KMSSignerConfig {
  keyId: string
  region: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
}

function buildKMSClient(config: KMSSignerConfig): KMSClient {
  const credentials = config.accessKeyId && config.secretAccessKey
    ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, sessionToken: config.sessionToken }
    : undefined
  return new KMSClient({ region: config.region, credentials })
}

function parseDerSignature(der: Uint8Array): { r: bigint; s: bigint } {
  const buf = Buffer.from(der)
  if (buf[0] !== 0x30) throw new Error('Invalid DER signature')
  let offset = 2
  if (buf[offset] !== 0x02) throw new Error('Invalid DER: expected r')
  const rLen = buf[offset + 1]
  const r = BigInt('0x' + buf.subarray(offset + 2, offset + 2 + rLen).toString('hex'))
  offset += 2 + rLen
  if (buf[offset] !== 0x02) throw new Error('Invalid DER: expected s')
  const sLen = buf[offset + 1]
  const s = BigInt('0x' + buf.subarray(offset + 2, offset + 2 + sLen).toString('hex'))
  return { r, s }
}

export async function kmsGetAddress(config: KMSSignerConfig): Promise<string> {
  const kms = buildKMSClient(config)
  const res = await kms.send(new GetPublicKeyCommand({ KeyId: config.keyId }))
  const der = Buffer.from(res.PublicKey!)
  const uncompressed = der.subarray(der.length - 65)
  return ethers.computeAddress('0x' + uncompressed.toString('hex'))
}

export async function kmsCreateKey(region: string, accessKeyId?: string, secretAccessKey?: string, sessionToken?: string): Promise<string> {
  const credentials = accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey, sessionToken } : undefined
  const kms = new KMSClient({ region, credentials })
  const res = await kms.send(new CreateKeyCommand({
    KeySpec: 'ECC_SECG_P256K1',
    KeyUsage: 'SIGN_VERIFY',
    Description: 'Remix IDE Ethereum signer',
  }))
  return res.KeyMetadata!.KeyId!
}

async function kmsSignDigest(config: KMSSignerConfig, kms: KMSClient, digest: string, address: string): Promise<ethers.Signature> {
  const res = await kms.send(new SignCommand({
    KeyId: config.keyId,
    Message: ethers.getBytes(digest),
    MessageType: 'DIGEST',
    SigningAlgorithm: 'ECDSA_SHA_256',
  }))

  let { r, s } = parseDerSignature(res.Signature!)
  if (s > SECP256K1_N / 2n) s = SECP256K1_N - s

  const rHex = ethers.toBeHex(r, 32)
  const sHex = ethers.toBeHex(s, 32)

  for (const v of [27, 28]) {
    const sig = ethers.Signature.from({ r: rHex, s: sHex, v })
    if (ethers.recoverAddress(digest, sig).toLowerCase() === address.toLowerCase()) {
      return sig
    }
  }
  throw new Error('Could not determine recovery id for KMS signature')
}

export class KMSSigner extends AbstractSigner {
  private config: KMSSignerConfig
  private kms: KMSClient
  private _address: string | null = null

  constructor(config: KMSSignerConfig, provider?: Provider) {
    super(provider)
    this.config = config
    this.kms = buildKMSClient(config)
  }

  async getAddress(): Promise<string> {
    if (!this._address) {
      this._address = await kmsGetAddress(this.config)
    }
    return this._address
  }

  async signTransaction(tx: ethers.TransactionLike): Promise<string> {
    const address = await this.getAddress()
    const populated = await this.populateTransaction(tx)
    delete populated.from
    const unsigned = Transaction.from(populated)
    const digest = unsigned.unsignedHash
    const sig = await kmsSignDigest(this.config, this.kms, digest, address)
    unsigned.signature = sig
    return unsigned.serialized
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const address = await this.getAddress()
    const digest = ethers.hashMessage(message)
    const sig = await kmsSignDigest(this.config, this.kms, digest, address)
    return sig.serialized
  }

  async signTypedData(domain: TypedDataDomain, types: Record<string, TypedDataField[]>, value: Record<string, unknown>): Promise<string> {
    const address = await this.getAddress()
    const digest = ethers.TypedDataEncoder.hash(domain, types, value)
    const sig = await kmsSignDigest(this.config, this.kms, digest, address)
    return sig.serialized
  }

  connect(provider: Provider): KMSSigner {
    return new KMSSigner(this.config, provider)
  }
}
