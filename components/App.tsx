"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useFarcaster } from "@/hooks/useFarcaster";
import GameScreen from "./GameScreen";
import LeaderboardScreen from "./LeaderboardScreen";
import RulesScreen from "./RulesScreen";
import UserPageHeader from "./UserPageHeader";
import { BF_PER_USDC_FALLBACK } from "@/lib/pricing";
import {
  calculatePrizeUsdc,
  DIFFICULTY_CONFIG,
  getFullValueThreshold,
  PRIZE_PER_POINT,
  type Difficulty,
} from "@/lib/gameRules";

const PRIZE_WALLET = "0xFd144C774582a450a3F578ae742502ff11Ff92Df";
const MIN_POOL_BALANCE_BF = 100000;
const ADMIN_WALLET = (process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe").toLowerCase();

type Screen = "home" | "game" | "leaderboard" | "rules";

function getInitialScreen(): Screen {
  if (typeof window === "undefined") return "home";
  const requested = new URLSearchParams(window.location.search).get("screen");
  if (requested === "leaderboard" || requested === "rules" || requested === "home") {
    return requested;
  }
  return "home";
}

export default function App() {
  const { user, isLoading, isConnected, isMiniApp, logout, connectWallet } = useFarcaster();
  const [screen, setScreen] = useState<Screen>(getInitialScreen);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [lastResult, setLastResult] = useState<{ score: number; prize: number } | null>(null);
  const [poolBalanceBf, setPoolBalanceBf] = useState<number>(0);
  const [poolLoading, setPoolLoading] = useState(true);
  const [poolConfigured, setPoolConfigured] = useState(true);
  const [bfPerUsdc, setBfPerUsdc] = useState<number | null>(null);
  const [weeklyPot, setWeeklyPot] = useState<number | null>(null);
  const [nextReset, setNextReset] = useState<number | null>(null);
  const [myTickets, setMyTickets] = useState<{ pending: number; claimed: number } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (screen === "home") {
      url.searchParams.delete("screen");
    } else if (screen === "leaderboard" || screen === "rules") {
      url.searchParams.set("screen", screen);
    }
    window.history.replaceState({}, "", url);
  }, [screen]);

  useEffect(() => {
    fetch("/api/payout")
      .then((r) => r.json())
      .then((d) => {
        setPoolBalanceBf(typeof d.balanceBf === "number" ? d.balanceBf : 0);
        setPoolConfigured(d.configured !== false);
      })
      .finally(() => setPoolLoading(false));
  }, [lastResult]);

  useEffect(() => {
    fetch("/api/price")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.bfPerUsdc === "number" && d.bfPerUsdc > 0) setBfPerUsdc(d.bfPerUsdc);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/weekly")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.potBf === "number") setWeeklyPot(d.potBf);
        if (typeof d.payoutAt === "number") setNextReset(d.payoutAt);
      })
      .catch(() => {});
  }, [lastResult]);

  useEffect(() => {
    if (!user?.address) return;
    fetch(`/api/weekly/my?address=${encodeURIComponent(user.address)}`)
      .then((r) => r.json())
      .then((d) => setMyTickets({ pending: Number(d.pending || 0), claimed: Number(d.claimed || 0) }))
      .catch(() => setMyTickets(null));
  }, [user?.address, lastResult]);

  async function handleShareApp() {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://whack-a-bee.vercel.app";
    const shareText = "Whack-a-Butterfly by @Thec1 is live on Farcaster. Enter, play, win BF, and climb the weekly pot leaderboard.";
    setShareError(null);
    try {
      await sdk.actions.composeCast({ text: shareText, embeds: [appUrl] });
    } catch {
      setShareError("Share failed");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh" style={{ background: "#1a0a00" }}>
        <div className="text-5xl animate-bounce">🐝</div>
      </div>
    );
  }

  if (!isConnected || !user) return <NotConnected onConnect={connectWallet} canConnect={isMiniApp} />;
  if (screen === "game") {
    return (
      <GameScreen
        user={user}
        difficulty={difficulty}
        onGameEnd={(score, prize) => {
          setLastResult({ score, prize });
          setScreen("home");
        }}
      />
    );
  }
  if (screen === "leaderboard") {
    return (
      <LeaderboardScreen
        user={user}
        isAdmin={user.address?.toLowerCase() === ADMIN_WALLET}
        onBack={() => setScreen("home")}
        onRules={() => setScreen("rules")}
      />
    );
  }
  if (screen === "rules") {
    return (
      <RulesScreen
        user={user}
        isAdmin={user.address?.toLowerCase() === ADMIN_WALLET}
        onBack={() => setScreen("home")}
        onLeaderboard={() => setScreen("leaderboard")}
      />
    );
  }

  const cfg = DIFFICULTY_CONFIG[difficulty];
  const poolEmpty = !poolLoading && poolConfigured && poolBalanceBf < MIN_POOL_BALANCE_BF;
  const poolUnavailable = !poolLoading && !poolConfigured;
  const poolDisabled = poolEmpty || poolUnavailable;
  const liveBfPerUsdc = bfPerUsdc ?? BF_PER_USDC_FALLBACK;
  const bfPerPoint = PRIZE_PER_POINT[difficulty] * liveBfPerUsdc;
  const maxPrizeBf = Math.round(calculatePrizeUsdc(cfg.maxPts, difficulty) * liveBfPerUsdc * 0.945);
  const visibleTickets = user?.address ? myTickets : null;
  const ticketTotal = (visibleTickets?.claimed || 0) + (visibleTickets?.pending || 0);

  return (
    <div className="user-page-bg min-h-dvh flex flex-col items-center p-5 gap-4">
      <div className="mt-2 w-full max-w-sm">
        <UserPageHeader
          user={user}
          isAdmin={user.address?.toLowerCase() === ADMIN_WALLET}
          rulesHref="/?screen=rules"
          onRules={() => setScreen("rules")}
          leaderboardHref="/?screen=leaderboard"
          onLeaderboard={() => setScreen("leaderboard")}
          active="home"
        />
      </div>

      <div className="user-page-chrome w-full max-w-sm rounded-2xl px-4 py-5 text-center">
        <div className="text-6xl mb-1" style={{ filter: "drop-shadow(0 0 20px #fbbf24)" }}>🦋</div>
        <h1 className="text-3xl font-black text-white">Whack-a-Butterfly</h1>
        <button
          type="button"
          onClick={handleShareApp}
          className="mt-3 px-4 py-2 rounded-xl text-xs font-black text-black inline-flex items-center gap-2"
          style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
        >
          <span className="relative h-5 w-5 overflow-hidden rounded-full">
            <Image src="/farcaster-share.svg" alt="" fill sizes="20px" className="object-cover" />
          </span>
          Share app to Farcaster
        </button>
        {shareError && <div className="text-red-400 text-xs mt-1">{shareError}</div>}
        <div className="mt-3 flex justify-center gap-4 text-[11px] text-amber-200">
          <button onClick={logout} className="underline underline-offset-4">Logout</button>
          {!user.address && (
            <button onClick={connectWallet} className="underline underline-offset-4">Connect wallet</button>
          )}
        </div>
      </div>

      <div className="w-full max-w-sm rounded-2xl p-4 border" style={{ background: "#2a1500", borderColor: poolEmpty ? "#dc2626" : "#92400e" }}>
        <div className="text-xs text-amber-500 uppercase tracking-widest mb-1 text-center">
          {poolUnavailable ? "⚠️ Prize Pool Unavailable" : poolEmpty ? "⚠️ Prize Pool Empty" : "💰 Prize Pool (approx)"}
        </div>
        <div className={`text-3xl font-black text-center ${poolEmpty || poolUnavailable ? "text-red-400" : "text-amber-400"}`}>
          {poolLoading ? "..." : poolUnavailable ? "—" : `${Math.round(poolBalanceBf).toLocaleString()} BF`}
        </div>
        {poolEmpty && <div className="text-red-400 text-xs text-center mt-1">Game temporarily suspended</div>}
        {poolUnavailable && <div className="text-red-400 text-xs text-center mt-1">Pool not configured</div>}
        <div className="text-xs text-amber-700 text-center mt-1">Base reward: {bfPerPoint.toFixed(0)} BF per point</div>
      </div>

      <div className="w-full max-w-sm rounded-2xl p-3 border border-amber-900 text-center text-xs" style={{ background: "#1f1000" }}>
        <div className="text-amber-500 uppercase tracking-widest mb-1">Rate</div>
        <div className="text-amber-200 font-bold">1 USDC ≈ {Math.round(liveBfPerUsdc).toLocaleString()} BF</div>
      </div>

      <div className="w-full max-w-sm rounded-2xl p-3 border border-amber-900 text-center text-xs" style={{ background: "#1f1000" }}>
        <div className="text-amber-500 uppercase tracking-widest mb-1">Weekly Pot</div>
        <div className="text-amber-200 font-bold">{weeklyPot == null ? "—" : `${Math.round(weeklyPot).toLocaleString()} BF`}</div>
        {nextReset && <div className="text-amber-700 mt-1">Resets {new Date(nextReset).toLocaleString("en-GB", { timeZone: "Europe/Rome" })} CET</div>}
        <Link href="/weekly" className="text-amber-300 underline mt-1 inline-block">Weekly details</Link>
      </div>

      <div className="w-full max-w-sm rounded-2xl p-3 border border-amber-900 text-center text-xs" style={{ background: "#1f1000" }}>
        <div className="text-amber-500 uppercase tracking-widest mb-1">My Weekly Tickets</div>
        <div className="text-amber-200 font-bold">{ticketTotal}</div>
        <div className="text-amber-700 mt-1">1 base ticket, +1 cap-cleared run, +1 profitable run, +1 every 10th win.</div>
      </div>

      {lastResult && (
        <div className="w-full max-w-sm rounded-2xl p-3 border text-center text-sm font-black text-green-200" style={{ background: "#052e16", borderColor: "#16a34a" }}>
          🎉 You won {Math.round(lastResult.prize * liveBfPerUsdc).toLocaleString()} BF with {lastResult.score} points!
        </div>
      )}

      <div className="w-full max-w-sm rounded-2xl p-4 border border-amber-900" style={{ background: "#1f1000" }}>
        <div className="text-amber-500 uppercase tracking-widest text-center mb-3">Difficulty</div>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((key) => {
            const item = DIFFICULTY_CONFIG[key];
            const active = difficulty === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDifficulty(key)}
                className="rounded-2xl border p-3 text-center transition-all"
                style={{
                  background: active ? "rgba(251,191,36,0.18)" : "#140a00",
                  borderColor: active ? "#fbbf24" : "#5d2e00",
                }}
              >
                <div className="text-3xl mb-1">{item.emoji}</div>
                <div className="text-white font-black text-lg">{item.label}</div>
                <div className="text-amber-500 text-xs mt-1">{item.fee} USDC</div>
                <div className="text-amber-700 text-[11px] mt-1">{item.waves} waves · {item.maxPts}pt cap</div>
                <div className="text-amber-700 text-[11px] mt-1">Linear payout up to {getFullValueThreshold(key)} pt</div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setScreen("game")}
        disabled={poolDisabled}
        className="w-full max-w-sm py-5 rounded-2xl text-3xl font-black text-black disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
      >
        PLAY — {cfg.fee} USDC 🦋
      </button>
      <div className="text-[11px] text-amber-600 text-center max-w-sm">
        {cfg.label}: {cfg.waves} waves, base {bfPerPoint.toFixed(0)} BF per point, up to about {maxPrizeBf.toLocaleString()} BF net before Prizefly bonus.
      </div>
    </div>
  );
}

function NotConnected({ onConnect, canConnect }: { onConnect: () => Promise<string | null>; canConnect: boolean }) {
  return (
    <div className="user-page-bg min-h-dvh flex items-center justify-center p-6">
      <div className="user-page-chrome w-full max-w-sm rounded-2xl p-6 text-center">
        <div className="text-6xl mb-3">🦋</div>
        <h1 className="text-3xl font-black text-white">Whack-a-Butterfly</h1>
        <p className="text-amber-200 text-sm mt-3">
          {canConnect ? "Connect your Farcaster wallet to start playing." : "Open this app inside Farcaster to connect your wallet and play."}
        </p>
        {canConnect ? (
          <button
            onClick={() => void onConnect()}
            className="mt-5 w-full py-4 rounded-2xl text-lg font-black text-black"
            style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
          >
            Connect Wallet
          </button>
        ) : (
          <div className="mt-5 w-full py-4 rounded-2xl text-sm font-black text-amber-950" style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}>
            Launch in Farcaster
          </div>
        )}
        <div className="text-amber-700 text-xs mt-3">Prize wallet: {PRIZE_WALLET.slice(0, 6)}…{PRIZE_WALLET.slice(-4)}</div>
      </div>
    </div>
  );
}
