import { z } from "zod";

export const configSchema = z.object({
  chainSelectorName: z.string(),
  marketAddress: z.string(),
  gasLimit: z.number().default(500000),
});

export type Config = z.infer<typeof configSchema>;
// Input type (before defaults are applied) — needed so the schema satisfies
// StandardSchemaV1<Input, Output> where gasLimit is optional on input.
export type ConfigInput = z.input<typeof configSchema>;

// football-data.org GET /v4/matches/{id} response shape (relevant fields only)
export interface FootballMatchResponse {
  id: number;
  status:
    | "SCHEDULED"
    | "TIMED"
    | "IN_PLAY"
    | "PAUSED"
    | "FINISHED"
    | "CANCELLED"
    | "POSTPONED"
    | "SUSPENDED"
    | "AWARDED";
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    fullTime: { home: number | null; away: number | null };
  };
}

// Outcome values must match WorldCupPredictionMarket.sol Outcome enum
export const OUTCOME = {
  None: 0,
  Team1Win: 1, // HOME_TEAM
  Draw: 2,
  Team2Win: 3, // AWAY_TEAM
  Cancelled: 4,
} as const;

export type OutcomeValue = (typeof OUTCOME)[keyof typeof OUTCOME];
