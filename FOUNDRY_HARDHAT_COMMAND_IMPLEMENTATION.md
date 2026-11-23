# Foundry and Hardhat Command Execution Implementation

## Summary

This implementation adds comprehensive support for executing Foundry and Hardhat commands through the Remix MCP Server, allowing AI agents to interact with these development frameworks.

## Changes Made

### 1. Plugin Extensions

#### Foundry Plugin (`apps/remixdesktop/src/plugins/foundryPlugin.ts`)
- **Added method:** `runCommand(commandArgs: string)`
  - Executes any Foundry command (forge, cast, anvil)
  - Validates commands to ensure they start with allowed tools
  - Captures stdout and stderr
  - Logs output to Remix terminal
  - Returns exit code and output

- **Updated methods list:** Added `'runCommand'` to the profile

#### Hardhat Plugin (`apps/remixdesktop/src/plugins/hardhatPlugin.ts`)
- **Added method:** `runCommand(commandArgs: string)`
  - Executes any Hardhat command
  - Validates commands to ensure they are Hardhat commands
  - Captures stdout and stderr
  - Logs output to Remix terminal
  - Returns exit code and output

- **Updated methods list:** Added `'runCommand'` to the profile

### 2. MCP Server Handlers

#### New Handlers in `FoundryHardhatHandler.ts`

**FoundryRunCommandHandler**
- Tool name: `foundry_run_command`
- Executes any Foundry command (forge, cast, anvil)
- Validates command format
- Returns execution results including stdout, stderr, and exit code

**HardhatRunCommandHandler**
- Tool name: `hardhat_run_command`
- Executes any Hardhat command
- Validates command format (must be hardhat or npx hardhat)
- Returns execution results including stdout, stderr, and exit code

#### Updated Handlers

**GetFoundryHardhatInfoHandler**
- Added comprehensive information about command execution tools
- Included example commands for various operations:
  - Testing (forge test, npx hardhat test)
  - Deployment scripts (forge script, npx hardhat run)
  - Contract interaction (cast commands)
  - Local nodes (anvil, npx hardhat node)

### 3. Tool Registration

Updated `createFoundryHardhatTools()` to include:
- `foundry_run_command` - Execute any Foundry command
- `hardhat_run_command` - Execute any Hardhat command

Total tools: 7 (up from 5)

## Available Commands

### Foundry Commands

**Testing:**
- `forge test` - Run all tests
- `forge test -vvv` - Verbose test output
- `forge test --match-test testName` - Run specific test
- `forge test --match-contract ContractName` - Run tests for specific contract

**Scripts:**
- `forge script scripts/Deploy.s.sol` - Run deployment script
- `forge script scripts/Deploy.s.sol --rpc-url $URL --broadcast` - Deploy and broadcast

**Contract Interaction (Cast):**
- `cast call <address> "method(args)" <params>` - Call contract method
- `cast send <address> "method(args)" <params>` - Send transaction
- `cast balance <address>` - Check balance

**Development:**
- `anvil` - Start local Ethereum node
- `forge build` - Build contracts
- `forge clean` - Clean build artifacts

### Hardhat Commands

**Testing:**
- `npx hardhat test` - Run all tests
- `npx hardhat test --grep "pattern"` - Run specific tests
- `npx hardhat coverage` - Generate coverage report

**Deployment:**
- `npx hardhat run scripts/deploy.js` - Run deployment script
- `npx hardhat run scripts/deploy.js --network <network>` - Deploy to specific network

**Verification:**
- `npx hardhat verify --network <network> <address> <args>` - Verify contract

**Development:**
- `npx hardhat node` - Start local Hardhat node
- `npx hardhat console` - Interactive console
- `npx hardhat accounts` - List accounts
- `npx hardhat compile` - Compile contracts
- `npx hardhat clean` - Clean artifacts

## Security Features

### Command Validation

**Foundry:**
- Commands MUST start with: `forge`, `cast`, or `anvil`
- Validation occurs at both handler and plugin level
- Invalid commands are rejected with clear error messages

**Hardhat:**
- Commands MUST be Hardhat commands
- Must start with `hardhat` or `npx hardhat`
- Validation occurs at both handler and plugin level
- Invalid commands are rejected with clear error messages

