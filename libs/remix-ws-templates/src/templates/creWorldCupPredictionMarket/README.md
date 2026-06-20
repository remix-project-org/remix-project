# World Cup Prediction Market

Non official and study only decentralized 1X2 prediction market for FIFA World Cup matches, settled on-chain by **Chainlink CRE** (Chainlink Runtime Environment).

Users predict match outcomes (Team 1 Win / Draw / Team 2 Win) by staking Sepolia ETH. When a match ends, anyone can trigger settlement — the CRE workflow fetches the result from [football-data.org](https://www.football-data.org/) and writes it on-chain via the CRE forwarder. Winners claim a proportional share of the ETH pool.

---

## How It Works

```
Owner creates market (matchId, team1, team2, kickoff, settledAfter)
    ↓
Users place predictions until kickoff (match start)
    ↓
Anyone calls requestSettlement() after settledAfter (match finished)
    ↓ (emits SettlementRequested event)
Chainlink CRE workflow picks up the event
    ↓
GET football-data.org/v4/matches/{matchId}
    ↓
CRE nodes reach consensus on outcome
    ↓ (no result available → settlement is skipped, nothing written on-chain)
Forwarder calls onReport() → WorldCupPredictionMarket settles
    ↓
Winners call claimPrediction() — losers get nothing, cancelled matches get a refund
```

> **Test mode:** when `testMode` is `true` (the default on deploy), the `kickoff` and
> `settledAfter` time checks are bypassed, so the owner can bet on and settle past/started
> matches for end-to-end testing. Turn it off with `updateTestMode(false)` for production.

---

## Scaffold CRE

The file `CRE-world-cup-prediction-market.json` can be imported at [Scaffold CRE](https://cre.solange.dev/) to visualize and generate the workflow graph.

---

## Tech Stack

| Layer | Stack |
|---|---|
| Smart contract | Solidity 0.8.34, OpenZeppelin, Chainlink ReceiverTemplate |
| CRE workflow | TypeScript, `@chainlink/cre-sdk`, viem |
| Data API | football-data.org (free tier) |
| Frontend | Vite, React, React Router, viem, plain CSS |
| Network | Ethereum Sepolia testnet |

---

## Prerequisites

- [Bun](https://bun.sh) >= 1.2.21
- [Chainlink CRE CLI](https://docs.chain.link/cre/reference/cli)

---

## Project Structure

```
world-cup-prediction-market/
├── contracts/
│   └── WorldCupPredictionMarket.sol   Solidity prediction market contract
├── cre-workflow/                      CRE workflow (TypeScript)
│   ├── main.ts                        EVM log trigger + settlement handler
│   ├── evm.ts                         On-chain write via CRE forwarder
│   ├── types.ts                       Config schema + API types
│   ├── config.json                    Chain selector + contract address
│   ├── workflow.yaml                  CRE targets (staging)
│   └── package.json
├── frontend/                          Vite + React frontend (viem)
│   ├── index.html                     Vite entry point
│   ├── vite.config.ts                 Vite config (@ → ./src alias)
│   └── src/
│       ├── main.tsx                   React + Router + WalletProvider
│       ├── App.tsx                    Routes (/ and /market/:id)
│       ├── pages/
│       │   ├── Home.tsx               Markets grid
│       │   └── Market.tsx             Market detail + actions
│       ├── components/
│       │   ├── Header.tsx             Wallet connect
│       │   ├── MarketCard.tsx         Pool bar + status badge
│       │   └── PlaceBetModal.tsx      Place ETH bet modal
│       └── lib/
│           ├── client.ts              viem publicClient
│           ├── wallet.tsx             WalletContext (window.ethereum)
│           ├── hooks.ts               useRead / useWrite hooks
│           └── contract.ts            ABI + addresses
├── project.yaml                       CRE project config
├── secrets.yaml                       CRE secrets mapping
└── CRE-world-cup-prediction-market.json  Scaffold CRE import file
```

---

## Contract

**`WorldCupPredictionMarket.sol`** — extends Chainlink `ReceiverTemplate`.

### Outcome enum
| Value | Meaning |
|---|---|
| 1 | Team 1 Win (home) |
| 2 | Draw |
| 3 | Team 2 Win (away) |
| 4 | Cancelled / postponed |

### Key rules
- **One market per match** — enforced via `matchHasMarket[externalMatchId]`
- **Betting closes at `kickoff`** — no predictions accepted once the match starts
- **`requestSettlement` reverts before `settledAfter`** — `settledAfter` is the match's expected finish time, so settlement only triggers once the game is over
- **Test mode** — when `testMode` is `true`, the `kickoff` and `settledAfter` time checks are bypassed (bet/settle on past matches). See [Test Mode](#test-mode) below
- **Cancelled markets** — full stake refund via `refundPrediction()`

### Timeline
```
kickoff ───────────────────► settledAfter (≈ kickoff + 3h, match finished)
  │                              │
  └─ betting open ──┘            └─ requestSettlement allowed →
```
`kickoff` and `settledAfter` are passed in at market creation. The frontend sets
`settledAfter = kickoff + 3h` (90' + halftime + stoppage, plus margin for extra time /
penalties and the result feed). `testMode` ignores both timestamps.

### Key functions
```solidity
createMarket(externalMatchId, team1, team2, kickoff, settledAfter)  // onlyOwner
makePrediction(marketId, outcome)                                   // payable — ETH as msg.value; until kickoff
requestSettlement(marketId)                                         // only after settledAfter (match finished)
claimPrediction(marketId)                                           // winners only
refundPrediction(marketId)                                          // cancelled markets only
updateTestMode(enabled)                                             // onlyOwner — toggle test mode
```

### Test Mode

`testMode` (a `bool public`, **default `true` on deploy**) lets the owner exercise the full
flow without waiting for real match times.

| `testMode` | `makePrediction` | `requestSettlement` |
|---|---|---|
| `true` (default) | allowed while the market is **Open**, regardless of `kickoff` | allowed while **Open**, regardless of `settledAfter` |
| `false` (production) | only **before `kickoff`** | only **after `settledAfter`** |

In both modes the market must still be `Open` (not already settlement-requested or settled).

```solidity
updateTestMode(false)  // onlyOwner — switch to production time rules
updateTestMode(true)   // onlyOwner — re-enable testing
```

> ⚠️ Remember to call `updateTestMode(false)` before going live — otherwise the betting
> cutoff and settlement gate stay bypassed.

---

## Deployment

### 1. Deploy the contract (Remix Desktop)

1. Open **Remix Desktop** and create a new workspace
2. Copy `contracts/interfaces/ReceiverTemplate.sol` into the workspace, creating the folder `interfaces`
3. Copy `contracts/WorldCupPredictionMarket.sol` into the workspace
4. In the **Solidity Compiler** tab, enable **auto compile** or select compiler version `0.8.34` and compile
5. In the **Deploy & Run** tab:
   - Environment: **Browser Extension**, **Metamask** (MetaMask on Sepolia)
   - Contract: `WorldCupPredictionMarket`
   - Constructor args:
     - `forwarderAddress`: for CRE simulationon Ethereum Sepolia, use `0x15fc6ae953e024d975e77382eeec56a9101f9f88`
6. Click **Deploy** and confirm in MetaMask
7. Copy the deployed contract address


The constructor sets the Chainlink Forwarder address for security
- param _forwarderAddress: The address of the Chainlink KeystoneForwarder contract
- For Ethereum Sepolia testnet, use the `MockKeystoneForwarder`: 0x15fc6ae953e024d975e77382eeec56a9101f9f88

---

## CRE Workflow

Listens for `SettlementRequested(uint256 marketId, uint256 externalMatchId)` events via an EVM log trigger.

On each event:
1. Fetches `GET https://api.football-data.org/v4/matches/{externalMatchId}` with a free API key
2. Maps `score.winner` → outcome (`HOME_TEAM` → 1, `DRAW` → 2, `AWAY_TEAM` → 3, `CANCELLED`/`POSTPONED` → 4)
3. ABI-encodes `(uint256 marketId, uint8 outcome)` and submits via `runtime.report()` + `evmClient.writeReport()`

**No result → no settlement.** If the result can't be obtained, the workflow resolves the
outcome to `None (0)` and **skips the on-chain write** — the contract's `_settle` is never
called and the market stays `Open`. This happens when:
- the API call fails or returns a non-200 status
- the match isn't finished yet (`TIMED`, `IN_PLAY`, `PAUSED`, …)
- the match is `FINISHED` but has no usable `score.winner`

Re-emit `SettlementRequested` (call `requestSettlement` again) once the result is available
to retry.

### Setup

- 1. Get a free football-data.org API key
Register at https://www.football-data.org/client/register

- 2. Copy `.env.example` to `.env`

- 3. Update the variables
- FOOTBALL_API_KEY_SECRET
- CRE_ETH_PRIVATE_KEY

- 4. Update `cre-workflow/config.json`
```json
{
  "chainSelectorName": "ethereum-testnet-sepolia",
  "marketAddress": "0xYOUR_DEPLOYED_CONTRACT",
  "gasLimit": 500000
}
```

- 5. Install dependencies
Run from the **project root directory**:

```bash
bun install --cwd ./cre-workflow
```

---

## Frontend

Vite + React app (React Router) using pure viem — no wagmi, no RainbowKit.

### Setup

```bash
cd frontend
cp .env.example .env
# fill in CONTRACT_ADDRESS and RPC_URL
npm install
npm run dev
```

### `.env`
```
CONTRACT_ADDRESS=0x...
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
FOOTBALL_API_KEY=your_football_data_api_key
```

`FOOTBALL_API_KEY` is used by the Vite dev proxy (`/api/football` → football-data.org) to list
matches in the UI — it stays server-side and is never exposed in the client bundle.

### Pages

| Route | Description |
|---|---|
| `/` | All markets, plus a **Create Markets** panel (when connected) |
| `/market/:id` | Market detail — place bet, request settlement, claim/refund |

### Creating markets from the UI

Connect the **contract owner** wallet. The home page then shows a **Create Markets** panel with
two groups pulled from football-data.org:
- **Recent results** — the 3 most recently finished matches. Their `kickoff` and `settledAfter`
  are already in the past, so (with `testMode` on, or because the times have passed) you can
  create a market and **request settlement right away** — handy for testing the CRE settlement
  flow end-to-end without waiting for a live match.
- **Upcoming matches** — the next 5 scheduled matches.

Each row either shows a **Market created →** link if a market already exists for that match, or a
**Create Market** button (owner only) that calls `createMarket` with the match's ID, team names,
`kickoff` (match start), and `settledAfter` (kickoff + 3h, the expected finish).

---

## Simulate and Play

### Create markets

You can create markets either from the frontend or directly in Remix.

#### Option A — From the UI

Connect the **contract owner** wallet in the frontend and use the **Create Markets** panel on the
home page — pick a match and click **Create Market**. The match ID, team names, `kickoff`, and
`settledAfter` (kickoff + 3h) are filled in automatically from football-data.org.

> **Tip — testing settlement:** with `testMode` on (the default), pick **any** match and you can
> open the market and click **Request Settlement** immediately to drive the CRE flow with a real
> result — no need to wait for `kickoff` or `settledAfter`. With `testMode` off, use a match from
> the **Recent results** group (already finished) so `settledAfter` is in the past.

#### Option B — In Remix

Find match IDs from football-data.org (World Cup competition code is `WC`):
```bash
curl -H "X-Auth-Token: YOUR_KEY" \
  "https://api.football-data.org/v4/competitions/WC/matches"
```

Then call `createMarket` on the deployed contract:
- `externalMatchId`: the numeric match ID from football-data.org
- `team1`: home team name
- `team2`: away team name
- `kickoff`: match start Unix timestamp — betting closes here
- `settledAfter`: kickoff + ~10800 (3 hours, expected finish) — for an **already-finished** match,
  use a past timestamp so settlement can be requested immediately (or just leave `testMode` on)

### CRE Simulation to Settle the Market

From the project root (`world-cup-prediction-market/`), run:

```bash
cre workflow simulate cre-workflow --target staging-settings
```

It will wait the next log transaction. If you already have a transaction hash, restart with:

```bash
  cre workflow simulate cre-workflow --evm-tx-hash 0x... --evm-event-index 0
```

Example:

```bash
  cre workflow simulate cre-workflow --evm-tx-hash 0xb31890d748f5b0a67f48db77a50cc79fa52f321d38ec61cadccf2538d753a08a --evm-event-index 0
```



### Request Settlement

On the market detail page in the frontend, click **Request Settlement**. The button is enabled:
- in **production** (`testMode` off) — only after `settledAfter` (the match has finished)
- in **test mode** (`testMode` on) — any time while the market is `Open`

This emits `SettlementRequested`, which the CRE workflow listens for. Save the transaction hash
from the `requestSettlement()` call — you'll need it for the CRE simulation above.

> If the CRE workflow can't fetch a result (API down, match not finished, or no winner), it
> **skips settlement** and the market stays `Open` — just click **Request Settlement** again
> once the result is available. See [CRE Workflow](#cre-workflow).
