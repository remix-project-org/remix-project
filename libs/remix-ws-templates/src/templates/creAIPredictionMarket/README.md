# CRE Bootcamp: AI-Powered Prediction Markets

A hands-on bootcamp for building with [**Chainlink Runtime Environment (CRE)**](https://docs.chain.link/cre).

It is also available in:
- [Español](https://smartcontractkit.github.io/cre-bootcamp-2026/es/)
- [Mandarin](https://smartcontractkit.github.io/cre-bootcamp-2026/cn/)
- [Português](https://smartcontractkit.github.io/cre-bootcamp-2026/pt/)

> **Disclaimer**: This tutorial represents an educational example to use a Chainlink system, product, or service and is provided to demonstrate how to interact with Chainlink's systems, products, and services to integrate them into your own. This template is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, it has not been audited, and it may be missing key checks or error handling to make the usage of the system, product or service more clear. Do not use the code in this example in a production environment without completing your own audits and application of best practices. Neither Chainlink Labs, the Chainlink Foundation, nor Chainlink node operators are responsible for unintended outputs that are generated due to errors in code.

## 📚 Book

The bootcamp tutorial is available in a markdown book format.

Either visit:

**https://smartcontractkit.github.io/cre-bootcamp-2026/**

Or run locally:

```bash
cargo install mdbook
cd book
mdbook serve --open
```

## Curriculum

**Day 1: Foundations + Market Creation**

- CRE Mental Model
- Project Setup
- Smart Contract Development
- HTTP Trigger & EVM Write

**Day 2: Complete Settlement Workflow**

- Log Trigger
- EVM Read
- AI Integration (Gemini)
- End-to-End Testing

## What You'll Build

An AI-powered prediction market using CRE capabilities:

- **HTTP Trigger** - Create markets via API requests
- **Log Trigger** - Event-driven settlement automation
- **EVM Read** - Read market state from the blockchain
- **HTTP Capability** - Query Gemini AI for real-world outcomes
- **EVM Write** - Verified on-chain writes with DON consensus

## Required Setup

Complete these **before** the bootcamp:

- [Node.js v20+](https://nodejs.org/)
- [Bun v1.3+](https://bun.sh/)
- [CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation)
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Ethereum Sepolia in your wallet](https://chainlist.org/chain/11155111)
- [Sepolia ETH from faucet](https://faucets.chain.link/)
- [Gemini API Key](https://aistudio.google.com/apikey)

## Running the Example

### 1. Clone the repository

```bash
git clone https://github.com/smartcontractkit/cre-bootcamp-2026.git
cd cre-bootcamp-2026
```

#### Repo structure

The main focus of the bootcamp will be the following:

```
├── prediction-market
│   ├── contracts  # smart contracts
│   ├── my-workflow # CRE workflows
│   ├── project.yaml # CRE project config
│   └── secrets.yaml  # secrets for CRE to use at runtime
```

### 2. Set up environment variables

Create `.env` in `prediction-market/` and set `CRE_ETH_PRIVATE_KEY` and `GEMINI_API_KEY_VAR` variables:

```bash
###############################################################################
### REQUIRED ENVIRONMENT VARIABLES - SENSITIVE INFORMATION                  ###
### DO NOT STORE RAW SECRETS HERE IN PLAINTEXT IF AVOIDABLE                 ###
### DO NOT UPLOAD OR SHARE THIS FILE UNDER ANY CIRCUMSTANCES                ###
###############################################################################

# Ethereum private key or 1Password reference (e.g. op://vault/item/field)
CRE_ETH_PRIVATE_KEY=YOUR_PRIVATE_KEY_HERE

# Default target used when --target flag is not specified (e.g. staging-settings, production-settings, my-target)
CRE_TARGET=staging-settings

# Gemini configuration: API Key
GEMINI_API_KEY_VAR=YOUR_GEMINI_API_KEY_HERE
```

### 3. Install workflow dependencies

```bash
cd prediction-market/my-workflow
bun install
cd ..
```

### 4. Deploy the smart contract

```bash
source .env
cd contracts

forge create src/PredictionMarket.sol:PredictionMarket \
  --rpc-url "https://ethereum-sepolia-rpc.publicnode.com" \
  --private-key $CRE_ETH_PRIVATE_KEY \
  --broadcast \
  --constructor-args 0x15fc6ae953e024d975e77382eeec56a9101f9f88
```

> Note: the contructor argument is the [CRE Forwarder Contract](https://docs.chain.link/cre/guides/workflow/using-evm-client/supported-networks-go#understanding-forwarder-addresses) address.

Save the deployed Prediction Market Contract address and update `my-workflow/config.staging.json`:

```json
{
  "evms": [
    {
      "marketAddress": "0xYOUR_DEPLOYED_ADDRESS",
      ...
    }
  ]
}
```

### 5. Create a market (HTTP Trigger)

```bash
cd ..  # Back to prediction-market/
cre workflow simulate my-workflow --broadcast
```

Select HTTP trigger (option 1) and enter:

```json
{ "question": "Will Argentina win the 2022 World Cup?" }
```

### 6. Place a prediction

```bash
export MARKET_ADDRESS=0xYOUR_DEPLOYED_ADDRESS

cast send $MARKET_ADDRESS \
  "predict(uint256,uint8)" 0 0 \
  --value 0.01ether \
  --rpc-url "https://ethereum-sepolia-rpc.publicnode.com" \
  --private-key $CRE_ETH_PRIVATE_KEY
```

> Note: `0 0` above corresponds to do the Market Id and the prediction (Yes = 0, No = 1). See the `predict()` function in `./prediction-market/contracts/src/PredictionMarket.sol`

### 7. Request settlement

Request settlement by passing in the relevant Market Id.

```bash
cast send $MARKET_ADDRESS \
  "requestSettlement(uint256)" 0 \
  --rpc-url "https://ethereum-sepolia-rpc.publicnode.com" \
  --private-key $CRE_ETH_PRIVATE_KEY
```

Save the transaction hash!

### 8. Settle the market (Log Trigger)

```bash
cre workflow simulate my-workflow --broadcast
```

Select Log trigger (option 2), enter the tx hash from step 7 and event index `0`.

### 9. Claim winnings

```bash
cast send $MARKET_ADDRESS \
  "claim(uint256)" 0 \
  --rpc-url "https://ethereum-sepolia-rpc.publicnode.com" \
  --private-key $CRE_ETH_PRIVATE_KEY
```
