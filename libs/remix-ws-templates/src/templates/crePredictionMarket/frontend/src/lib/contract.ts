export const CONTRACT_ADDRESS = (
  import.meta.env.CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

export const MARKET_ABI = [
  {
    name: "nextMarketId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "testMode",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "updateTestMode",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "enabled", type: "bool" }],
    outputs: [],
  },
  {
    name: "matchHasMarket",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "externalMatchId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "matchMarketId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "externalMatchId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "createMarket",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "externalMatchId", type: "uint256" },
      { name: "team1", type: "string" },
      { name: "team2", type: "string" },
      { name: "kickoff", type: "uint256" },
      { name: "settledAfter", type: "uint256" },
    ],
    outputs: [{ name: "marketId", type: "uint256" }],
  },
  {
    name: "getMarket",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "externalMatchId", type: "uint256" },
          { name: "team1", type: "string" },
          { name: "team2", type: "string" },
          { name: "kickoff", type: "uint256" },
          { name: "settledAfter", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "outcome", type: "uint8" },
          { name: "predTotals", type: "uint256[3]" },
          { name: "predCounts", type: "uint256[3]" },
        ],
      },
    ],
  },
  {
    name: "getPrediction",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "amount", type: "uint256" },
          { name: "pred", type: "uint8" },
          { name: "claimed", type: "bool" },
        ],
      },
    ],
  },
  {
    // payable — ETH sent as msg.value
    name: "makePrediction",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "outcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    name: "requestSettlement",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "claimPrediction",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "refundPrediction",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
] as const;

export const STATUS_LABEL: Record<number, string> = {
  0: "Open",
  1: "Pending CRE",
  2: "Settled",
};

export const STATUS_COLOR: Record<number, string> = {
  0: "badge-open",
  1: "badge-pending",
  2: "badge-settled",
};

export const OUTCOME_LABEL = (outcome: number, team1: string, team2: string) => {
  switch (outcome) {
    case 1: return team1;
    case 2: return "Draw";
    case 3: return team2;
    case 4: return "Cancelled";
    default: return "—";
  }
};
