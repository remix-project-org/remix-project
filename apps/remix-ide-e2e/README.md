# Run E2E Tests

## Quick Start - Using npm script

Run any test group using the `test:e2e` script with flexible parameters:

```bash
# Option 1: Run a specific group test (most direct)
yarn test:e2e --test=importResolver_group7

# Option 2: Test name + group parameter (convenient for grouped tests)
yarn test:e2e --test=importResolver --group=group7

# Option 3: Run ALL groups for a test (automatic discovery)
yarn test:e2e --test=importResolver  # Runs all importResolver_group*.test.js files

# Option 4: Specify browser environment
yarn test:e2e --test=importResolver_group12 --env=chrome
yarn test:e2e --test=importResolver --group=group12 --env=firefox
yarn test:e2e --test=importResolver --env=firefox  # All groups with Firefox

# More examples
yarn test:e2e --test=ballot_group1
yarn test:e2e --test=ballot --group=group1
yarn test:e2e --test=ballot  # Run all ballot groups
yarn test:e2e --test=debugger  # Run all debugger groups
```

### Parameters:
- `--test`: Test file name (with or without group suffix)
- `--group`: (Optional) Specific group name to run
- `--env`: (Optional) Browser environment (default: `chromeDesktop`)

### Smart Behavior:
1. **Specific Group**: If `--test` contains `_group` or `--group` is provided → runs that specific test
2. **Auto-Discovery**: If no `--group` and test name doesn't contain `_group` → automatically finds and runs all `test_group*.test.js` files sequentially
3. **Fallback**: If no group tests exist → tries to run as single test file
4. **Fail-Fast**: When running multiple groups, stops on first failure

## Manual Usage (from project root)

If you prefer to run tests manually without the script:

```bash
# Build the E2E tests first
yarn build:e2e

# Run a specific test group
yarn nightwatch --config dist/apps/remix-ide-e2e/nightwatch-chrome.js dist/apps/remix-ide-e2e/src/tests/importResolver_group7.test.js --env=chromeDesktop
```

## Import Resolver Test Groups

The import resolver has 14 test groups covering different scenarios:

- **group1**: NPM import with versioned folders
- **group2**: Workspace package.json version resolution
- **group3**: Explicit versioned imports
- **group4**: Conflicting versions handling
- **group5**: yarn.lock version resolution
- **group6**: package-lock.json version resolution
- **group7**: Complex imports (Chainlink CCIP)
- **group8**: NPM alias support
- **group9**: GitHub imports
- **group10**: Resolution index and debugging
- **group11**: Edge cases and unresolvable imports
- **group12**: CDN imports (unpkg, jsdelivr, raw.githubusercontent.com)
- **group13**: IPFS protocol support
- **group14**: Swarm protocol support

Examples:
```bash
# Run a specific import resolver group
yarn test:e2e --test=importResolver_group1   # Full name
yarn test:e2e --test=importResolver --group=group1  # Separate params

# Run ALL import resolver groups sequentially (all 14 groups!)
yarn test:e2e --test=importResolver  # Auto-discovers and runs group1-14

# Run all groups for other tests
yarn test:e2e --test=ballot  # Runs all ballot_group*.test.js
yarn test:e2e --test=debugger  # Runs all debugger_group*.test.js

# Specific protocol tests
yarn test:e2e --test=importResolver_group12  # CDN imports only
yarn test:e2e --test=importResolver_group13  # IPFS imports only
yarn test:e2e --test=importResolver_group14  # Swarm imports only

# Run all groups with different browser
yarn test:e2e --test=importResolver --env=firefox  # All 14 groups on Firefox
```
