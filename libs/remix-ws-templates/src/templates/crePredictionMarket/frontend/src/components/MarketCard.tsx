import { Link } from "react-router-dom";
import { formatEther } from "viem";
import { useRead } from "@/lib/hooks";
import { CONTRACT_ADDRESS, MARKET_ABI, STATUS_LABEL, STATUS_COLOR, OUTCOME_LABEL } from "@/lib/contract";

function PoolBar({ totals, team1, team2 }: { totals: readonly bigint[]; team1: string; team2: string }) {
  const values = totals.map(Number);
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="muted-sm">No bets yet</p>;
  const pct = values.map((v) => ((v / total) * 100).toFixed(0));
  return (
    <div className="poolbar">
      <div className="poolbar-track">
        {pct.map((p, i) => (
          <div key={i} className={`seg seg-${i}`} style={{ width: `${p}%` }} />
        ))}
      </div>
      <div className="poolbar-legend">
        <span>{team1} {pct[0]}%</span>
        <span>Draw {pct[1]}%</span>
        <span>{team2} {pct[2]}%</span>
      </div>
    </div>
  );
}

export function MarketCard({ marketId }: { marketId: bigint }) {
  const { data: market, isLoading } = useRead<{
    team1: string; team2: string; status: number; outcome: number;
    settledAfter: bigint; predTotals: readonly bigint[];
  }>({
    address: CONTRACT_ADDRESS,
    abi: MARKET_ABI,
    functionName: "getMarket",
    args: [marketId],
  }, [marketId.toString()]);

  const { data: testMode } = useRead<boolean>({
    address: CONTRACT_ADDRESS,
    abi: MARKET_ABI,
    functionName: "testMode",
    args: [],
  }, []);

  if (isLoading) return (
    <div className="card skeleton">
      <div className="skel-bar skel-h6 skel-w34 mb-3" />
      <div className="skel-bar skel-h4 skel-w12" />
    </div>
  );
  if (!market) return null;

  const { team1, team2, status, outcome, settledAfter, predTotals } = market;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const canSettle = status === 0 && (now >= settledAfter || !!testMode);
  const totalPool = predTotals[0] + predTotals[1] + predTotals[2];

  return (
    <Link to={`/market/${marketId.toString()}`} className="card-link">
      <div className="card card-hover">
        <div className="card-head">
          <h3 className="match-title">
            {team1} <span className="vs">vs</span> {team2}
          </h3>
          <span className={`badge ${STATUS_COLOR[status]}`}>
            {canSettle ? "Ready to Settle" : STATUS_LABEL[status]}
          </span>
        </div>

        {status === 2 && (
          <p className="result-line">
            Result: <span className="value">{OUTCOME_LABEL(outcome, team1, team2)}</span>
          </p>
        )}

        <PoolBar totals={predTotals} team1={team1} team2={team2} />

        <p className="pool-line">Pool: {formatEther(totalPool)} ETH</p>
      </div>
    </Link>
  );
}
