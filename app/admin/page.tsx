"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useFarcaster } from "@/hooks/useFarcaster";
import { adminFetch } from "@/lib/adminClient";
import UserPageHeader from "@/components/UserPageHeader";

const ADMIN_WALLET = (
  process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe"
).toLowerCase();
const BUILD_STAMP = process.env.NEXT_PUBLIC_BUILD_STAMP || "dev";

type QuickStats = {
  totalGames: number;
  uniquePlayers: number;
  totalFees: number;
  potBf: number;
};

const SECTIONS = [
  {
    href: "/admin/weekly",
    icon: "🏆",
    label: "Weekly Pot",
    desc: "Estrazione, payout, config",
    grad: "linear-gradient(135deg,#7c3aed,#a855f7)",
  },
  {
    href: "/admin/transactions",
    icon: "📋",
    label: "Transactions",
    desc: "Log tx, leaderboard, errori",
    grad: "linear-gradient(135deg,#0891b2,#06b6d4)",
  },
  {
    href: "/admin/wallets",
    icon: "💰",
    label: "Wallets",
    desc: "Saldi ETH / USDC / BF live",
    grad: "linear-gradient(135deg,#059669,#10b981)",
  },
  {
    href: "/admin/payouts",
    icon: "📊",
    label: "Payout Report",
    desc: "Storico pagamenti weekly",
    grad: "linear-gradient(135deg,#b45309,#f59e0b)",
  },
];

export default function AdminHome() {
  const { user, connectWallet } = useFarcaster();
  const [qs, setQs] = useState<QuickStats | null>(null);
  const address = user?.address?.toLowerCase() || "";
  const authorized = address === ADMIN_WALLET;

  useEffect(() => {
    if (!authorized) return;
    Promise.all([
      adminFetch(address, "/api/admin/leaderboard").then((r) =>
        r.json()
      ),
      fetch("/api/weekly").then((r) => r.json()),
    ])
      .then(([lb, w]) =>
        setQs({
          totalGames: lb.stats?.totalGames ?? 0,
          uniquePlayers: lb.stats?.uniquePlayers ?? 0,
          totalFees: lb.stats?.totalFees ?? 0,
          potBf: w.potBf ?? 0,
        })
      )
      .catch(() => {});
  }, [authorized, address]);

  if (!user?.address) {
    return (
      <Center>
        <div className="text-6xl mb-4">⚙️</div>
        <h1 className="text-2xl font-black text-white mb-3">Admin</h1>
        <p className="text-amber-500 text-sm mb-6">Connect wallet to continue.</p>
        <button
          onClick={connectWallet}
          className="px-8 py-4 rounded-2xl font-black text-black text-lg"
          style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}
        >
          Connect Wallet
        </button>
      </Center>
    );
  }

  if (!authorized) {
    return (
      <Center>
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-black text-white mb-2">Unauthorized</h1>
        <p className="text-red-400 text-sm break-all">{address}</p>
        <Link href="/" className="mt-6 text-amber-400 underline text-sm">
          ← Back to game
        </Link>
      </Center>
    );
  }

  return (
    <div className="user-page-bg min-h-dvh p-5">
      <div className="max-w-lg mx-auto space-y-5">
        <UserPageHeader
          user={user!}
          isAdmin
          showBack
          backHref="/"
          rulesHref="/?screen=rules"
          leaderboardHref="/?screen=leaderboard"
        />
        <div className="text-right text-[10px] text-amber-900">{BUILD_STAMP}</div>

        {/* Quick stats */}
        {qs ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: "Partite", v: qs.totalGames.toLocaleString() },
              { l: "Giocatori", v: qs.uniquePlayers.toLocaleString() },
              { l: "Fee USDC", v: qs.totalFees.toFixed(2) },
              { l: "Pot BF", v: Math.round(qs.potBf).toLocaleString() },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-2xl border border-amber-900 p-4 text-center"
                style={{ background: "#140a00" }}
              >
                <div className="text-amber-600 text-xs uppercase tracking-widest">{s.l}</div>
                <div className="text-white text-2xl font-black mt-1">{s.v}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-amber-600 text-sm">Caricamento stats…</div>
        )}

        {/* Nav */}
        <div className="space-y-3">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="flex items-center gap-4 rounded-2xl p-5 border border-amber-900 active:scale-95 transition-transform"
              style={{ background: "#140a00" }}
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0"
                style={{ background: s.grad }}
              >
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-black text-lg">{s.label}</div>
                <div className="text-amber-600 text-sm">{s.desc}</div>
              </div>
              <div className="text-amber-700 text-2xl">›</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center p-6 text-center"
      style={{ background: "#1a0a00" }}
    >
      {children}
    </div>
  );
}
