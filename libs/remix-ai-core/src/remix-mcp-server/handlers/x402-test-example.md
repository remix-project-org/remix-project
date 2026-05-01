# X402 Handler Test Example

## Test Configuration

Add this to your `remix.config.json` to test the x402 implementation:

```json
{
  "mcp": {
    "version": "1.0.0",
    "security": {
      "permissions": {
        "requirePermissions": true,
        "defaultPermissions": ["*"]
      }
    },
    "x402Endpoints": [
      {
        "id": "test_free_endpoint",
        "title": "Free Test Endpoint",
        "description": "Test endpoint that doesn't require payment",
        "endpoint": "https://httpbin.org/json",
        "parameters": {},
        "permissions": ["test:read"],
        "enabled": true
      },
      {
        "id": "test_payment_endpoint",
        "title": "Payment Required Test",
        "description": "Mock endpoint that simulates x402 payment requirement",
        "endpoint": "https://httpbin.org/status/402",
        "parameters": {
          "amount": {
            "type": "string",
            "description": "Payment amount to test",
            "required": false,
            "default": "0.001"
          }
        },
        "permissions": ["test:payment"],
        "enabled": true
      }
    ]
  }
}
```

## Expected Behavior

### Test 1: Free Endpoint (x402_test_free_endpoint)
- **Request**: Call with no parameters
- **Expected**: 200 OK response with JSON data
- **Result**: `{ success: true, paymentRequired: false, result: {...} }`

### Test 2: Payment Required Endpoint (x402_test_payment_endpoint)  
- **Request**: Call with `amount: "0.001"`
- **Expected**: 402 Payment Required detection
- **Result**: `{ success: false, paymentRequired: true, message: "Payment required..." }`

## Manual Testing Steps

1. **Add Configuration**: Update your `remix.config.json` with the test endpoints above
2. **Reload MCP**: The server should automatically reload and register the new tools:
   - `x402_test_free_endpoint`
   - `x402_test_payment_endpoint`
3. **Test Free Endpoint**: Use the AI to call the free endpoint and verify it works
4. **Test Payment Endpoint**: Use the AI to call the payment endpoint and verify it detects the 402 status
5. **Check Console**: Look for log messages showing x402 tool registration

## Debugging

Check the browser console/terminal for these messages:
- `[RemixMCPServer] Registering 2 X402 endpoint tools`
- `[RemixMCPServer] Successfully registered 2 X402 tools`
- Payment notification: `Payment required for Payment Required Test: {...}`

## Tool Names Generated

The system should create these MCP tools:
- `x402_test_free_endpoint` - Free Test Endpoint: Test endpoint that doesn't require payment
- `x402_test_payment_endpoint` - Payment Required Test: Mock endpoint that simulates x402 payment requirement

## Validation Tests

The handler includes these validation features:
- **Parameter Type Checking**: Validates string/number/boolean types
- **Required Parameter Validation**: Ensures required parameters are provided  
- **Enum Validation**: Checks values against allowed enum options
- **Pattern Matching**: Validates strings against regex patterns
- **Default Values**: Applies default values for optional parameters