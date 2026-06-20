// evm.ts — On-chain settlement via CRE EVM Write capability.
// Submits encoded (marketId, outcome) to WorldCupPredictionMarket via CRE forwarder → onReport().
import {
  cre,
  type Runtime,
  getNetwork,
  bytesToHex,
  hexToBase64,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { type Config, type OutcomeValue } from "./types";

/// Encode (marketId, outcome) and submit to WorldCupPredictionMarket via CRE forwarder → onReport().
export function settleMatch(
  runtime: Runtime<Config>,
  marketId: bigint,
  outcome: OutcomeValue
): string {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Unknown chain: ${runtime.config.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // Must match _processReport: abi.decode(report, (uint256, uint8))
  const reportData = encodeAbiParameters(
    parseAbiParameters("uint256 marketId, uint8 outcome"),
    [marketId, outcome]
  );

  runtime.log(`Encoding report — marketId=${marketId} outcome=${outcome}`);

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.marketAddress,
      report: reportResponse,
      gasConfig: { gasLimit: runtime.config.gasLimit },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  runtime.log(`Settlement tx: ${txHash}`);
  return txHash;
}
