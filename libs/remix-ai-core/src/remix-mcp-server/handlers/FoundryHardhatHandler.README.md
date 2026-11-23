# Foundry and Hardhat Handler for Remix MCP Server

This handler provides AI agents with the ability to interact with Foundry and Hardhat development frameworks through the Remix Web3 MCP Server.

## Overview

The `FoundryHardhatHandler.ts` file contains handlers that enable AI agents to:
- Compile Solidity contracts using Foundry (`forge build`)
- Compile Solidity contracts using Hardhat (`npx hardhat compile`)
- Sync compilation artifacts with Remix Web3
- Get information about Foundry and Hardhat usage

## Available Tools

### 1. `foundry_compile`
Compiles Solidity contracts using Foundry's `forge build` command.

**Description:** Compile Solidity contracts using Foundry (forge build). This command builds your Foundry project, compiling all contracts in the src directory according to foundry.toml configuration.

**Input Schema:**
```json
{
  "sync": {
    "type": "boolean",
    "description": "Whether to sync the compilation result with Remix Web3 after compilation",
    "default": true
  }
}
```

**Permissions:** `foundry:compile`

**Underlying Command:** Calls `foundryPlugin.compile()` which runs `forge build`

### 2. `foundry_sync`
Syncs Foundry compilation artifacts with Remix Web3.

**Description:** Sync Foundry compilation artifacts with Remix Web3. This updates Remix with the latest Foundry build artifacts from the out/ and cache/ directories.

**Input Schema:** No parameters required

**Permissions:** `foundry:sync`

**Underlying Command:** Calls `foundryPlugin.sync()`

### 3. `hardhat_compile`
Compiles Solidity contracts using Hardhat's `npx hardhat compile` command.

**Description:** Compile Solidity contracts using Hardhat (npx hardhat compile). This command builds your Hardhat project, compiling all contracts in the contracts directory according to hardhat.config.js configuration.

**Input Schema:**
```json
{
  "sync": {
    "type": "boolean",
    "description": "Whether to sync the compilation result with Remix Web3 after compilation",
    "default": true
  }
}
```

**Permissions:** `hardhat:compile`

**Underlying Command:** Calls `hardhatPlugin.compile()` which runs `npx hardhat compile`

### 4. `hardhat_sync`
Syncs Hardhat compilation artifacts with Remix Web3.

**Description:** Sync Hardhat compilation artifacts with Remix Web3. This updates Remix with the latest Hardhat build artifacts from the artifacts/ and cache/ directories.

**Input Schema:** No parameters required

**Permissions:** `hardhat:sync`

**Underlying Command:** Calls `hardhatPlugin.sync()`

### 5. `foundry_run_command`
Executes any Foundry command (forge, cast, anvil) through the foundryPlugin.

**Description:** Run any Foundry command (forge, cast, or anvil) in the current working directory. Examples: "forge test", "forge script", "cast call", "anvil".

**Input Schema:**
```json
{
  "command": {
    "type": "string",
    "description": "The Foundry command to execute. Must start with 'forge', 'cast', or 'anvil'.",
    "required": true
  }
}
```

**Permissions:** `foundry:command`

**Underlying Command:** Calls `foundryPlugin.runCommand(command)` which executes the command in the working directory

**Example Commands:**
- `forge test` - Run all tests
- `forge test -vvv` - Run tests with verbose output
- `forge test --match-test testMyFunction` - Run specific test
- `forge script scripts/Deploy.s.sol` - Run deployment script
- `forge script scripts/Deploy.s.sol --rpc-url $RPC_URL --broadcast` - Deploy with broadcasting
- `cast call <address> "balanceOf(address)" <address>` - Call contract method
- `cast send <address> "transfer(address,uint256)" <to> <amount>` - Send transaction
- `anvil` - Start local Ethereum node

### 6. `hardhat_run_command`
Executes any Hardhat command through the hardhatPlugin.

**Description:** Run any Hardhat command in the current working directory. Examples: "npx hardhat test", "npx hardhat run scripts/deploy.js", "npx hardhat node".

**Input Schema:**
```json
{
  "command": {
    "type": "string",
    "description": "The Hardhat command to execute. Must be a hardhat command, typically prefixed with 'npx hardhat'.",
    "required": true
  }
}
```

**Permissions:** `hardhat:command`

**Underlying Command:** Calls `hardhatPlugin.runCommand(command)` which executes the command in the working directory

**Example Commands:**
- `npx hardhat test` - Run all tests
- `npx hardhat test --grep "MyTest"` - Run specific tests
- `npx hardhat run scripts/deploy.js` - Run deployment script
- `npx hardhat run scripts/deploy.js --network localhost` - Deploy to specific network
- `npx hardhat node` - Start local Hardhat node
- `npx hardhat verify --network mainnet <address> <args>` - Verify contract on network
- `npx hardhat accounts` - List available accounts
- `npx hardhat console` - Open interactive console

