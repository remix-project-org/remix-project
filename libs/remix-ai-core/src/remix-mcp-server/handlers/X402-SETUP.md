# X402 Official Implementation Setup Guide

This guide explains how to set up the official @x402/fetch integration for Remix IDE MCP tools.

## Prerequisites

### 1. Install Required Packages

Add the following dependencies to the project:

```bash
# Core x402 packages
npm install @x402/core @x402/fetch @x402/evm @x402/svm

# Additional dependencies
npm install @scure/base @solana/kit
```

### 2. Environment Variables

Create a `.env` file or configure environment variables:

```bash
# EVM Wallet Configuration
EVM_PRIVATE_KEY=0x1234567890abcdef...  # Your EVM private key
EVM_RPC_URL=https://base-sepolia.g.alchemy.com/v2/your-api-key

# SVM (Solana) Wallet Configuration  
SVM_PRIVATE_KEY=base58-encoded-solana-private-key...

# Optional: Default endpoint configuration
RESOURCE_SERVER_URL=http://localhost:4021
ENDPOINT_PATH=/weather
```

## Configuration

### 1. Remix Config Setup

Update your `remix.config.json` with wallet configuration:

```json
{
  "mcp": {
    "x402Wallet": {
      "enablePayments": true,
      "evmPrivateKey": "0x1234567890abcdef...",
      "svmPrivateKey": "base58-encoded-solana-private-key...", 
      "evmRpcUrl": "https://base-sepolia.g.alchemy.com/v2/your-api-key",
      "supportedNetworks": [
        "eip155:8453",    // Base Mainnet
        "eip155:84532",   // Base Sepolia
        "solana:mainnet", 
        "solana:devnet"
      ]
    },
    "x402Endpoints": [
      {
        "id": "premium_analyzer",
        "title": "Premium Code Analyzer",
        "description": "AI-powered code analysis with payment",
        "endpoint": "https://api.example.com/x402/premium-analyze",
        "requiresPayment": true,
        "paymentMethods": ["crypto", "usdc"],
        "parameters": {
          "code": {
            "type": "string",
            "description": "Code to analyze",
            "required": true
          }
        },
        "enabled": true
      }
    ]
  }
}
```

### 2. Enable X402 Packages

Once packages are installed, update the handler to enable x402 functionality:

In `X402EndpointHandler.ts`, uncomment the x402 imports:

```typescript
// Uncomment these lines:
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { UptoEvmScheme } from "@x402/evm/upto/client"; 
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
```

And update the availability check:

```typescript
private isX402Available(): boolean {
  try {
    require.resolve('@x402/fetch');
    return true;  // Change this to true
  } catch {
    return false;
  }
}
```

## Usage Modes

### Mode 1: Full X402 Integration (Recommended)

When `enablePayments: true` and packages are installed:

- **Automatic Payment**: The system uses official @x402/fetch client
- **Wallet Integration**: Supports both EVM and SVM (Solana) wallets
- **Multiple Schemes**: Exact and UpTo payment schemes on EVM
- **Seamless UX**: Payments happen automatically without user intervention

**Example Request Flow:**
1. User calls `x402_premium_analyzer`
2. System detects payment is required
3. @x402/fetch automatically handles payment using configured wallet
4. Request proceeds with payment proof
5. User receives response + payment confirmation

### Mode 2: Fallback Mode (Current Default)

When `enablePayments: false` or packages not installed:

- **Manual Detection**: Detects 402 responses manually
- **User Notification**: Shows payment requirements to user
- **No Auto-Payment**: Cannot complete payments automatically
- **Educational**: Good for testing x402 endpoints without wallet setup

**Example Request Flow:**
1. User calls `x402_premium_analyzer`
2. Endpoint returns 402 Payment Required
3. System extracts payment info from headers
4. User sees: "Payment required: 0.001 USDC"
5. Process stops (no payment capability)

## Security Best Practices

### 1. Private Key Management

**⚠️ NEVER commit private keys to version control!**

```bash
# Use environment variables
export EVM_PRIVATE_KEY=0x...
export SVM_PRIVATE_KEY=...

# Or use .env file (add to .gitignore)
echo ".env" >> .gitignore
```

### 2. Network Configuration

Use appropriate networks for testing vs production:

```json
{
  "supportedNetworks": [
    "eip155:84532",    // Base Sepolia (testnet)
    "solana:devnet"    // Solana Devnet
  ]
}
```

### 3. Wallet Separation

Use separate wallets for:
- **Development**: Test networks with minimal funds
- **Production**: Mainnet with production funds
- **CI/CD**: Mock/disabled payments for testing

## Testing Your Setup

### 1. Check MCP Server Logs

Look for these messages in the console:

```
[RemixMCPServer] Registering 3 X402 endpoint tools
[RemixMCPServer] Successfully registered 3 X402 tools (payments enabled)
[RemixMCPServer] X402 automatic payment handling is enabled
```

### 2. Test with Free Endpoint

Start with a free endpoint to verify basic functionality:

```json
{
  "id": "test_free",
  "endpoint": "https://httpbin.org/json", 
  "requiresPayment": false,
  "enabled": true
}
```

### 3. Test with Payment Endpoint

Use a test payment endpoint:

```json
{
  "id": "test_payment",
  "endpoint": "https://httpbin.org/status/402",
  "requiresPayment": true, 
  "enabled": true
}
```

## Troubleshooting

### Common Issues

1. **"x402 packages not available"**
   - Install required packages: `npm install @x402/fetch @x402/evm @x402/svm`
   - Verify imports are uncommented in handler

2. **"Payment failed: insufficient funds"**
   - Check wallet balance on the target network
   - Verify network configuration matches endpoint requirements

3. **"Invalid private key"**
   - Ensure EVM private key starts with `0x`
   - Verify SVM private key is base58 encoded
   - Check private key is valid for the configured network

4. **"Network not supported"**
   - Verify `supportedNetworks` includes the target network
   - Check endpoint documentation for supported networks

### Debug Mode

Enable detailed logging by setting:

```json
{
  "mcp": {
    "logging": {
      "level": "debug",
      "console": true
    }
  }
}
```

## Advanced Configuration

### Custom Payment Schemes

You can register custom payment schemes in the handler:

```typescript
// Example: Custom payment amount limits
client.register("eip155:*", new UptoEvmScheme(evmSigner, { 
  maxAmount: "1000000",  // Max 1 USDC
  rpcUrl: evmRpcUrl 
}));
```

### Multi-Network Support

Configure different wallets for different networks:

```json
{
  "x402Wallet": {
    "enablePayments": true,
    "evm": {
      "mainnet": {
        "privateKey": "0x...",
        "rpcUrl": "https://mainnet.infura.io/..."
      },
      "sepolia": {
        "privateKey": "0x...", 
        "rpcUrl": "https://sepolia.infura.io/..."
      }
    },
    "svm": {
      "mainnet": "base58key...",
      "devnet": "base58key..."
    }
  }
}
```

This setup provides a complete x402 payment integration with Remix IDE, enabling seamless micropayments for AI services, API access, and other x402-protected resources.