import { useEffect, useState } from "react";

// Settlement can be requested once the match should be finished: kickoff + this many
// seconds. 3h covers 90' + halftime + stoppage, plus extra time / penalties for knockout
// games and a margin for the result feed to update. Bump to 4h if knockout settles too early.
const MATCH_DURATION = 3 * 60 * 60; // 10800s

export interface MatchInfo {
  id: number;
  team1: string;
  team2: string;
  utcDate: string;
  status: string; // raw football-data.org status (TIMED, FINISHED, …)
  kickoff: number; // unix seconds — match start; betting closes here
  settledAfter: number; // unix seconds — match finish (kickoff + MATCH_DURATION); settle opens here
}

interface RawTeam { name?: string; shortName?: string }
interface RawMatch {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: RawTeam;
  awayTeam: RawTeam;
}

const teamName = (t: RawTeam) => t?.name ?? t?.shortName ?? "TBD";

function toMatchInfo(m: RawMatch): MatchInfo {
  const kickoff = Math.floor(new Date(m.utcDate).getTime() / 1000);
  return {
    id: m.id,
    team1: teamName(m.homeTeam),
    team2: teamName(m.awayTeam),
    utcDate: m.utcDate,
    status: m.status,
    kickoff,
    settledAfter: kickoff + MATCH_DURATION,
  };
}

export interface MatchLists {
  upcoming: MatchInfo[]; // future kickoffs — normal markets
  recent: MatchInfo[];   // finished matches — settledAfter already in the past (settlement testing)
}

/**
 * Fetch World Cup matches via the dev proxy (/api/football → football-data.org, which injects
 * the X-Auth-Token header from FOOTBALL_API_KEY) and split into upcoming and recent-finished.
 */
export async function fetchMatches(upcomingLimit = 5, recentLimit = 3): Promise<MatchLists> {
  const res = await fetch("/api/football/competitions/WC/matches");
  if (!res.ok) {
    throw new Error(
      `football-data.org returned ${res.status}. Is FOOTBALL_API_KEY set in .env?`
    );
  }
  const data = (await res.json()) as { matches?: RawMatch[] };
  const all = (data.matches ?? []).map(toMatchInfo);
  const now = Date.now();
  const ts = (m: MatchInfo) => new Date(m.utcDate).getTime();

  const upcoming = all
    .filter((m) => ts(m) > now && m.status !== "CANCELLED")
    .sort((a, b) => ts(a) - ts(b))
    .slice(0, upcomingLimit);

  const recent = all
    .filter((m) => m.status === "FINISHED")
    .sort((a, b) => ts(b) - ts(a))
    .slice(0, recentLimit);

  return { upcoming, recent };
}

export function useMatches(upcomingLimit = 5, recentLimit = 3) {
  const [data, setData] = useState<MatchLists>({ upcoming: [], recent: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    fetchMatches(upcomingLimit, recentLimit)
      .then((m) => { if (active) { setData(m); setError(null); } })
      .catch((e) => { if (active) setError((e as Error).message); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [upcomingLimit, recentLimit]);

  return { ...data, isLoading, error };
}