### 7. `get_foundry_hardhat_info`
Provides comprehensive information about using Foundry and Hardhat in Remix Web3.

**Description:** Get information about using Foundry and Hardhat in Remix Web3, including available commands and usage patterns.

**Input Schema:**
```json
{
  "framework": {
    "type": "string",
    "enum": ["foundry", "hardhat", "both"],
    "description": "Which framework to get info about",
    "default": "both"
  }
}
```

**Permissions:** `foundry:info`, `hardhat:info`

**Returns:** Comprehensive information including:
- Available commands and their descriptions (including command execution tools)
- Project structure
- Setup instructions
- Example commands for running tests, scripts, and more
- Comparison between frameworks (when framework="both")

## Implementation Details

### Plugin Integration

The handlers call the respective plugins:
- **Foundry:** Calls `foundryPlugin` methods which are implemented in `apps/remixdesktop/src/plugins/foundryPlugin.ts`
- **Hardhat:** Calls `hardhatPlugin` methods which are implemented in `apps/remixdesktop/src/plugins/hardhatPlugin.ts`

Both plugins:
1. Execute the compilation command using `spawn`
2. Log output to the Remix terminal
3. Watch for file changes in cache directories
4. Emit compilation results to Remix Web3

### Registration

The tools are registered in the Remix MCP Server through:
1. Export function `createFoundryHardhatTools()` in `FoundryHardhatHandler.ts`
2. Import and registration in `RemixMCPServer.ts` via `initializeDefaultTools()`
3. Export in `index.ts` for external use

## Usage Examples

### For AI Agents

When an AI agent wants to compile a Foundry project:
```json
{
  "name": "foundry_compile",
  "arguments": {}
}
```

When an AI agent wants to run Foundry tests:
```json
{
  "name": "foundry_run_command",
  "arguments": {
    "command": "forge test -vvv"
  }
}
```

When an AI agent wants to run a Foundry script:
```json
{
  "name": "foundry_run_command",
  "arguments": {
    "command": "forge script scripts/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast"
  }
}
```

When an AI agent wants to run Hardhat tests:
```json
{
  "name": "hardhat_run_command",
  "arguments": {
    "command": "npx hardhat test --grep 'MyContract'"
  }
}
```

When an AI agent wants to run a Hardhat deployment script:
```json
{
  "name": "hardhat_run_command",
  "arguments": {
    "command": "npx hardhat run scripts/deploy.js --network localhost"
  }
}
```

When an AI agent wants to get information about both frameworks:
```json
{
  "name": "get_foundry_hardhat_info",
  "arguments": {
    "framework": "both"
  }
}
```

### Response Format

Success response:
```json
{
  "content": [{
    "type": "text",
    "text": "{\"success\":true,\"message\":\"Foundry compilation completed successfully...\"}"
  }],
  "isError": false
}
```

Error response:
```json
{
  "content": [{
    "type": "text",
    "text": "Error: Foundry compilation failed: ..."
  }],
  "isError": true
}
```

## Security

The command execution handlers include security validation to prevent arbitrary command execution:

### Foundry Command Validation
- Commands must start with one of: `forge`, `cast`, or `anvil`
- Any command not starting with these tools will be rejected
- Validation happens both in the handler and in the plugin

### Hardhat Command Validation
- Commands must be Hardhat commands (starting with `hardhat` or `npx hardhat`)
- Any non-Hardhat commands will be rejected
- Validation happens both in the handler and in the plugin

### Command Execution
- All commands are executed in the current working directory
- Commands are executed with shell: true for proper argument parsing
- stdout and stderr are captured and logged to the Remix terminal
- Exit codes are returned to indicate success/failure

## File Locations

- **Handler:** `libs/remix-ai-core/src/remix-mcp-server/handlers/FoundryHardhatHandler.ts`
- **Foundry Plugin:** `apps/remixdesktop/src/plugins/foundryPlugin.ts`
- **Hardhat Plugin:** `apps/remixdesktop/src/plugins/hardhatPlugin.ts`
- **Registration:** `libs/remix-ai-core/src/remix-mcp-server/RemixMCPServer.ts`
- **Export:** `libs/remix-ai-core/src/remix-mcp-server/index.ts`

## Dependencies

The handlers depend on:
- `BaseToolHandler` from `RemixToolRegistry`
- `IMCPToolResult` from MCP types
- `Plugin` from `@remixproject/engine`
- The respective Foundry and Hardhat plugins being available in the Remix Web3

## Category

All tools are registered under `ToolCategory.COMPILATION`
