"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { stringToHex } from "viem";
import { useFarcaster } from "@/hooks/useFarcaster";

const ADMIN_WALLET = (
  process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe"
).toLowerCase();

type WeeklyState = {
  weekId?: string;
  potBf?: number;
  tickets?: Record<string, number>;
  pendingTickets?: Record<string, number>;
  lastPayoutAt?: number;
  payoutAt?: number;
  snapshotAt?: number;
};
type WeeklyConfig = {
  autoPayoutEnabled: boolean;
  forceBypassSchedule: boolean;
  autoClaimPendingTickets: boolean;
};
type PayoutLog = {
  at?: number;
  potBf?: number;
  force?: boolean;
  mode?: string;
  status?: string;
  failedCount?: number;
  results?: unknown[];
  top3?: string[];
  lotteryWinners?: string[];
};
type AdminStats = {
  players: Array<{ address?: string; username: string; displayName: string; pfpUrl: string; games: number; wins: number; losses: number; winRate: number; totalFees: number; totalPrize: number; net: number; gamesByDifficulty: Record<string, number> }>;
  totalGames: number;
};

type Msg = { type: "ok" | "err"; text: string } | null;

export default function AdminWeekly() {
  const { user } = useFarcaster();
  const address = user?.address?.toLowerCase() || "";
  const authorized = address === ADMIN_WALLET;

  const [weekly, setWeekly] = useState<WeeklyState | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [cfg, setCfg] = useState<WeeklyConfig | null>(null);
  const [logs, setLogs] = useState<PayoutLog[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [resetting, setResetting] = useState(false);

  const hdrs = useCallback(
    () => ({ "Content-Type": "application/json", "x-admin-wallet": address }),
    [address]
  );

  const refresh = useCallback(async () => {
    const [w, cfgRes, lbRes] = await Promise.all([
      fetch("/api/weekly").then((r) => r.json()),
      fetch("/api/admin/weekly-config", { headers: hdrs() }).then((r) => r.json()),
      fetch("/api/admin/leaderboard", { headers: hdrs() }).then((r) => r.json()),
    ]);
    setWeekly(w);
    setCfg(cfgRes.config);
    setLogs(Array.isArray(cfgRes.logs) ? cfgRes.logs : []);
    setStats(lbRes.stats);
  }, [hdrs]);

  useEffect(() => {
    if (authorized) refresh();
  }, [authorized, refresh]);

  if (!authorized)
    return (
      <Unauth />
    );

  // ─── helpers ────────────────────────────────────────────────────────────────

  async function act(label: string, fn: () => Promise<Response>) {
    setRunning(label);
    setMsg(null);
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ type: "err", text: data?.error || "Failed" });
      else setMsg({ type: "ok", text: `${label} completato ✓` });
      await refresh();
    } catch (e) {
      setMsg({ type: "err", text: String(e) });
    }
    setRunning(null);
  }

  async function payout(force: boolean) {
    await act(force ? "Force Payout" : "Run Payout", () =>
      fetch("/api/admin/weekly-payout", {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({
          force,
          mode: "manual",
          autoClaimPendingTickets: cfg?.autoClaimPendingTickets ?? true,
        }),
      })
    );
  }

  async function resetWeeklyState() {
    if (!confirm("Reset weekly state? Azzera pot counter, ticket e storico wins.")) return;
    await act("Reset Weekly", () =>
      fetch("/api/admin/leaderboard", {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ action: "weekly_reset" }),
      })
    );
  }

  async function resetLeaderboard() {
    setResetting(true);
    setMsg({ type: "ok", text: "Firma richiesta…" });
    try {
      const challengeRes = await fetch("/api/admin/auth/challenge", {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ action: "reset_leaderboard", address }),
      });
      const { message, token: challenge } = await challengeRes.json();
      const sig = await sdk.wallet.ethProvider.request({
        method: "personal_sign",
        params: [stringToHex(message), address as `0x${string}`],
      });
      const res = await fetch("/api/admin/leaderboard", {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ action: "reset", challenge, message, signature: String(sig) }),
      });
      if (res.ok) {
        setMsg({ type: "ok", text: "Leaderboard resettata ✓" });
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: d?.error || "Reset failed" });
      }
    } catch {
      setMsg({ type: "err", text: "Firma annullata o errore" });
    }
    setResetting(false);
  }

  async function updateCfg(partial: Partial<WeeklyConfig>) {
    setSavingCfg(true);
    const res = await fetch("/api/admin/weekly-config", {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify(partial),
    });
    const data = await res.json().catch(() => ({}));
    if (data.config) setCfg(data.config);
    setSavingCfg(false);
  }

  const totalTickets = Object.values(weekly?.tickets || {}).reduce((s, v) => s + v, 0);
  const totalPending = Object.values(weekly?.pendingTickets || {}).reduce((s, v) => s + v, 0);
  const uniqueHolders = Object.keys(weekly?.tickets || {}).length;
  const potBf = Number(weekly?.potBf || 0);

  const BTN =
    "w-full py-4 rounded-2xl text-base font-black text-black disabled:opacity-40 transition-all active:scale-95 shadow-lg";

  return (
    <div className="min-h-dvh p-5" style={{ background: "#1a0a00" }}>
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <Link href="/admin" className="text-amber-400 font-bold">
            ← Admin
          </Link>
          <h1 className="text-2xl font-black text-white flex-1">🏆 Weekly Pot</h1>
        </div>

        {/* Messaggio */}
        {msg && (
          <div
            className={`rounded-2xl p-4 text-sm font-bold ${
              msg.type === "ok"
                ? "bg-green-950 text-green-300 border border-green-800"
                : "bg-red-950 text-red-300 border border-red-800"
            }`}
          >
            {msg.type === "ok" ? "✅ " : "❌ "}
            {msg.text}
          </div>
        )}

        {/* Stato corrente */}
        <Card title="Stato settimana corrente">
          <Row label="Week ID" value={weekly?.weekId || "—"} />
          <Row
            label="Pot accumulato"
            value={`${Math.round(potBf).toLocaleString()} BF`}
            big
          />
          <Row
            label="Ticket holders"
            value={`${uniqueHolders} wallet · ${totalTickets.toLocaleString()} ticket`}
          />
          <Row label="Ticket in pending" value={totalPending.toLocaleString()} />
          <Row
            label="Snapshot at"
            value={
              weekly?.snapshotAt
                ? new Date(weekly.snapshotAt).toLocaleString("it-IT", {
                    timeZone: "Europe/Rome",
                  })
                : "—"
            }
          />
          <Row
            label="Payout programmato"
            value={
              weekly?.payoutAt
                ? new Date(weekly.payoutAt).toLocaleString("it-IT", {
                    timeZone: "Europe/Rome",
                  })
                : "—"
            }
          />
          <Row
            label="Ultimo payout"
            value={
              weekly?.lastPayoutAt
                ? new Date(weekly.lastPayoutAt).toLocaleString("it-IT", {
                    timeZone: "Europe/Rome",
                  })
                : "mai"
            }
          />
        </Card>

        {/* Distribuzione preview */}
        <Card title="Distribuzione pot attuale">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-amber-200">
              <span>🥇 1° posto (30%)</span>
              <span className="font-bold">
                {Math.round(potBf * 0.6 * 0.5).toLocaleString()} BF
              </span>
            </div>
            <div className="flex justify-between text-amber-200">
              <span>🥈 2° posto (18%)</span>
              <span className="font-bold">
                {Math.round(potBf * 0.6 * 0.3).toLocaleString()} BF
              </span>
            </div>
            <div className="flex justify-between text-amber-200">
              <span>🥉 3° posto (12%)</span>
              <span className="font-bold">
                {Math.round(potBf * 0.6 * 0.2).toLocaleString()} BF
              </span>
            </div>
            <div className="border-t border-amber-900 pt-2 flex justify-between text-amber-400 text-xs">
              <span>🎰 7 vincitori lottery (40%)</span>
              <span>≈ {Math.round((potBf * 0.4) / 7).toLocaleString()} BF cad.</span>
            </div>
          </div>
        </Card>

        {/* Top 3 preview */}
        {stats && stats.players.length > 0 && (
          <Card title="Top 3 attuali (candidati payout)">
            {stats.players
              .filter((p) => p.address)
              .slice(0, 3)
              .map((p, i) => (
                <div key={p.address} className="flex items-center gap-3 py-1">
                  <span className="text-xl">{["🥇", "🥈", "🥉"][i]}</span>
                  {p.pfpUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.pfpUrl} alt="" className="w-7 h-7 rounded-full" />
                  )}
                  <span className="text-amber-200 text-sm flex-1 truncate">
                    {p.displayName}
                    <span className="text-amber-600 ml-1">@{p.username}</span>
                  </span>
                  <span className="text-amber-400 text-xs">
                    {p.wins}W · {p.net.toFixed(2)} USDC
                  </span>
                </div>
              ))}
          </Card>
        )}

        {/* Azioni payout */}
        <Card title="Azioni payout">
          <div className="space-y-3">
            <button
              disabled={!!running}
              onClick={() => payout(false)}
              className={BTN}
              style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)" }}
            >
              {running === "Run Payout" ? "⏳ In corso…" : "▶️  Run Payout (schedule)"}
            </button>
            <button
              disabled={!!running}
              onClick={() => payout(true)}
              className={BTN}
              style={{ background: "linear-gradient(135deg,#ef4444,#f97316)" }}
            >
              {running === "Force Payout" ? "⏳ In corso…" : "⚡ Force Payout (ignora schedule)"}
            </button>
          </div>
        </Card>

        {/* Azioni reset */}
        <Card title="Reset">
          <div className="space-y-3">
            <button
              disabled={!!running}
              onClick={resetWeeklyState}
              className={BTN}
              style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}
            >
              {running === "Reset Weekly" ? "⏳…" : "🔄  Reset Weekly State"}
            </button>
            <button
              disabled={resetting}
              onClick={resetLeaderboard}
              className={BTN}
              style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}
            >
              {resetting ? "⏳ Firma…" : "🗑️  Reset Leaderboard (firma richiesta)"}
            </button>
          </div>
          <p className="text-amber-800 text-xs mt-2">
            Reset Weekly azzera ticket e pot counter. Reset Leaderboard svuota tutte le partite.
          </p>
        </Card>

        {/* Config */}
        {cfg && (
          <Card title="Configurazione auto-payout">
            {[
              {
                key: "autoPayoutEnabled" as const,
                label: "Auto payout domenicale abilitato",
                desc: "Il cron ogni domenica 00:00 CET eseguirà il payout automaticamente",
              },
              {
                key: "forceBypassSchedule" as const,
                label: "Forza bypass schedule",
                desc: "In modalità auto, ignora il controllo dell'orario",
              },
              {
                key: "autoClaimPendingTickets" as const,
                label: "Auto-claim ticket pending",
                desc: "Sposta i pending tickets nei claimed prima dell'estrazione",
              },
            ].map(({ key, label, desc }) => (
              <label key={key} className="flex items-start justify-between gap-3 py-2 cursor-pointer">
                <div>
                  <div className="text-amber-200 text-sm font-bold">{label}</div>
                  <div className="text-amber-700 text-xs">{desc}</div>
                </div>
                <div className="relative shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={cfg[key]}
                    disabled={savingCfg}
                    onChange={(e) => updateCfg({ [key]: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-amber-900 rounded-full peer-checked:bg-purple-600 transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                </div>
              </label>
            ))}
          </Card>
        )}

        {/* Log recenti */}
        {logs.length > 0 && (
          <Card title="Ultimi payout eseguiti">
            <div className="space-y-3">
              {logs.slice(0, 5).map((l, i) => (
                <div
                  key={i}
                  className="border-b border-amber-950 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-amber-200 text-sm font-bold">
                      {l.at
                        ? new Date(l.at).toLocaleString("it-IT", {
                            timeZone: "Europe/Rome",
                          })
                        : "—"}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        l.status === "paid"
                          ? "bg-green-900 text-green-300"
                          : "bg-red-900 text-red-300"
                      }`}
                    >
                      {l.status === "paid" ? "✅ paid" : `⚠️ ${l.status}`}
                    </span>
                  </div>
                  <div className="text-amber-600 text-xs mt-1">
                    {Math.round(Number(l.potBf || 0)).toLocaleString()} BF ·{" "}
                    {Array.isArray(l.results) ? l.results.length : 0} tx
                    {l.force ? " · forced" : " · scheduled"}
                    {l.mode ? ` · ${l.mode}` : ""}
                    {l.failedCount ? ` · ⚠️ ${l.failedCount} failed` : ""}
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/admin/payouts"
              className="block mt-3 text-center text-xs text-amber-500 underline"
            >
              Vedi storico completo →
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-amber-900 p-4 space-y-2"
      style={{ background: "#140a00" }}
    >
      <div className="text-amber-400 text-xs uppercase tracking-widest mb-3">{title}</div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-amber-600 text-sm">{label}</span>
      <span
        className={`font-bold text-right ${
          big ? "text-amber-300 text-lg" : "text-amber-200 text-sm"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Unauth() {
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center p-6 text-center"
      style={{ background: "#1a0a00" }}
    >
      <div className="text-6xl mb-4">🔒</div>
      <p className="text-red-400 text-lg font-bold">Unauthorized</p>
      <Link href="/admin" className="mt-4 text-amber-400 underline">
        ← Admin
      </Link>
    </div>
  );
}
