"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFarcaster } from "@/hooks/useFarcaster";
import { adminFetch, signAdminAction } from "@/lib/adminClient";

const ADMIN_WALLET = (
  process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe"
).toLowerCase();

type Player = {
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
};
type AdminStats = {
  totalGames: number;
  uniquePlayers: number;
  totalFees: number;
  totalPrizes: number;
  gamesByDifficulty: Record<string, number>;
  players: Player[];
};
type Msg = { type: "ok" | "err"; text: string } | null;

export default function AdminTransactions() {
  const { user } = useFarcaster();
  const address = user?.address?.toLowerCase() || "";
  const authorized = address === ADMIN_WALLET;

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [resetting, setResetting] = useState(false);
  const [filter, setFilter] = useState<"all" | "easy" | "medium" | "hard">("all");
  const totals = useMemo(() => {
    if (!stats) return null;
    return {
      house: (stats.totalFees - stats.totalPrizes).toFixed(3),
      roi: stats.totalFees > 0 ? ((stats.totalPrizes / stats.totalFees) * 100).toFixed(1) : "0",
    };
  }, [stats]);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await adminFetch(address, "/api/admin/leaderboard");
        const data = await res.json();
        if (!cancelled) setStats(data.stats);
      } catch {
        if (!cancelled) setMsg({ type: "err", text: "Caricamento fallito" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, authorized]);

  async function resetLeaderboard() {
    setResetting(true);
    setMsg({ type: "ok", text: "Firma richiesta…" });
    try {
      const signed = await signAdminAction(address, "reset_leaderboard");
      const res = await adminFetch(address, "/api/admin/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", challenge: signed.challenge, message: signed.message, signature: signed.signature }),
      });
      if (res.ok) {
        setMsg({ type: "ok", text: "Leaderboard resettata ✓" });
        setStats(null);
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: d?.error || "Reset failed" });
      }
    } catch {
      setMsg({ type: "err", text: "Firma annullata" });
    }
    setResetting(false);
  }

  if (!authorized)
    return (
      <Unauth />
    );

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
          <h1 className="text-2xl font-black text-white flex-1">📋 Transactions</h1>
        </div>

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

        {/* Accesso rapido tx log */}
        <Link
          href="/admin/tx-records"
          className="flex items-center gap-4 rounded-2xl p-5 border border-amber-900 active:scale-95 transition-transform"
          style={{ background: "#140a00" }}
        >
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0"
            style={{ background: "linear-gradient(135deg,#f472b6,#ec4899)" }}
          >
            🔍
          </div>
          <div className="flex-1">
            <div className="text-white font-black text-lg">Tx Log completo</div>
            <div className="text-amber-600 text-sm">Tutte le transazioni, fee in, premi out, errori</div>
          </div>
          <div className="text-amber-700 text-2xl">›</div>
        </Link>

        {/* Totali */}
        {stats && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: "Partite totali", v: stats.totalGames.toString() },
              { l: "Giocatori unici", v: stats.uniquePlayers.toString() },
              { l: "Fee incassate (USDC)", v: stats.totalFees.toFixed(3) },
              { l: "Premi pagati (USDC)", v: stats.totalPrizes.toFixed(3) },
              { l: "House edge (USDC)", v: totals?.house || "0" },
              { l: "Player ROI (%)", v: `${totals?.roi}%` },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-2xl border border-amber-900 p-3 text-center"
                style={{ background: "#140a00" }}
              >
                <div className="text-amber-600 text-xs uppercase tracking-widest">{s.l}</div>
                <div className="text-white text-xl font-black mt-1">{s.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Difficoltà breakdown */}
        {stats?.gamesByDifficulty && (
          <div
            className="rounded-2xl border border-amber-900 p-4"
            style={{ background: "#140a00" }}
          >
            <div className="text-amber-400 text-xs uppercase tracking-widest mb-3">
              Partite per difficoltà
            </div>
            <div className="flex gap-4">
              {Object.entries(stats.gamesByDifficulty).map(([k, v]) => (
                <div key={k} className="flex-1 text-center">
                  <div className="text-amber-600 text-xs capitalize">{k}</div>
                  <div className="text-white text-2xl font-black">{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div
          className="rounded-2xl border border-amber-900 p-4"
          style={{ background: "#140a00" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-amber-400 text-xs uppercase tracking-widest">Leaderboard</div>
            <div className="flex gap-1">
              {(["all", "easy", "medium", "hard"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                    filter === f
                      ? "bg-amber-500 text-black"
                      : "text-amber-600 border border-amber-900"
                  }`}
                >
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-amber-600 text-sm">Caricamento…</div>
          ) : (
            <div className="space-y-3">
              {(stats?.players || []).map((p, i) => (
                <div key={p.fid} className="flex items-center gap-3">
                  <div className="text-amber-700 text-xs w-5 text-center font-bold">
                    {i + 1}
                  </div>
                  {p.pfpUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.pfpUrl} alt="" className="w-9 h-9 rounded-full shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-amber-900 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-bold truncate">
                      {p.displayName}{" "}
                      <span className="text-amber-500 font-normal">@{p.username}</span>
                    </div>
                    <div className="text-amber-700 text-xs">
                      {p.games}g · {p.wins}W/{p.losses}L · {p.winRate}%
                    </div>
                    <div className="text-amber-700 text-xs">
                      E:{p.gamesByDifficulty.easy || 0} M:{p.gamesByDifficulty.medium || 0} H:
                      {p.gamesByDifficulty.hard || 0}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-amber-300 text-xs">
                      Speso {p.totalFees.toFixed(2)}
                    </div>
                    <div className="text-green-400 text-xs">Vinto {p.totalPrize.toFixed(2)}</div>
                    <div
                      className={`text-xs font-bold ${
                        p.net >= 0 ? "text-green-300" : "text-red-400"
                      }`}
                    >
                      Net {p.net >= 0 ? "+" : ""}
                      {p.net.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reset leaderboard */}
        <div
          className="rounded-2xl border border-amber-900 p-4"
          style={{ background: "#140a00" }}
        >
          <div className="text-amber-400 text-xs uppercase tracking-widest mb-3">Azioni</div>
          <button
            disabled={resetting}
            onClick={resetLeaderboard}
            className={BTN}
            style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}
          >
            {resetting ? "⏳ Attendi firma…" : "🗑️  Reset Leaderboard (firma richiesta)"}
          </button>
          <p className="text-amber-800 text-xs mt-2">
            Svuota l&apos;intera leaderboard. Richiede firma wallet per sicurezza.
          </p>
        </div>
      </div>
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
