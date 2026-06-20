import { useEffect } from "react";
import { useMatches, type MatchInfo } from "@/lib/matches";
import { useRead, useWrite, useHasMarkets } from "@/lib/hooks";
import { useWallet } from "@/lib/wallet";
import { CONTRACT_ADDRESS, MARKET_ABI } from "@/lib/contract";

function formatKickoff(utc: string) {
  return new Date(utc).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function MatchRow({
  match, isOwner, onCreated,
}: { match: MatchInfo; isOwner: boolean; onCreated: () => void }) {
  const { walletClient } = useWallet();
  const create = useWrite(walletClient);

  useEffect(() => {
    if (create.isSuccess) onCreated();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [create.isSuccess]);

  const onCreate = () => create.write({
    address: CONTRACT_ADDRESS, abi: MARKET_ABI, functionName: "createMarket",
    args: [BigInt(match.id), match.team1, match.team2, BigInt(match.kickoff), BigInt(match.settledAfter)],
  });

  return (
    <div className="match-row">
      <div className="match-info">
        <p className="match-row-title">
          {match.team1} <span className="vs">vs</span> {match.team2}
        </p>
        <p className="muted-xs">{formatKickoff(match.utcDate)}</p>
      </div>

      {isOwner ? (
        <button onClick={onCreate} disabled={create.isBusy} className="btn btn-primary btn-sm match-action">
          {create.isBusy ? "Creating…" : "Create Market"}
        </button>
      ) : (
        <span className="muted-xs match-action">Owner only</span>
      )}

      {create.error && <p className="field-error match-error">{create.error}</p>}
    </div>
  );
}

function MatchSection({
  title, hint, matches, isOwner, onCreated,
}: {
  title: string; hint?: string; matches: MatchInfo[]; isOwner: boolean; onCreated: () => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="match-group">
      <div className="match-group-head">
        <h3 className="match-group-title">{title}</h3>
        {hint && <span className="muted-xs">{hint}</span>}
      </div>
      <div className="match-list">
        {matches.map((m) => (
          <MatchRow key={m.id} match={m} isOwner={isOwner} onCreated={onCreated} />
        ))}
      </div>
    </div>
  );
}

export function MatchMarkets({ onMarketCreated }: { onMarketCreated?: () => void }) {
  const { address } = useWallet();

  const { data: owner } = useRead<`0x${string}`>({
    address: CONTRACT_ADDRESS, abi: MARKET_ABI, functionName: "owner",
  });
  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase();

  const { upcoming, recent, isLoading, error } = useMatches(5, 3);

  // Filter out matches that already have a market — they show in the markets grid above.
  const allIds = [...recent, ...upcoming].map((m) => m.id);
  const { map: hasMarket, refetch: refetchHasMarkets } = useHasMarkets(allIds);

  const creatableRecent = recent.filter((m) => !hasMarket[m.id]);
  const creatableUpcoming = upcoming.filter((m) => !hasMarket[m.id]);

  const onCreated = () => { refetchHasMarkets(); onMarketCreated?.(); };

  const nothingToCreate =
    !isLoading && !error && creatableRecent.length === 0 && creatableUpcoming.length === 0;

  return (
    <section className="panel create-panel">
      <div className="create-head">
        <h2 className="section-title">Create Markets</h2>
        {!isOwner && <span className="muted-xs">Only the contract owner can create markets</span>}
      </div>

      {isLoading && <p className="muted">Loading matches…</p>}
      {error && <p className="alert-error">{error}</p>}
      {nothingToCreate && <p className="muted">All listed matches already have a market.</p>}

      <MatchSection
        title="Recent results — settle right away"
        hint="settledAfter is in the past"
        matches={creatableRecent}
        isOwner={isOwner}
        onCreated={onCreated}
      />
      <MatchSection
        title="Upcoming matches"
        matches={creatableUpcoming}
        isOwner={isOwner}
        onCreated={onCreated}
      />
    </section>
  );
}