### Execution Security

- Commands execute in the current working directory only
- stdout and stderr are captured and logged
- Exit codes are returned for error handling
- No arbitrary shell commands allowed
- Shell execution is scoped to validated framework commands

## Usage Examples

### Running Tests

**Foundry:**
```json
{
  "name": "foundry_run_command",
  "arguments": {
    "command": "forge test -vvv"
  }
}
```

**Hardhat:**
```json
{
  "name": "hardhat_run_command",
  "arguments": {
    "command": "npx hardhat test --grep 'MyTest'"
  }
}
```

### Running Deployment Scripts

**Foundry:**
```json
{
  "name": "foundry_run_command",
  "arguments": {
    "command": "forge script scripts/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast"
  }
}
```

**Hardhat:**
```json
{
  "name": "hardhat_run_command",
  "arguments": {
    "command": "npx hardhat run scripts/deploy.js --network localhost"
  }
}
```

### Contract Interaction (Foundry Cast)

```json
{
  "name": "foundry_run_command",
  "arguments": {
    "command": "cast call 0x123... \"balanceOf(address)\" 0xabc..."
  }
}
```

### Starting Local Nodes

**Foundry (Anvil):**
```json
{
  "name": "foundry_run_command",
  "arguments": {
    "command": "anvil"
  }
}
```

**Hardhat:**
```json
{
  "name": "hardhat_run_command",
  "arguments": {
    "command": "npx hardhat node"
  }
}
```

## Response Format

Success response includes:
- `success`: true/false
- `message`: Description of what was executed
- `command`: The command that was run
- `exitCode`: Exit code from the command
- `stdout`: Standard output
- `stderr`: Standard error output

Example:
```json
{
  "success": true,
  "message": "Foundry command executed successfully: forge test",
  "command": "forge test",
  "exitCode": 0,
  "stdout": "Running 10 tests...\nAll tests passed!",
  "stderr": ""
}
```

## Files Modified/Created

### Created:
- `libs/remix-ai-core/src/remix-mcp-server/handlers/FoundryHardhatHandler.ts` (initial creation in previous PR)
- `libs/remix-ai-core/src/remix-mcp-server/handlers/FoundryHardhatHandler.README.md`
- `FOUNDRY_HARDHAT_COMMAND_IMPLEMENTATION.md` (this file)

### Modified:
- `apps/remixdesktop/src/plugins/foundryPlugin.ts`
  - Added `runCommand` method
  - Updated profile methods list

- `apps/remixdesktop/src/plugins/hardhatPlugin.ts`
  - Added `runCommand` method
  - Updated profile methods list

- `libs/remix-ai-core/src/remix-mcp-server/handlers/FoundryHardhatHandler.ts`
  - Added `FoundryRunCommandHandler` class
  - Added `HardhatRunCommandHandler` class
  - Updated `GetFoundryHardhatInfoHandler` to include command execution info
  - Updated `createFoundryHardhatTools()` to register new handlers

- `libs/remix-ai-core/src/remix-mcp-server/handlers/FoundryHardhatHandler.README.md`
  - Added documentation for new command handlers
  - Added security section
  - Added usage examples

## Benefits

1. **Flexibility:** AI agents can now execute any Foundry or Hardhat command, not just compile
2. **Testing:** Full test suite execution with custom flags and filters
3. **Deployment:** Run deployment scripts with network configurations
4. **Contract Interaction:** Use Cast to interact with deployed contracts
5. **Development:** Start local nodes, run console, and more
6. **Security:** Command validation prevents arbitrary code execution
7. **Observability:** All output is logged to Remix terminal for visibility

## Integration with Remix Web3

The implementation seamlessly integrates with Remix Web3:
- Terminal output shows command execution in real-time
- File watchers sync compilation artifacts automatically
- Working directory context maintained across commands
- Plugin architecture ensures clean separation of concerns

## Future Enhancements

Potential improvements:
- Add timeout configuration for long-running commands
- Support for command cancellation
- Better handling of interactive commands
- Command history and replay functionality
- Preset command templates for common operations
