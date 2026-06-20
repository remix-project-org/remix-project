import { useState } from "react";
import { parseEther, formatEther, type WalletClient } from "viem";
import { useBalance, useWrite } from "@/lib/hooks";
import { CONTRACT_ADDRESS, MARKET_ABI } from "@/lib/contract";

const OUTCOMES = [1, 2, 3];

interface PlaceBetModalProps {
  marketId: bigint;
  team1: string;
  team2: string;
  address: `0x${string}`;
  walletClient: WalletClient;
  onClose: () => void;
  onSuccess: () => void;
}

export function PlaceBetModal({
  marketId, team1, team2, address, walletClient, onClose, onSuccess,
}: PlaceBetModalProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null);
  const [amount, setAmount] = useState("");

  const outcomeLabels = [team1, "Draw", team2];

  const parsedAmount = (() => {
    try { return parseEther(amount || "0"); } catch { return 0n; }
  })();

  const { data: balance } = useBalance(address);

  const bet = useWrite(walletClient);

  if (bet.isSuccess) { onSuccess(); onClose(); }

  const handleBet = () => {
    if (selectedOutcome === null || parsedAmount === 0n) return;
    bet.write({
      address: CONTRACT_ADDRESS,
      abi: MARKET_ABI,
      functionName: "makePrediction",
      args: [marketId, selectedOutcome],
      value: parsedAmount,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Place Prediction</h2>
          <button onClick={onClose} className="modal-close">✕</button>
        </div>

        <p className="modal-sub">{team1} vs {team2}</p>

        {/* Outcome selection */}
        <div className="outcome-list">
          {OUTCOMES.map((value, i) => (
            <button
              key={value}
              onClick={() => setSelectedOutcome(value)}
              className={`outcome-btn sel-${i}${selectedOutcome === value ? " is-selected" : ""}`}
            >
              {outcomeLabels[i]}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="field">
          <label className="field-label">Amount (ETH)</label>
          <input
            type="number"
            min="0"
            step="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="input"
          />
          {balance != null && (
            <p className="field-hint">Balance: {formatEther(balance)} ETH</p>
          )}
        </div>

        {/* Error */}
        {bet.error && <p className="field-error">{bet.error}</p>}

        <button
          onClick={handleBet}
          disabled={bet.isBusy || selectedOutcome === null || parsedAmount === 0n}
          className="btn btn-primary btn-block"
        >
          {bet.isBusy ? "Confirming…" : "Place Bet"}
        </button>
      </div>
    </div>
  );
}
