// main.ts — CRE workflow: listens for SettlementRequested events, fetches World Cup match result,
// settles WorldCupPredictionMarket on-chain via Chainlink CRE.
import {
  cre,
  type Runtime,
  Runner,
  getNetwork,
  bytesToHex,
  type EVMLog,
  consensusIdenticalAggregation,
  json,
} from "@chainlink/cre-sdk";
import { keccak256, toHex, decodeEventLog, parseAbi } from "viem";
import {
  configSchema,
  type Config,
  type ConfigInput,
  type FootballMatchResponse,
  type OutcomeValue,
  OUTCOME,
} from "./types";
import { settleMatch } from "./evm";

// Consensus-aggregated result of resolving a match — must be null-free to satisfy
// the SDK's serializable-type guard on consensusIdenticalAggregation.
type MatchResult = {
  outcome: number;
  status: string;
  homeTeam: string;
  awayTeam: string;
};

const eventAbi = parseAbi([
  "event SettlementRequested(uint256 indexed marketId, uint256 indexed externalMatchId)",
]);
// keccak256 topic for SettlementRequested(uint256,uint256)
const eventSignature = "SettlementRequested(uint256,uint256)";

// football-data.org score.winner → Solidity Outcome enum value
const WINNER_TO_OUTCOME: Record<string, number> = {
  HOME_TEAM: OUTCOME.Team1Win,
  DRAW: OUTCOME.Draw,
  AWAY_TEAM: OUTCOME.Team2Win,
};

/*********************************
 * EVM Log Trigger Handler
 *********************************/

const onSettlementRequested = (runtime: Runtime<Config>, log: EVMLog): string => {
  // 1. Decode SettlementRequested event
  const topics = log.topics.map((t) => bytesToHex(t)) as [`0x${string}`, ...`0x${string}`[]];
  const data = bytesToHex(log.data);
  const decoded = decodeEventLog({ abi: eventAbi, data, topics });

  const marketId = decoded.args.marketId as bigint;
  const externalMatchId = decoded.args.externalMatchId as bigint;

  runtime.log(`Settlement requested — marketId=${marketId} externalMatchId=${externalMatchId}`);

  // 2. Fetch match result from football-data.org (free tier, requires X-Auth-Token header)
  // Register a free key at https://www.football-data.org/client/register
  const apiKey = runtime.getSecret({ id: "FOOTBALL_API_KEY_VAR" }).result().value;
  const httpClient = new cre.capabilities.HTTPClient();

  // The HTTP capability runs in node mode. Fetch + decode the outcome inside the node
  // function and return a small, null-free (consensus-serializable) result that the DON
  // agrees on by identical aggregation. If the result can't be obtained (API error, match
  // not finished, or no usable winner), return outcome=None so the handler skips settlement
  // instead of writing a bogus result on-chain.
  const result = httpClient
    .sendRequest(
      runtime,
      (sendRequester): MatchResult => {
        const response = sendRequester
          .sendRequest({
            method: "GET",
            url: `https://api.football-data.org/v4/matches/${externalMatchId.toString()}`,
            headers: { "X-Auth-Token": apiKey },
          })
          .result();

        // Couldn't reach the API / non-200 — no result, do not settle.
        if (response.statusCode !== 200) {
          return { outcome: OUTCOME.None, status: `HTTP_${response.statusCode}`, homeTeam: "", awayTeam: "" };
        }

        const match = json(response) as FootballMatchResponse;

        // Determine outcome. OUTCOME.None signals "no settleable result" → skip settlement.
        let outcome: number = OUTCOME.None;
        if (match.status === "CANCELLED" || match.status === "POSTPONED") {
          outcome = OUTCOME.Cancelled;
        } else if (match.status === "FINISHED") {
          const winner = match.score?.winner;
          // FINISHED but no usable winner → leave as None (do not settle).
          outcome = winner != null ? (WINNER_TO_OUTCOME[winner] ?? OUTCOME.None) : OUTCOME.None;
        }
        // Any other status (TIMED / IN_PLAY / PAUSED / …) → not finished, stays None.

        return {
          outcome,
          status: match.status,
          homeTeam: match.homeTeam?.name ?? "",
          awayTeam: match.awayTeam?.name ?? "",
        };
      },
      consensusIdenticalAggregation<MatchResult>()
    )()
    .result();

  runtime.log(`Match "${result.homeTeam} vs ${result.awayTeam}" — status: ${result.status}`);

  // 3. Guard: only settle when the API returned a definite, settleable outcome.
  //    If no result could be obtained, do NOT call settleMatch (→ contract _settle).
  if (result.outcome === OUTCOME.None) {
    runtime.log(`No result for market ${marketId} (status=${result.status}) — skipping settlement`);
    return `Market ${marketId} not settled — result unavailable (status=${result.status})`;
  }

  runtime.log(`Resolved outcome=${result.outcome}`);

  // 4. Submit settlement on-chain via CRE forwarder → WorldCupPredictionMarket.onReport()
  const txHash = settleMatch(runtime, marketId, result.outcome as OutcomeValue);

  return `Market ${marketId} settled with outcome ${result.outcome} — tx: ${txHash}`;
};

/*********************************
 * Workflow Initialization
 *********************************/

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const settlementRequestedTopic = keccak256(toHex(eventSignature));

  return [
    cre.handler(
      evmClient.logTrigger({
        addresses: [config.marketAddress],
        topics: [{ values: [settlementRequestedTopic] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onSettlementRequested
    ),
  ];
};

/*********************************
 * Entry Point
 *********************************/

export async function main() {
  const runner = await Runner.newRunner<Config, ConfigInput>({ configSchema });
  await runner.run(initWorkflow);
}

main();
