"use client";
import { useEffect, useState } from "react";
import type { FarcasterUser } from "@/hooks/useFarcaster";
import { DIFFICULTY_CONFIG, type Difficulty } from "@/lib/gameRules";
import UserPageHeader from "./UserPageHeader";

interface Entry {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  address?: string;
  games: number;
  wins: number;
  net: number;
  totalPrize: number;
  totalFees: number;
  lastPlayed: number;
}

export default function LeaderboardScreen({
  user,
  isAdmin,
  onBack,
  onRules,
}: {
  user: FarcasterUser;
  isAdmin: boolean;
  onBack: () => void;
  onRules: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Difficulty | "all">("all");

  useEffect(() => {
    let alive = true;
    const load = () => {
      const qs = filter === "all" ? "" : `?difficulty=${filter}`;
      fetch(`/api/leaderboard${qs}`)
        .then(r => r.json())
        .then(data => { if (alive) { setEntries(data); setLoading(false); } })
        .catch(() => { if (alive) setLoading(false); });
    };
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [filter]);
  const medals = ["🥇", "🥈", "🥉"];
  const shortAddr = (addr?: string) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";

  return (
    <div className="user-page-bg user-page-overlay min-h-dvh flex flex-col">
      <div className="mx-4 mt-4">
        <UserPageHeader
          user={user}
          isAdmin={isAdmin}
          showBack
          onBack={onBack}
          rulesHref="/?screen=rules"
          onRules={onRules}
          active="leaderboard"
        />
      </div>

      {/* Filter */}
      <div className="page-wrap mx-auto flex gap-2 px-4 mb-3">
        {(["all", "easy", "medium", "hard"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="page-chip flex-1 py-2 rounded-full text-xs font-bold transition-all"
            style={{
              background: filter === f ? "rgba(255, 222, 114, 0.94)" : "rgba(255, 248, 230, 0.08)",
              color: filter === f ? "#291400" : "#fff2cf",
            }}
          >
            {f === "all" ? "All" : DIFFICULTY_CONFIG[f].emoji + " " + DIFFICULTY_CONFIG[f].label}
          </button>
        ))}
      </div>

      <div className="page-wrap mx-auto flex-1 px-4 space-y-3 overflow-y-auto">
        {loading ? (
          <div className="page-panel rounded-[28px] text-center text-amber-100 py-10">
            <div className="text-3xl animate-bounce">🐝</div>
            <div className="text-sm mt-2">Loading...</div>
          </div>
        ) : entries.length === 0 ? (
          <div className="page-panel rounded-[28px] text-center text-amber-100 py-10">
            <div className="text-3xl">😔</div>
            <div className="text-sm mt-2">No scores yet.</div>
          </div>
        ) : (
          entries.map((entry, i) => {
            const net = entry.net;
            const netText = `${net >= 0 ? "+" : ""}${net.toFixed(3)} USDC`;
            const winRate = entry.games ? Math.round((entry.wins / entry.games) * 100) : 0;
            return (
              <div
                key={entry.fid}
                className="flex items-center gap-3 rounded-[24px] p-3 border"
                style={{
                  background: i === 0 ? "rgba(255, 214, 122, 0.13)" : "rgba(255, 248, 230, 0.08)",
                  borderColor: i === 0 ? "rgba(247,189,43,0.4)" : "rgba(255,214,122,0.12)",
                  boxShadow: i === 0 ? "0 16px 28px rgba(247,189,43,0.08)" : "none",
                }}
              >
                <div className="text-xl w-7 text-center font-black" style={{ color: "#aaa" }}>
                  {medals[i] || `${i + 1}`}
                </div>
                {entry.pfpUrl
                  ? <img src={entry.pfpUrl} alt="" className="w-10 h-10 rounded-full flex-shrink-0 ring-1 ring-amber-200/25" />
                  : <div className="w-10 h-10 rounded-full page-chip flex items-center justify-center">🐝</div>
                }
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm truncate">{entry.displayName}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-amber-200/85">
                    <span>@{entry.username}</span>
                    {entry.address && <span className="text-amber-100/55">{shortAddr(entry.address)}</span>}
                  </div>
                  <div className="mt-1 text-[11px] text-amber-100/55">
                    Games {entry.games} · Wins {entry.wins} ({winRate}%)
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-black ${net >= 0 ? "text-green-300" : "text-red-300"}`}>{netText}</div>
                  <div className="text-xs text-amber-100/55">{entry.totalPrize.toFixed(3)} in / {entry.totalFees.toFixed(3)} out</div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="h-6" />
    </div>
  );
}
