"use client";
import { useEffect, useState } from "react";

interface Entry {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  score: number;
  timestamp: number;
}

export default function LeaderboardScreen({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then(r => r.json())
      .then(data => { setEntries(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "#1a0a00" }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button onClick={onBack} className="text-amber-400 font-bold text-sm">← Back</button>
        <h2 className="text-xl font-black text-white flex-1 text-center">🏆 Leaderboard</h2>
        <div className="w-12" />
      </div>

      {/* Prize Pool info */}
      <div className="mx-4 mb-4 rounded-2xl p-3 text-center border border-amber-800"
        style={{ background: "#2a1500" }}>
        <div className="text-xs text-amber-600 uppercase tracking-widest">Prize Pool attuale</div>
        <div className="text-2xl font-black text-amber-400">0.05 ETH</div>
        <div className="text-xs text-amber-700 mt-1">Fai 50+ punti per vincere</div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 space-y-2 overflow-y-auto">
        {loading ? (
          <div className="text-center text-amber-600 py-10">
            <div className="text-3xl animate-bounce">🐝</div>
            <div className="text-sm mt-2">Caricamento...</div>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center text-amber-700 py-10">
            <div className="text-3xl">😔</div>
            <div className="text-sm mt-2">Nessun punteggio ancora.<br />Sii il primo a giocare!</div>
          </div>
        ) : (
          entries.map((entry, i) => (
            <div
              key={entry.fid}
              className="flex items-center gap-3 rounded-xl p-3 border"
              style={{
                background: i === 0 ? "#3d2a00" : "#1f1000",
                borderColor: i === 0 ? "#f59e0b" : "#3d1a00",
              }}
            >
              <div className="text-2xl w-8 text-center">
                {medals[i] || <span className="text-amber-700 font-bold text-sm">#{i + 1}</span>}
              </div>

              {entry.pfpUrl ? (
                <img src={entry.pfpUrl} alt={entry.username} className="w-9 h-9 rounded-full" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-amber-900 flex items-center justify-center text-lg">🐝</div>
              )}

              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-sm truncate">{entry.displayName}</div>
                <div className="text-amber-600 text-xs">@{entry.username}</div>
              </div>

              <div className="text-right">
                <div className="text-amber-400 font-black text-lg">{entry.score}</div>
                <div className="text-amber-700 text-xs">pt</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="h-6" />
    </div>
  );
}
