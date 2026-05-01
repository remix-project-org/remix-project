# X402 Protocol Integration for Remix IDE

This feature implements the x402 payment protocol to dynamically register MCP tools that can interact with x402-protected endpoints defined in your `remix.config.json` file.

## Overview

The X402 protocol is a payments protocol for the internet built on HTTP. This integration provides:

1. **x402 Protocol Compliance**: Proper handling of 402 Payment Required responses
2. **Dynamic Tool Generation**: Automatically create MCP tools for each configured x402 endpoint  
3. **Payment Flow Detection**: Detect when endpoints require payment and handle accordingly
4. **Type-Safe Parameters**: Full parameter validation for endpoint calls
5. **Integration with Remix IDE**: Seamless integration into the MCP tool ecosystem

## X402 Protocol Flow

1. **Initial Request**: Make HTTP request to x402-protected resource
2. **Payment Detection**: Server responds with 402 Payment Required status
3. **Payment Information**: Extract payment details from response headers
4. **Payment Processing**: Handle payment according to x402 specification (future enhancement)
5. **Authenticated Request**: Make follow-up request with payment proof

## Configuration

Add x402 endpoints to your `remix.config.json` file under the `mcp.x402Endpoints` section:

```json
{
  "mcp": {
    "version": "1.0.0",
    "x402Endpoints": [
      {
        "id": "unique_endpoint_id",
        "title": "Human Readable Name",
        "description": "Description of what this endpoint does",
        "endpoint": "https://api.example.com/your-x402-endpoint",
        "parameters": {
          "paramName": {
            "type": "string|number|boolean|object|array",
            "description": "Parameter description",
            "required": true|false,
            "default": "default_value",
            "enum": ["option1", "option2"],
            "pattern": "regex_pattern_for_strings"
          }
        },
        "permissions": ["permission:scope"],
        "enabled": true
      }
    ]
  }
}
```

## Endpoint Configuration Fields

### Required Fields
- `id`: Unique identifier for the endpoint (used to generate tool name: `x402_{id}`)
- `title`: Human-readable name shown in the tool description
- `description`: Description of what the endpoint does
- `endpoint`: The URL of the x402 endpoint to call

### Optional Fields
- `parameters`: Object defining the parameters this endpoint accepts
- `permissions`: Array of permission scopes required to use this tool
- `enabled`: Whether this endpoint is active (default: true)

### Parameter Configuration
Each parameter can have the following properties:
- `type`: Data type (string, number, boolean, object, array)
- `description`: Human-readable description
- `required`: Whether the parameter is mandatory
- `default`: Default value if not provided
- `enum`: Array of allowed values
- `pattern`: Regex pattern for string validation

## How It Works

1. **Configuration Loading**: On MCP server initialization, the system reads `remix.config.json`
2. **Tool Generation**: For each enabled x402 endpoint, a new MCP tool is created with name `x402_{id}`
3. **Initial Request**: When called, parameters are validated and sent to the x402 endpoint
4. **Payment Detection**: If server responds with 402, payment information is extracted from headers
5. **User Notification**: Payment requirements are displayed to the user
6. **Future Payment Flow**: Payment processing will be implemented in future versions

## X402 Endpoint Request Format

Your x402 endpoint will receive a POST request with this structure:

```json
{
  "endpoint": "https://api.example.com/your-x402-endpoint", 
  "title": "Your Endpoint Title",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## X402 Response Handling

### Successful Response (200 OK)
```json
{
  "success": true,
  "endpoint": "https://api.example.com/endpoint",
  "title": "AI Code Analyzer", 
  "result": { /* endpoint response data */ },
  "timestamp": "2024-01-01T12:00:00.000Z",
  "paymentRequired": false
}
```

### Payment Required Response (402)
The system extracts payment information from x402 headers:
- `payment-required`: Base64 encoded payment details
- `payment-methods`: Comma-separated list of accepted payment methods
- `payment-id`: Unique identifier for this payment request

```json
{
  "success": false,
  "endpoint": "https://api.example.com/endpoint",
  "title": "Premium AI Analyzer",
  "paymentRequired": true,
  "paymentInfo": { "amount": "0.001", "currency": "USDC" },
  "paymentMethods": ["crypto", "card"],
  "paymentId": "pay_12345",
  "message": "Payment required to access this x402 endpoint",
  "instructions": "Payment processing implementation coming soon",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Example Configuration

See `example-x402-config.json` for a complete example with three different types of endpoints:
1. **AI Code Analyzer**: Analyzes Solidity code for potential issues
2. **Smart Contract Deployer**: Advanced deployment with custom parameters
3. **Security Audit Reporter**: Generates comprehensive audit reports

## Dynamic Reloading

The system supports dynamic reloading of x402 endpoints:
- Modify your `remix.config.json` file
- Save the file
- The MCP server automatically reloads the configuration
- New/updated/removed endpoints are reflected immediately

## Security Considerations

- Endpoints are subject to the same permission system as other MCP tools
- Network requests include proper x402 protocol headers for identification
- Payment information is extracted safely from response headers
- Always validate and sanitize parameters on the server side  
- Implement proper x402 payment verification on your endpoints
- Consider rate limiting and proper authentication for x402 protected resources
- Payment processing will implement secure cryptographic verification

## Error Handling

The system provides robust error handling:
- Parameter validation errors before making network requests
- Network timeout and connection error handling
- Proper error formatting for display in Remix IDE
- Graceful handling of 402 Payment Required responses
- Safe parsing of x402 payment headers with fallback handling

## Future Payment Integration

The current implementation detects x402 payment requirements and informs users. Future versions will include:

### Planned Payment Features
- **Crypto Wallet Integration**: Connect with MetaMask and other wallets
- **Multi-Currency Support**: USDC, ETH, and other cryptocurrencies  
- **Payment Flow UI**: User-friendly payment confirmation dialogs
- **Payment Proof Handling**: Automatic inclusion of payment proofs in follow-up requests
- **Payment History**: Track payments made to x402 endpoints
- **Payment Preauthorization**: Allow users to preapprove payments up to certain amounts

### Integration with @x402/fetch
Future versions may integrate with the official `@x402/fetch` package for:
- Automatic payment flow handling
- Support for multiple blockchain networks (Ethereum, Base, Solana)
- Integration with payment facilitators (Coinbase, Cloudflare)
- Standardized x402 protocol compliance

## Examples

### Basic Usage
After configuration, your x402 endpoints appear as MCP tools:
```
x402_ai_code_analyzer - AI Code Analyzer: Analyze Solidity code for potential issues using AI
x402_smart_contract_deployer - Smart Contract Deployer: Deploy smart contracts with advanced configuration
```

### Calling an Endpoint
The AI will be able to call your endpoint with properly validated parameters:
```json
{
  "name": "x402_ai_code_analyzer",
  "arguments": {
    "sourceCode": "contract MyContract { ... }",
    "analysisType": "security-only",
    "includeOptimizations": false
  }
}
```