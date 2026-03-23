"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useFarcaster } from "@/hooks/useFarcaster";
import { adminFetch, signAdminAction } from "@/lib/adminClient";
import UserPageHeader from "@/components/UserPageHeader";

const ADMIN_WALLET = (
  process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe"
).toLowerCase();

type WeeklyState = {
  weekId?: string;
  potBf?: number;
  tickets?: Record<string, number>;
  pendingTickets?: Record<string, number>;
  lastPayoutAt?: number;
  snapshotAt?: number;
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
  const [weeklyStats, setWeeklyStats] = useState<AdminStats | null>(null);
  const [logs, setLogs] = useState<PayoutLog[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    void (async () => {
      const [w, payoutsRes, lbRes] = await Promise.all([
        fetch("/api/weekly").then((r) => r.json()),
        adminFetch(address, "/api/admin/weekly-payouts?limit=10").then((r) => r.json()),
        adminFetch(address, "/api/admin/leaderboard").then((r) => r.json()),
      ]);
      if (cancelled) return;
      setWeekly(w);
      setLogs(Array.isArray(payoutsRes.logs) ? payoutsRes.logs : []);
      setWeeklyStats(lbRes.weeklyStats);
    })().catch((error) => {
      if (!cancelled) setMsg({ type: "err", text: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      cancelled = true;
    };
  }, [address, authorized]);

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
      const [w, payoutsRes, lbRes] = await Promise.all([
        fetch("/api/weekly").then((r) => r.json()),
        adminFetch(address, "/api/admin/weekly-payouts?limit=10").then((r) => r.json()),
        adminFetch(address, "/api/admin/leaderboard").then((r) => r.json()),
      ]);
      setWeekly(w);
      setLogs(Array.isArray(payoutsRes.logs) ? payoutsRes.logs : []);
      setWeeklyStats(lbRes.weeklyStats);
    } catch (e) {
      setMsg({ type: "err", text: String(e) });
    }
    setRunning(null);
  }

  async function payout() {
    const signed = await signAdminAction(address, "weekly_payout");
    await act("Run Payout", () =>
      adminFetch(address, "/api/admin/weekly-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutChallenge: signed.challenge,
          payoutMessage: signed.message,
          payoutSignature: signed.signature,
        }),
      })
    );
  }

  const totalTickets = Object.values(weekly?.tickets || {}).reduce((s, v) => s + v, 0);
  const totalPending = Object.values(weekly?.pendingTickets || {}).reduce((s, v) => s + v, 0);
  const uniqueHolders = Object.keys(weekly?.tickets || {}).length;
  const potBf = Number(weekly?.potBf || 0);

  const BTN =
    "w-full py-4 rounded-2xl text-base font-black text-black disabled:opacity-40 transition-all active:scale-95 shadow-lg";

  return (
    <div className="user-page-bg user-page-overlay min-h-dvh p-5">
      <div className="max-w-lg mx-auto space-y-4">
        <UserPageHeader
          user={user!}
          isAdmin
          showBack
          backHref="/admin"
          rulesHref="/?screen=rules"
          leaderboardHref="/?screen=leaderboard"
        />

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
        {weeklyStats && weeklyStats.players.length > 0 && (
          <Card title="Top 3 weekly (candidati payout)">
            {weeklyStats.players
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
        <Card title="Run weekly payout">
          <div className="space-y-3">
            <button
              disabled={!!running}
              onClick={() => payout()}
              className={BTN}
              style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)" }}
            >
              {running === "Run Payout" ? "⏳ In corso…" : "▶️ Run Payout"}
            </button>
          </div>
          <p className="text-amber-800 text-xs mt-2">
            Esegue il draw dei ticket, paga i vincitori e poi apre una nuova week azzerando weekly leaderboard, ticket e weekly pot.
          </p>
        </Card>

        {/* Log recenti */}
        {logs.length > 0 && (
          <Card
            title="Ultimi payout eseguiti"
            action={
              <Link
                href="/admin/payouts"
                className="shrink-0 text-[11px] font-bold text-amber-400 underline underline-offset-4"
              >
                Storico completo
              </Link>
            }
          >
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
                    {l.mode ? ` · ${l.mode}` : ""}
                    {l.failedCount ? ` · ⚠️ ${l.failedCount} failed` : ""}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border border-amber-900 p-4 space-y-2"
      style={{ background: "#140a00" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-amber-400 text-xs uppercase tracking-widest">{title}</div>
        {action}
      </div>
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
