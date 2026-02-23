"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

type WeeklyConfig = {
  autoPayoutEnabled: boolean;
  forceBypassSchedule: boolean;
  autoClaimPendingTickets: boolean;
};

export default function AdminPage() {
  const { user, connectWallet } = useFarcaster();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [weekly, setWeekly] = useState<any | null>(null);
  const [weeklyConfig, setWeeklyConfig] = useState<WeeklyConfig | null>(null);
  const [payoutLogs, setPayoutLogs] = useState<Array<{ at?: number; potBf?: number; force?: boolean; results?: Array<{ txHash: string }> }>>([]);
  const [payoutRunning, setPayoutRunning] = useState(false);
  const [runningAction, setRunningAction] = useState<"payout" | "force" | "auto" | "resetWeekly" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [savingWeeklyConfig, setSavingWeeklyConfig] = useState(false);

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

  useEffect(() => {
    if (!authorized) return;
    fetch("/api/admin/weekly-config", {
      headers: { "x-admin-wallet": address },
    })
      .then(r => r.json())
      .then(d => {
        setWeeklyConfig(d.config || null);
        setPayoutLogs(Array.isArray(d.logs) ? d.logs : []);
      })
      .catch(() => {});
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
    setInfo("Reset weekly in corso...");
    setRunningAction("resetWeekly");
    const res = await fetch("/api/admin/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-wallet": address },
      body: JSON.stringify({ action: "weekly_reset" }),
    });
    if (res.ok) {
      setWeekly(null);
      setError(null);
      setInfo("Weekly reset completato");
    } else {
      setError("Weekly reset failed");
      setInfo(null);
    }
    setRunningAction(null);
  }

  async function handleWeeklyPayout(force = false, mode: "manual" | "auto" = "manual") {
    if (!authorized) return;
    setInfo(`Avvio payout ${force ? "FORCE" : "standard"}...`);
    setRunningAction(mode === "auto" ? "auto" : force ? "force" : "payout");
    setPayoutRunning(true);
    const res = await fetch("/api/admin/weekly-payout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-wallet": address },
      body: JSON.stringify({
        force,
        mode,
        autoClaimPendingTickets: weeklyConfig?.autoClaimPendingTickets ?? true,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Weekly payout failed");
      setInfo(null);
    } else {
      setError(null);
      const data = await res.json();
      setWeekly({ potBf: 0, ...data });
      setInfo(`Payout OK · tx: ${Array.isArray(data?.results) ? data.results.length : 0}`);
      fetch("/api/admin/weekly-config", {
        headers: { "x-admin-wallet": address },
      })
        .then(r => r.json())
        .then(d => {
          setWeeklyConfig(d.config || null);
          setPayoutLogs(Array.isArray(d.logs) ? d.logs : []);
        })
        .catch(() => {});
    }
    setPayoutRunning(false);
    setRunningAction(null);
  }

  async function updateWeeklyConfig(next: Partial<WeeklyConfig>) {
    if (!authorized) return;
    setSavingWeeklyConfig(true);
    const res = await fetch("/api/admin/weekly-config", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-wallet": address },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      setError("Failed to save weekly config");
    } else {
      const data = await res.json();
      setWeeklyConfig(data.config || null);
      setError(null);
    }
    setSavingWeeklyConfig(false);
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
        {info && <div className="text-green-400 text-sm">{info}</div>}

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
                  <Link
                    href="/admin/payouts"
                    className="px-3 py-1 rounded-md text-xs font-black text-black"
                    style={{ background: "linear-gradient(135deg, #38bdf8, #22d3ee)" }}
                  >
                    Payout Report
                  </Link>
                  <button
                    type="button"
                    onPointerDown={() => setInfo("Run Payout cliccato")}
                    onClick={() => handleWeeklyPayout(false, "manual")}
                    disabled={payoutRunning}
                    className="px-3 py-1 rounded-md text-xs font-black text-black disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
                  >
                    {runningAction === "payout" ? "Paying..." : "Run Payout"}
                  </button>
                  <button
                    type="button"
                    onPointerDown={() => setInfo("Force Payout cliccato")}
                    onClick={() => handleWeeklyPayout(true, "manual")}
                    disabled={payoutRunning}
                    className="px-3 py-1 rounded-md text-xs font-black text-black disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #ef4444, #f97316)" }}
                  >
                    {runningAction === "force" ? "Paying..." : "Force Payout"}
                  </button>
                  <button
                    type="button"
                    onPointerDown={() => setInfo("Run Auto cliccato")}
                    onClick={() => handleWeeklyPayout(true, "auto")}
                    disabled={payoutRunning || !weeklyConfig?.autoPayoutEnabled}
                    className="px-3 py-1 rounded-md text-xs font-black text-black disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #10b981, #22c55e)" }}
                  >
                    {runningAction === "auto" ? "Paying..." : "Run Auto"}
                  </button>
                  <button
                    type="button"
                    onPointerDown={() => setInfo("Reset Weekly cliccato")}
                    onClick={handleWeeklyReset}
                    disabled={runningAction === "resetWeekly"}
                    className="px-3 py-1 rounded-md text-xs font-black text-black"
                    style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
                  >
                    {runningAction === "resetWeekly" ? "Reset..." : "Reset Weekly"}
                  </button>
                </div>
              </div>
              <div className="text-amber-200 text-sm">
                Pot: {weekly ? Math.round(weekly.potBf || 0).toLocaleString() : 0} BF
              </div>
              <div className="text-amber-700 text-xs mt-2">
                Leaderboard entries: {stats?.totalGames ?? 0}
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <label className="flex items-center justify-between gap-3 text-amber-200">
                  <span>Auto payout enabled</span>
                  <input
                    type="checkbox"
                    checked={weeklyConfig?.autoPayoutEnabled ?? false}
                    onChange={(e) => updateWeeklyConfig({ autoPayoutEnabled: e.target.checked })}
                    disabled={savingWeeklyConfig}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-amber-200">
                  <span>Bypass schedule in auto mode</span>
                  <input
                    type="checkbox"
                    checked={weeklyConfig?.forceBypassSchedule ?? true}
                    onChange={(e) => updateWeeklyConfig({ forceBypassSchedule: e.target.checked })}
                    disabled={savingWeeklyConfig}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-amber-200">
                  <span>Auto-claim pending tickets</span>
                  <input
                    type="checkbox"
                    checked={weeklyConfig?.autoClaimPendingTickets ?? true}
                    onChange={(e) => updateWeeklyConfig({ autoClaimPendingTickets: e.target.checked })}
                    disabled={savingWeeklyConfig}
                  />
                </label>
              </div>
              {payoutLogs.length > 0 && (
                <div className="mt-3 pt-2 border-t border-amber-900">
                  <div className="text-amber-400 text-xs uppercase tracking-widest mb-1">Recent Payouts</div>
                  {payoutLogs.slice(0, 3).map((log, i) => (
                    <div key={i} className="text-amber-200 text-xs">
                      {log.at ? new Date(log.at).toLocaleString("en-GB", { timeZone: "Europe/Rome" }) : "n/a"} ·
                      pot {Math.round(Number(log.potBf || 0)).toLocaleString()} BF ·
                      tx {Array.isArray(log.results) ? log.results.length : 0} ·
                      {log.force ? " forced" : " scheduled"}
                    </div>
                  ))}
                </div>
              )}
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
