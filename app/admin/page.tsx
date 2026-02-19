"use client";
import { useEffect, useMemo, useState } from "react";
import { useFarcaster } from "@/hooks/useFarcaster";

const ADMIN_WALLET = (process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe").toLowerCase();

type AdminStats = {
  totalGames: number;
  uniquePlayers: number;
  totalFees: number;
  totalPrizes: number;
  gamesByDifficulty: Record<string, number>;
  players: Array<{
    fid: number;
    username: string;
    displayName: string;
    pfpUrl: string;
    address?: string;
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    totalFees: number;
    totalPrize: number;
    net: number;
    gamesByDifficulty: Record<string, number>;
  }>;
};

export default function AdminPage() {
  const { user, connectWallet } = useFarcaster();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [weekly, setWeekly] = useState<any | null>(null);
  const [payoutRunning, setPayoutRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const address = user?.address?.toLowerCase() || "";
  const authorized = address === ADMIN_WALLET;

  useEffect(() => {
    if (!authorized) return;
    setLoading(true);
    fetch("/api/admin/leaderboard", {
      headers: { "x-admin-wallet": address },
    })
      .then(r => r.json())
      .then(d => { setStats(d.stats); setWeekly(d.weekly); setError(null); })
      .catch(() => setError("Failed to load stats"))
      .finally(() => setLoading(false));
  }, [authorized, address]);

  const totals = useMemo(() => {
    if (!stats) return null;
    return {
      totalGames: stats.totalGames,
      uniquePlayers: stats.uniquePlayers,
      totalFees: stats.totalFees.toFixed(3),
      totalPrizes: stats.totalPrizes.toFixed(3),
    };
  }, [stats]);

  async function handleReset() {
    if (!authorized) return;
    if (!confirm("Reset leaderboard? This will delete all game history.")) return;
    setResetting(true);
    const res = await fetch("/api/admin/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-wallet": address },
      body: JSON.stringify({ action: "reset" }),
    });
    if (res.ok) {
      setStats(null);
    } else {
      setError("Reset failed");
    }
    setResetting(false);
  }

  async function handleWeeklyReset() {
    if (!authorized) return;
    if (!confirm("Reset weekly pot & tickets?")) return;
    const res = await fetch("/api/admin/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-wallet": address },
      body: JSON.stringify({ action: "weekly_reset" }),
    });
    if (res.ok) {
      setWeekly(null);
    } else {
      setError("Weekly reset failed");
    }
  }

  async function handleWeeklyPayout() {
    if (!authorized) return;
    if (!confirm("Run weekly payout now?")) return;
    setPayoutRunning(true);
    const res = await fetch("/api/admin/weekly-payout", {
      method: "POST",
      headers: { "x-admin-wallet": address },
    });
    if (!res.ok) {
      setError("Weekly payout failed");
    } else {
      setError(null);
      const data = await res.json();
      setWeekly({ potBf: 0, ...data });
    }
    setPayoutRunning(false);
  }

  if (!user?.address) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center" style={{ background: "#1a0a00" }}>
        <h1 className="text-2xl font-black text-white mb-3">Admin</h1>
        <p className="text-amber-500 text-sm mb-4">Connect your wallet to continue.</p>
        <button
          onClick={connectWallet}
          className="px-5 py-3 rounded-xl font-black text-black"
          style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center" style={{ background: "#1a0a00" }}>
        <h1 className="text-2xl font-black text-white mb-2">Admin</h1>
        <p className="text-red-400 text-sm">Unauthorized wallet.</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh p-5" style={{ background: "#1a0a00" }}>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-amber-400 font-bold text-sm">← Back</a>
            <h1 className="text-2xl font-black text-white">Admin Stats</h1>
          </div>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="px-4 py-2 rounded-lg text-sm font-black text-black disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
          >
            {resetting ? "Resetting..." : "Reset Leaderboard"}
          </button>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}

        {!stats || loading ? (
          <div className="text-amber-500 text-sm">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total games" value={String(totals?.totalGames)} />
              <Stat label="Unique players" value={String(totals?.uniquePlayers)} />
              <Stat label="Total spent (USDC)" value={totals?.totalFees || "0"} />
              <Stat label="Total prizes (USDC)" value={totals?.totalPrizes || "0"} />
            </div>

            <div className="rounded-xl border border-amber-900 p-3" style={{ background: "#140a00" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-amber-400 text-xs uppercase tracking-widest">Weekly Pot</div>
                <div className="flex gap-2">
                  <button
                    onClick={handleWeeklyPayout}
                    disabled={payoutRunning}
                    className="px-3 py-1 rounded-md text-xs font-black text-black disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
                  >
                    {payoutRunning ? "Paying..." : "Run Payout"}
                  </button>
                  <button
                    onClick={handleWeeklyReset}
                    className="px-3 py-1 rounded-md text-xs font-black text-black"
                    style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
                  >
                    Reset Weekly
                  </button>
                </div>
              </div>
              <div className="text-amber-200 text-sm">
                Pot: {weekly ? Math.round(weekly.potBf || 0).toLocaleString() : 0} BF
              </div>
            </div>

            <div className="rounded-xl border border-amber-900 p-3" style={{ background: "#140a00" }}>
              <div className="text-amber-400 text-xs uppercase tracking-widest mb-2">Games by difficulty</div>
              <div className="text-amber-200 text-sm">
                {Object.entries(stats.gamesByDifficulty).map(([k, v]) => (
                  <span key={k} className="mr-3">{k}: {v}</span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {stats.players.map(p => (
                <div key={p.fid} className="rounded-xl border border-amber-900 p-3" style={{ background: "#140a00" }}>
                  <div className="flex items-center gap-3">
                    {p.pfpUrl ? <img src={p.pfpUrl} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-amber-900" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-bold text-sm truncate">{p.displayName} <span className="text-amber-400">@{p.username}</span></div>
                      <div className="text-amber-700 text-xs">Games {p.games} · W/L {p.wins}/{p.losses} · {p.winRate}%</div>
                      <div className="text-amber-700 text-xs">
                        Easy {p.gamesByDifficulty.easy || 0} · Medium {p.gamesByDifficulty.medium || 0} · Hard {p.gamesByDifficulty.hard || 0}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-amber-300 text-sm">Spent {p.totalFees.toFixed(3)}</div>
                      <div className="text-green-400 text-sm">Won {p.totalPrize.toFixed(3)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-amber-900 p-3 text-center" style={{ background: "#140a00" }}>
      <div className="text-amber-500 text-xs uppercase tracking-widest">{label}</div>
      <div className="text-white text-xl font-black mt-1">{value}</div>
    </div>
  );
}
