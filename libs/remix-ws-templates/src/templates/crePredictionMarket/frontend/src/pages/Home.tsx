import { useRead } from "@/lib/hooks";
import { useWallet } from "@/lib/wallet";
import { CONTRACT_ADDRESS, MARKET_ABI } from "@/lib/contract";
import { MarketCard } from "@/components/MarketCard";
import { MatchMarkets } from "@/components/MatchMarkets";

export function HomePage() {
  const { isConnected } = useWallet();

  const { data: nextMarketId, isLoading, refetch } = useRead<bigint>({
    address: CONTRACT_ADDRESS,
    abi: MARKET_ABI,
    functionName: "nextMarketId",
  });

  const total = Number(nextMarketId ?? 0n);

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Markets</h1>
        <p className="page-subtitle">
          Predict FIFA World Cup match outcomes (non official and study only). Settlements resolved on-chain by Chainlink CRE.
        </p>
      </div>

      {isLoading && (
        <div className="grid">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card skeleton skeleton-card" />
          ))}
        </div>
      )}

      {!isLoading && total === 0 && (
        <div className="empty">
          <p className="empty-icon">⚽</p>
          <p className="empty-title">No markets yet.</p>
          <p className="empty-sub">Markets are created by the contract owner for each upcoming match.</p>
        </div>
      )}

      {total > 0 && (
        <div className="grid">
          {[...Array(total)].map((_, i) => (
            <MarketCard key={i} marketId={BigInt(i)} />
          ))}
        </div>
      )}

      {isConnected && <MatchMarkets onMarketCreated={refetch} />}
    </div>
  );
}
