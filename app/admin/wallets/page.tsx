"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useFarcaster } from "@/hooks/useFarcaster";
import { adminFetch } from "@/lib/adminClient";
import UserPageHeader from "@/components/UserPageHeader";

const ADMIN_WALLET = (
  process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe"
).toLowerCase();

type WalletInfo = { address: string; eth: number; usdc: number; bf: number };
type Wallets = Record<string, WalletInfo>;

const WALLET_META: Record<string, { label: string; emoji: string; desc: string; grad: string }> = {
  prize: {
    label: "Game Wallet",
    emoji: "🎮",
    desc: "Riceve le fee USDC, paga i premi BF",
    grad: "linear-gradient(135deg,#7c3aed,#a855f7)",
  },
  pot: {
    label: "Weekly Pot",
    emoji: "🏆",
    desc: "Accumula il 4.5% dei premi BF, paga il weekly",
    grad: "linear-gradient(135deg,#b45309,#f59e0b)",
  },
  burn: {
    label: "Burn / Dump",
    emoji: "🔥",
    desc: "Riceve l'1% burn — sarà rimosso in futuro",
    grad: "linear-gradient(135deg,#374151,#6b7280)",
  },
};

function fmt(n: number, decimals = 4) {
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export default function AdminWallets() {
  const { user } = useFarcaster();
  const address = user?.address?.toLowerCase() || "";
  const authorized = address === ADMIN_WALLET;

  const [wallets, setWallets] = useState<Wallets | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(address, "/api/admin/wallets");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      setWallets(data.wallets);
      setLastRefresh(Date.now());
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, [address]);

  useEffect(() => {
    if (!authorized) return;
    void refresh();
  }, [authorized, refresh]);

  if (!authorized)
    return (
      <Unauth />
    );

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
        <div className="flex justify-end">
          <button
            onClick={refresh}
            disabled={loading}
            className="px-4 py-2 rounded-full text-sm font-black text-amber-950 disabled:opacity-40 transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#f7bd2b,#ffdc72)" }}
          >
            {loading ? "⏳" : "🔄 Refresh"}
          </button>
        </div>

        {lastRefresh && (
          <div className="text-amber-100/55 text-xs">
            Aggiornato: {new Date(lastRefresh).toLocaleTimeString("it-IT")}
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-950 border border-red-800 p-4 text-red-300 text-sm">
            ❌ {error}
          </div>
        )}

        {loading && !wallets && (
          <div className="text-amber-600 text-sm">Lettura saldi on-chain…</div>
        )}

        {/* Wallet cards */}
        {wallets &&
          Object.entries(wallets).map(([key, w]) => {
            const meta = WALLET_META[key] || {
              label: key,
              emoji: "💼",
              desc: "",
              grad: "linear-gradient(135deg,#374151,#4b5563)",
            };
            return (
              <div
                key={key}
                className="page-panel rounded-[28px] overflow-hidden"
              >
                {/* Card header */}
                <div
                  className="p-4 flex items-center gap-3"
                  style={{ background: meta.grad, opacity: 0.92 }}
                >
                  <div className="text-4xl">{meta.emoji}</div>
                  <div>
                    <div className="text-white font-black text-lg leading-tight">
                      {meta.label}
                    </div>
                    <div className="text-white/70 text-xs">{meta.desc}</div>
                  </div>
                </div>

                {/* Saldi */}
                <div className="p-4 space-y-3">
                  {/* ETH */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">⟠</span>
                      <div>
                        <div className="text-amber-400 text-xs uppercase tracking-wider">ETH</div>
                        <div className="text-amber-700 text-xs">Gas</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-lg font-black ${
                          w.eth < 0.001 ? "text-red-400" : "text-white"
                        }`}
                      >
                        {fmt(w.eth, 5)}
                      </div>
                      {w.eth < 0.001 && (
                        <div className="text-red-500 text-xs">⚠️ Basso</div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-amber-950" />

                  {/* USDC */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">💵</span>
                      <div>
                        <div className="text-amber-400 text-xs uppercase tracking-wider">USDC</div>
                        <div className="text-amber-700 text-xs">Base</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white text-lg font-black">{fmt(w.usdc, 2)}</div>
                    </div>
                  </div>

                  <div className="border-t border-amber-950" />

                  {/* BF */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🦋</span>
                      <div>
                        <div className="text-amber-400 text-xs uppercase tracking-wider">BF</div>
                        <div className="text-amber-700 text-xs">Butterfly token</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-amber-300 text-lg font-black">
                        {Math.round(w.bf).toLocaleString("it-IT")}
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="border-t border-amber-950 pt-2">
                    <a
                      href={`https://basescan.org/address/${w.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-100/55 text-xs hover:text-amber-200 transition-colors font-mono break-all"
                    >
                      {w.address}
                    </a>
                  </div>
                </div>
              </div>
            );
          })}

        {/* Totali aggregati */}
        {wallets && (
          <div className="page-panel px-4 py-4">
            <div className="page-kicker mb-3">
              Totali aggregati
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                {
                  l: "ETH totale",
                  v: fmt(
                    Object.values(wallets).reduce((s, w) => s + w.eth, 0),
                    5
                  ),
                },
                {
                  l: "USDC totale",
                  v: fmt(
                    Object.values(wallets).reduce((s, w) => s + w.usdc, 0),
                    2
                  ),
                },
                {
                  l: "BF totale",
                  v: Math.round(
                    Object.values(wallets).reduce((s, w) => s + w.bf, 0)
                  ).toLocaleString("it-IT"),
                },
              ].map((t) => (
                <div key={t.l}>
                  <div className="text-amber-100/55 text-xs">{t.l}</div>
                  <div className="text-white font-black text-base mt-1">{t.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
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
