import { useState } from "react";
import { formatEther } from "viem";
import { Link, useParams } from "react-router-dom";
import { useRead, useWrite } from "@/lib/hooks";
import { useWallet } from "@/lib/wallet";
import {
  CONTRACT_ADDRESS, MARKET_ABI,
  STATUS_LABEL, STATUS_COLOR, OUTCOME_LABEL,
} from "@/lib/contract";
import { PlaceBetModal } from "@/components/PlaceBetModal";

type Market = {
  externalMatchId: bigint; team1: string; team2: string;
  kickoff: bigint; settledAfter: bigint; status: number; outcome: number;
  predTotals: readonly bigint[]; predCounts: readonly bigint[];
};

type Prediction = { amount: bigint; pred: number; claimed: boolean };

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}

function PoolBreakdown({ totals, team1, team2 }: {
  totals: readonly bigint[]; team1: string; team2: string;
}) {
  const values = totals.map(Number);
  const total = values.reduce((a, b) => a + b, 0);
  const pct = total === 0 ? [33, 34, 33] : values.map((v) => Math.round((v / total) * 100));
  const labels = [team1, "Draw", team2];

  return (
    <div className="stack-sm">
      <div className="poolbar-track poolbar-track-lg">
        {pct.map((p, i) => (
          <div key={i} className={`seg seg-${i}`} style={{ width: `${p}%` }} />
        ))}
      </div>
      <div className="breakdown-grid">
        {labels.map((label, i) => (
          <div key={i} className="breakdown-cell">
            <p className={`breakdown-label label-${i}`}>{label}</p>
            <p className="breakdown-value">{formatEther(totals[i])} ETH</p>
            <p className="breakdown-pct">{pct[i]}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketPage() {
  const { id } = useParams<{ id: string }>();
  const marketId = BigInt(id ?? "0");
  const { address, walletClient, isConnected } = useWallet();
  const [showBetModal, setShowBetModal] = useState(false);

  const { data: market, isLoading, refetch: refetchMarket } = useRead<Market>({
    address: CONTRACT_ADDRESS, abi: MARKET_ABI, functionName: "getMarket", args: [marketId],
  }, [id]);

  const { data: prediction, refetch: refetchPrediction } = useRead<Prediction>({
    address: CONTRACT_ADDRESS, abi: MARKET_ABI, functionName: "getPrediction",
    args: [marketId, address!], enabled: !!address,
  }, [id, address ?? ""]);

  const { data: testMode } = useRead<boolean>({
    address: CONTRACT_ADDRESS, abi: MARKET_ABI, functionName: "testMode", args: [],
  }, []);

  const settle = useWrite(walletClient);
  const claim = useWrite(walletClient);

  if (settle.isSuccess || claim.isSuccess) { refetchMarket(); refetchPrediction(); }

  if (isLoading) return (
    <div className="detail skeleton">
      <div className="skel-bar skel-h4 skel-w24" />
      <div className="skel-bar skel-block skel-32" />
      <div className="skel-bar skel-block skel-40" />
    </div>
  );

  if (!market) return (
    <div className="empty">
      <p>Market not found.</p>
      <Link to="/" style={{ color: "var(--emerald-400)", textDecoration: "underline", marginTop: "0.5rem", display: "block" }}>← Back to markets</Link>
    </div>
  );

  const { team1, team2, status, outcome, kickoff, settledAfter, predTotals, predCounts, externalMatchId } = market;
  const now = BigInt(Math.floor(Date.now() / 1000));
  // Betting closes at kickoff; settlement opens at settledAfter.
  // testMode (owner toggle) bypasses both clocks.
  const canBet = status === 0 && (now < kickoff || !!testMode);
  const canSettle = status === 0 && (now >= settledAfter || !!testMode);
  const settled = status === 2;
  const hasPrediction = !!prediction && prediction.pred !== 0;
  const totalPool = predTotals[0] + predTotals[1] + predTotals[2];
  const totalPredictions = predCounts.reduce((a, b) => a + b, 0n);
  const settledAfterDate = new Date(Number(settledAfter) * 1000);
  const isBusy = settle.isBusy || claim.isBusy;

  return (
    <div className="detail">
      <Link to="/" className="back-link">← All markets</Link>

      {/* Header card */}
      <div className="panel">
        <div className="detail-head">
          <h1 className="detail-title">{team1} vs {team2}</h1>
          <span className={`badge badge-lg ${STATUS_COLOR[status]}`}>
            {canSettle ? "Ready to Settle" : STATUS_LABEL[status]}
          </span>
        </div>
        <p className="muted-xs">Match ID (football-data.org): {externalMatchId.toString()}</p>
        {settled ? (
          <p className="muted muted-top">
            Result: <span className="strong">{OUTCOME_LABEL(outcome, team1, team2)}</span>
          </p>
        ) : (
          <p className="muted muted-top">
            Settlement available after{" "}
            <span className="strong">{settledAfterDate.toLocaleString()}</span>
          </p>
        )}
      </div>

      {/* Pool breakdown */}
      <div className="panel stack">
        <h2 className="section-title">ETH Pool</h2>
        <PoolBreakdown totals={predTotals} team1={team1} team2={team2} />
        <div className="stat-grid">
          <StatBox label="Total pool" value={`${formatEther(totalPool)} ETH`} />
          <StatBox label="Total predictions" value={totalPredictions.toString()} />
        </div>
      </div>

      {/* Your prediction */}
      {hasPrediction && (
        <div className="panel">
          <h2 className="subhead">Your Prediction</h2>
          <div className="pred-row">
            <div>
              <p className="label-xs">Outcome</p>
              <p className="value">{OUTCOME_LABEL(prediction!.pred, team1, team2)}</p>
            </div>
            <div className="text-right">
              <p className="label-xs">Stake</p>
              <p className="value">{formatEther(prediction!.amount)} ETH</p>
            </div>
            {prediction!.claimed && (
              <span className="badge badge-lg badge-settled">Claimed</span>
            )}
          </div>
        </div>
      )}

      {/* Error messages */}
      {(settle.error || claim.error) && (
        <p className="alert-error">{settle.error ?? claim.error}</p>
      )}

      {/* Actions */}
      {isConnected && walletClient ? (
        <div className="stack-sm">
          {status === 0 && !hasPrediction && canBet && (
            <button
              onClick={() => setShowBetModal(true)}
              className="btn btn-primary btn-block btn-lg"
            >
              Place Prediction
            </button>
          )}

          {status === 0 && !hasPrediction && !canBet && (
            <div className="info-box">
              Betting is closed — the match has started. Settlement opens after{" "}
              {settledAfterDate.toLocaleString()}.
            </div>
          )}

          {canSettle && (
            <button
              onClick={() => settle.write({ address: CONTRACT_ADDRESS, abi: MARKET_ABI, functionName: "requestSettlement", args: [marketId] })}
              disabled={isBusy}
              className="btn btn-warning btn-block btn-lg"
            >
              {settle.isBusy ? "Confirming…" : "Request Settlement"}
            </button>
          )}

          {status === 1 && (
            <div className="info-box info-pending">
              ⏳ Waiting for Chainlink CRE nodes to settle this market on-chain…
            </div>
          )}

          {settled && outcome !== 4 && hasPrediction && prediction!.pred === outcome && !prediction!.claimed && (
            <button
              onClick={() => claim.write({ address: CONTRACT_ADDRESS, abi: MARKET_ABI, functionName: "claimPrediction", args: [marketId] })}
              disabled={isBusy}
              className="btn btn-primary btn-block btn-lg"
            >
              {claim.isBusy ? "Confirming…" : "🏆 Claim Winnings"}
            </button>
          )}

          {settled && outcome === 4 && hasPrediction && !prediction!.claimed && (
            <button
              onClick={() => claim.write({ address: CONTRACT_ADDRESS, abi: MARKET_ABI, functionName: "refundPrediction", args: [marketId] })}
              disabled={isBusy}
              className="btn btn-secondary btn-block"
            >
              {claim.isBusy ? "Confirming…" : "Refund (Match Cancelled)"}
            </button>
          )}

          {settled && outcome !== 4 && hasPrediction && prediction!.pred !== outcome && (
            <div className="info-box">
              Better luck next time — your prediction didn't match the result.
            </div>
          )}
        </div>
      ) : (
        <div className="info-box">
          Connect your wallet to place a prediction or claim winnings.
        </div>
      )}

      {showBetModal && walletClient && address && (
        <PlaceBetModal
          marketId={marketId}
          team1={team1}
          team2={team2}
          address={address}
          walletClient={walletClient}
          onClose={() => setShowBetModal(false)}
          onSuccess={() => { refetchMarket(); refetchPrediction(); }}
        />
      )}
    </div>
  );
}
