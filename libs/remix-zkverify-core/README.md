# @remix-project/remix-zkverify-core

Core library for zkVerify (Kurier) integration in Remix IDE. Provides ZK proof verification services through the zkVerify network.

## Features

- **ZkVerifyService**: API client for Kurier REST API
  - VK (Verification Key) registration
  - Proof submission
  - Job status polling
  - Full verification flow with automatic polling

## Supported Proof Types

| Proof System | Kurier Type | Source |
|--------------|-------------|--------|
| Groth16 | `groth16` | Circom (snarkjs) |
| Plonk | `plonk` | Circom (snarkjs) |
| UltraHonk | `ultrahonk` | Noir (Barretenberg) |
| UltraPlonk | `ultraplonk` | Noir (Barretenberg) |
| Fflonk | `fflonk` | Various |

## Usage

```typescript
import { ZkVerifyService } from '@remix-project/remix-zkverify-core';

// Initialize service
const zkService = new ZkVerifyService({
  network: 'testnet',
  apiKey: 'your-api-key'
});
const proof = JSON.parse(proofJson)\
const vk = JSON.parse(vkJson)
const publicSignals = JSON.parse(publicSignalsJson).map(String)

// Verify proof
const result = await zkService.verifyProof(
  'groth16',
  proof,
  publicSignals,
  vk,
  false,
  { library: 'snarkjs', curve: 'bn128' },
  (status) => console.log('Status:', status.status)
);

if (result.success) {
  console.log('Job ID:', result.jobId);
}
```

## API Reference

### ZkVerifyService

#### Constructor

```typescript
new ZkVerifyService(config: KurierConfig)
```

#### Methods

- `registerVK(request)`: Register a verification key
- `submitProof(request)`: Submit a proof for verification
- `getJobStatus(jobId)`: Get status of a verification job
- `waitForJobCompletion(jobId, onProgress?)`: Poll until job completes
- `verifyProof(...)`: Full verification flow (convenience method)
- `updateConfig(config)`: Update service configuration

## Kurier API Endpoints

- **Testnet**: `https://api-testnet.kurier.xyz/api/v1`
- **Mainnet**: `https://api.kurier.xyz/api/v1`

## Resources

- [Kurier Documentation](https://kurier.xyz/docs)
- [zkVerify Documentation](https://docs.zkverify.io)
- [Get API Key](https://testnet.kurier.xyz)

## License

MIT
