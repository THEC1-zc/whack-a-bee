"use client";
import { useEffect, useState } from "react";
import { DIFFICULTY_CONFIG, type Difficulty } from "./App";

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

export default function LeaderboardScreen({ onBack }: { onBack: () => void }) {
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
    <div className="min-h-dvh flex flex-col" style={{ background: "#1a0a00" }}>

      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button onClick={onBack} className="text-amber-400 font-bold text-sm">← Back</button>
        <h2 className="text-xl font-black text-white flex-1 text-center">🏆 Leaderboard</h2>
        <div className="w-12" />
      </div>

      {/* Filter */}
      <div className="flex gap-2 px-4 mb-3">
        {(["all", "easy", "medium", "hard"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all"
            style={{
              background: filter === f ? "#fbbf24" : "#1a0a00",
              color: filter === f ? "#000" : "#888",
              borderColor: filter === f ? "#fbbf24" : "#3d1a00",
            }}
          >
            {f === "all" ? "All" : DIFFICULTY_CONFIG[f].emoji + " " + DIFFICULTY_CONFIG[f].label}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 space-y-2 overflow-y-auto">
        {loading ? (
          <div className="text-center text-amber-600 py-10">
            <div className="text-3xl animate-bounce">🐝</div>
            <div className="text-sm mt-2">Loading...</div>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center text-amber-700 py-10">
            <div className="text-3xl">😔</div>
            <div className="text-sm mt-2">No scores yet.</div>
          </div>
        ) : (
          entries.map((entry, i) => {
            const net = entry.net;
            const netText = `${net >= 0 ? "+" : ""}${net.toFixed(3)} USDC`;
            const winRate = entry.games ? Math.round((entry.wins / entry.games) * 100) : 0;
            return (
              <div key={entry.fid} className="flex items-center gap-3 rounded-xl p-3 border"
                style={{ background: i === 0 ? "#3d2a00" : "#1f1000", borderColor: i === 0 ? "#f59e0b" : "#3d1a00" }}>
                <div className="text-xl w-7 text-center font-black" style={{ color: "#aaa" }}>
                  {medals[i] || `${i + 1}`}
                </div>
                {entry.pfpUrl
                  ? <img src={entry.pfpUrl} alt="" className="w-9 h-9 rounded-full flex-shrink-0" />
                  : <div className="w-9 h-9 rounded-full bg-amber-900 flex items-center justify-center">🐝</div>
                }
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm truncate">{entry.displayName}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-amber-500">
                    <span>@{entry.username}</span>
                    {entry.address && <span className="text-amber-700">{shortAddr(entry.address)}</span>}
                  </div>
                  <div className="mt-1 text-[11px] text-amber-700">
                    Games {entry.games} · Wins {entry.wins} ({winRate}%)
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-black ${net >= 0 ? "text-green-400" : "text-red-400"}`}>{netText}</div>
                  <div className="text-xs text-amber-600">{entry.totalPrize.toFixed(3)} in / {entry.totalFees.toFixed(3)} out</div>
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
