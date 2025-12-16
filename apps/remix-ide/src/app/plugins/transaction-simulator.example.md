# Transaction Simulator Plugin

The Transaction Simulator plugin allows you to simulate transactions using the `eth_simulateV1` RPC endpoint in Remix IDE. It automatically decodes event logs using the 4byte.directory API.

## Usage

### Basic Example

```javascript
// Simulate a simple transaction
const result = await remix.call('transactionSimulator', 'simulateTransaction',
  '0xefeaf7647997cc11ae1f99f6add557fa9d70a552', // from address
  '0x1ebB067E5890593142f01Fa08C1d4D28ff373C11', // to address (optional)
  '0x1',  // value in wei (optional)
  '0xabcd', // transaction data (optional)
  true,  // validation (default: true)
  true,  // traceTransfers (default: true)
  true   // shouldDecodeLogs (default: true)
)

console.log('Simulation result:', result)
if (result.decodedLogs) {
  console.log('Decoded logs:', result.decodedLogs)
}
```

### Working with Decoded Logs

```javascript
// The result includes decoded logs
const result = await remix.call('transactionSimulator', 'simulateTransaction',
  '0xefeaf7647997cc11ae1f99f6add557fa9d70a552',
  '0x1ebB067E5890593142f01Fa08C1d4D28ff373C11',
  '0x1',
  '0xabcd'
)

if (result.success && result.decodedLogs) {
  result.decodedLogs.forEach(log => {
    console.log('Event:', log.eventName)
    console.log('Contract:', log.address)

    // Check if it's an Ether transfer
    if (log.isEtherTransfer) {
      console.log('This is an Ether transfer')
    }

    // Display decoded parameters
    if (log.decodedData) {
      log.decodedData.forEach(param => {
        console.log(`${param.name} (${param.type}): ${param.value}`)
      })
    }

    // Handle any errors
    if (log.error) {
      console.warn('Decoding error:', log.error)
    }
  })
}
```

### Manually Extracting and Decoding Logs

```javascript
// Simulate without automatic decoding
const result = await remix.call('transactionSimulator', 'simulate',
  {
    blockStateCalls: [{
      calls: [{
        from: '0xefeaf7647997cc11ae1f99f6add557fa9d70a552',
        to: '0x1ebB067E5890593142f01Fa08C1d4D28ff373C11',
        value: '0x1',
        data: '0xabcd'
      }]
    }],
    validation: true,
    traceTransfers: true
  },
  'latest',
  false // Don't decode logs automatically
)

// Manually extract logs
const logs = await remix.call('transactionSimulator', 'extractLogs', result.result)
console.log('Extracted logs:', logs)

// Manually decode logs
const decodedLogs = await remix.call('transactionSimulator', 'decodeLogs', logs)
console.log('Decoded logs:', decodedLogs)
```

### Looking Up Event Signatures

```javascript
// Look up a specific event signature
const eventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const signatureInfo = await remix.call('transactionSimulator', 'lookupEventSignature', eventSignature)

if (signatureInfo && signatureInfo.event && signatureInfo.event.length > 0) {
  console.log('Event name:', signatureInfo.event[0].name)
  console.log('Event signature:', signatureInfo.event[0].filtered_name)
}
```

### Advanced Example with Full Options

```javascript
// Create a complex simulation with multiple calls
const simulationOptions = {
  blockStateCalls: [
    {
      calls: [
        {
          from: '0xefeaf7647997cc11ae1f99f6add557fa9d70a552',
          to: '0x1ebB067E5890593142f01Fa08C1d4D28ff373C11',
          value: '0x1',
          input: '0xabcd',
          maxFeePerGas: '0xf'
        },
        {
          from: '0xefeaf7647997cc11ae1f99f6add557fa9d70a552',
          to: '0x2ebB067E5890593142f01Fa08C1d4D28ff373C22',
          value: '0x2',
          data: '0x1234'
        }
      ],
      blockOverride: {
        number: '0x1',
        time: '0x1234567890',
        gasLimit: '0x1c9c380'
      }
    }
  ],
  validation: true,
  traceTransfers: true,
  returnData: true
}

const result = await remix.call('transactionSimulator', 'simulate',
  simulationOptions,
  'latest' // block tag
)

if (result.success) {
  console.log('Simulation succeeded:', result.result)
} else {
  console.error('Simulation failed:', result.error)
}
```

### Listening to Simulation Events

```javascript
// Listen for simulation results
remix.on('transactionSimulator', 'simulationResult', (result) => {
  if (result.success) {
    console.log('Simulation completed:', result.result)
    if (result.decodedLogs) {
      console.log('Decoded logs:', result.decodedLogs)
    }
  } else {
    console.error('Simulation error:', result.error)
  }
})

// Listen specifically for decoded logs
remix.on('transactionSimulator', 'logsDecoded', (decodedLogs) => {
  console.log('Logs decoded:', decodedLogs)
  decodedLogs.forEach(log => {
    if (log.isEtherTransfer) {
      console.log('Ether transfer detected!')
    }
  })
})
```

## API Methods

### `simulate(options: SimulationOptions, blockTag?: string, shouldDecodeLogs?: boolean): Promise<SimulationResult>`

Simulates a transaction using the full `eth_simulateV1` RPC specification.

**Parameters:**
- `options`: Simulation options including block state calls, validation, and trace settings
- `blockTag`: Block tag to simulate against (default: 'latest')
- `shouldDecodeLogs`: Whether to automatically decode logs (default: true)

**Returns:** A promise that resolves to a `SimulationResult` object with decoded logs if enabled

### `simulateTransaction(from, to?, value?, data?, validation?, traceTransfers?, shouldDecodeLogs?): Promise<SimulationResult>`

Simplified method for simulating a single transaction.

**Parameters:**
- `from` (required): Sender address
- `to` (optional): Recipient address
- `value` (optional): Value to send in wei (hex string)
- `data` (optional): Transaction data (hex string)
- `validation` (optional): Enable validation (default: true)
- `traceTransfers` (optional): Enable trace transfers (default: true)
- `shouldDecodeLogs` (optional): Whether to automatically decode logs (default: true)

**Returns:** A promise that resolves to a `SimulationResult` object with decoded logs if enabled

### `extractLogs(simulationResult: any): SimulationLog[]`

Extracts logs from a raw simulation result.

**Parameters:**
- `simulationResult`: The raw result from `eth_simulateV1`

**Returns:** Array of `SimulationLog` objects

### `decodeLogs(logs: SimulationLog[]): Promise<DecodedLog[]>`

Decodes logs by looking up event signatures and parsing parameters.

**Parameters:**
- `logs`: Array of simulation logs to decode

**Returns:** Promise that resolves to an array of `DecodedLog` objects

### `lookupEventSignature(signature: string): Promise<any>`

Looks up an event signature from the 4byte.directory API.

**Parameters:**
- `signature`: The event signature hash (topic[0])

**Returns:** Promise that resolves to signature information from 4byte.directory

## Type Definitions

```typescript
interface SimulationResult {
  success: boolean
  result?: any
  error?: string
  decodedLogs?: DecodedLog[]
}

interface DecodedLog extends SimulationLog {
  eventName?: string
  eventSignature?: string
  decodedData?: {
    name: string
    type: string
    value: any
  }[]
  isEtherTransfer?: boolean
  error?: string
}

interface SimulationLog {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
  transactionIndex: string
  blockHash: string
  blockTimestamp: string
  logIndex: string
  removed: boolean
}

interface SimulationOptions {
  blockStateCalls: BlockStateCall[]
  validation?: boolean
  traceTransfers?: boolean
  returnData?: boolean
}

interface BlockStateCall {
  calls: SimulationCall[]
  blockOverride?: {
    number?: string
    difficulty?: string
    time?: string
    gasLimit?: string
    coinbase?: string
    random?: string
    baseFee?: string
  }
}

interface SimulationCall {
  from?: string
  to?: string
  value?: string
  input?: string
  data?: string
  gas?: string
  gasPrice?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  nonce?: string
}
```

## Special Cases

### Ether Transfers

When a log is emitted from address `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`, it indicates an Ether transfer. The plugin automatically detects this and sets the `isEtherTransfer` flag to `true`, decoding the transfer parameters (from, to, value).

### Event Signature Lookup

The plugin uses the [4byte.directory API](https://api.4byte.sourcify.dev/) to look up event signatures. Results are cached to minimize API calls. If an event signature is not found, the log will still be returned but with an error message indicating the signature couldn't be resolved.

## Events

### `simulationResult`

Emitted when a simulation completes (success or failure).

**Payload:** `SimulationResult`

### `logsDecoded`

Emitted when logs are successfully decoded.

**Payload:** `DecodedLog[]`

## Notes

- This plugin requires a provider that supports the `eth_simulateV1` RPC method
- Not all providers support transaction simulation
- The plugin uses the currently selected provider in Remix IDE
- Simulation results depend on the provider's implementation
- Event signature lookup requires an internet connection to access 4byte.directory
- Decoded log parameters are returned as strings for bigint values to prevent precision loss
