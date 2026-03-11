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
    const shareUrl = `${appUrl}/share/app`;
    const shareText = "Whack-a-Butterfly by @Thec1 is live on Farcaster. Enter, play, win BF, and climb the weekly pot leaderboard.";
    setShareError(null);
    try {
      await sdk.actions.composeCast({ text: shareText, embeds: [shareUrl] });
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
    <div className="user-page-bg user-page-overlay min-h-dvh flex flex-col items-center p-5">
      <div className="page-wrap page-stack mt-2">
        <UserPageHeader
          user={user}
          isAdmin={user.address?.toLowerCase() === ADMIN_WALLET}
          rulesHref="/?screen=rules"
          onRules={() => setScreen("rules")}
          leaderboardHref="/?screen=leaderboard"
          onLeaderboard={() => setScreen("leaderboard")}
          active="home"
        />
        <div className="page-panel page-fade-top px-5 py-6 text-center">
        <div className="page-kicker">Miniapp live on Farcaster</div>
        <div className="mt-3 text-6xl" style={{ filter: "drop-shadow(0 0 20px rgba(247,189,43,0.32))" }}>🦋</div>
        <h1 className="page-title mt-2 text-[2.35rem] leading-none">Whack-a-Butterfly</h1>
        <p className="page-copy mt-3 text-sm leading-6">
          Clean waves, climb the weekly pot, and turn sharp taps into BF.
        </p>
        <button
          type="button"
          onClick={handleShareApp}
          className="mt-4 inline-flex items-center gap-3 rounded-full bg-[linear-gradient(135deg,#f7bd2b,#ffda6b)] px-4 py-2.5 text-xs font-black text-amber-950 shadow-[0_14px_28px_rgba(247,189,43,0.2)]"
        >
          <span className="relative h-6 w-6 overflow-hidden rounded-full ring-1 ring-amber-950/10">
            <Image src="/farcaster-share.svg" alt="" fill sizes="24px" className="object-cover" />
          </span>
          Share app to Farcaster
        </button>
        {shareError && <div className="mt-2 text-xs text-red-300">{shareError}</div>}
        <div className="mt-4 flex justify-center gap-4 text-[11px] text-amber-100/80">
          <button onClick={logout} className="underline underline-offset-4">Logout</button>
          {!user.address && (
            <button onClick={connectWallet} className="underline underline-offset-4">Connect wallet</button>
          )}
        </div>
      </div>

      <div className="page-panel px-5 py-5 text-center">
        <div className="text-xs uppercase tracking-widest mb-1 text-center text-amber-200/80">
          {poolUnavailable ? "⚠️ Prize Pool Unavailable" : poolEmpty ? "⚠️ Prize Pool Empty" : "💰 Prize Pool (approx)"}
        </div>
        <div className={`text-center text-[2.6rem] font-black leading-none ${poolEmpty || poolUnavailable ? "text-red-300" : "text-amber-100"}`}>
          {poolLoading ? "..." : poolUnavailable ? "—" : `${Math.round(poolBalanceBf).toLocaleString()} BF`}
        </div>
        {poolEmpty && <div className="mt-2 text-xs text-red-300">Game temporarily suspended</div>}
        {poolUnavailable && <div className="mt-2 text-xs text-red-300">Pool not configured</div>}
        <div className="page-muted mt-2 text-xs text-center">Base reward: {bfPerPoint.toFixed(0)} BF per point</div>
      </div>

      <div className="page-stat-grid sm:grid-cols-3">
        <div className="page-panel-soft px-4 py-4 text-center text-xs">
          <div className="page-kicker mb-2">Rate</div>
          <div className="text-sm font-bold text-amber-50">1 USDC ≈ {Math.round(liveBfPerUsdc).toLocaleString()} BF</div>
        </div>

        <div className="page-panel-soft px-4 py-4 text-center text-xs">
          <div className="page-kicker mb-2">Weekly Pot</div>
          <div className="text-sm font-bold text-amber-50">{weeklyPot == null ? "—" : `${Math.round(weeklyPot).toLocaleString()} BF`}</div>
          {nextReset && <div className="page-muted mt-2">Resets {new Date(nextReset).toLocaleString("en-GB", { timeZone: "Europe/Rome" })} CET</div>}
          <Link href="/weekly" className="page-link mt-2 inline-block">Weekly details</Link>
        </div>

        <div className="page-panel-soft px-4 py-4 text-center text-xs">
          <div className="page-kicker mb-2">My Weekly Tickets</div>
          <div className="text-sm font-bold text-amber-50">{ticketTotal}</div>
          <div className="page-muted mt-2">1 base ticket, +1 cap-cleared run, +1 profitable run, +1 every 10th win.</div>
        </div>
      </div>

      {lastResult && (
        <div className="page-panel-soft px-4 py-4 text-center text-sm font-black text-green-100">
          🎉 You won {Math.round(lastResult.prize * liveBfPerUsdc).toLocaleString()} BF with {lastResult.score} points!
        </div>
      )}

      <div className="page-panel px-5 py-5">
        <div className="page-kicker text-center mb-4">Difficulty</div>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((key) => {
            const item = DIFFICULTY_CONFIG[key];
            const active = difficulty === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDifficulty(key)}
                className="rounded-[22px] p-3 text-center transition-all"
                style={{
                  background: "transparent",
                  borderBottom: active ? "2px solid rgba(247,189,43,0.7)" : "2px solid rgba(255,214,122,0.14)",
                  boxShadow: "none",
                }}
              >
                <div className="text-3xl mb-1">{item.emoji}</div>
                <div className="text-white font-black text-lg">{item.label}</div>
                <div className="text-amber-200 text-xs mt-1">{item.fee} USDC</div>
                <div className="page-muted text-[11px] mt-1">{item.waves} waves · {item.maxPts}pt cap</div>
                <div className="page-muted text-[11px] mt-1">Linear payout up to {getFullValueThreshold(key)} pt</div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setScreen("game")}
        disabled={poolDisabled}
        className="w-full rounded-[26px] py-5 text-3xl font-black text-amber-950 disabled:opacity-50 shadow-[0_18px_34px_rgba(247,189,43,0.2)]"
        style={{ background: "linear-gradient(135deg, #f7bd2b, #ffdc72)" }}
      >
        PLAY — {cfg.fee} USDC 🦋
      </button>
      <div className="page-muted text-center text-[11px]">
        {cfg.label}: {cfg.waves} waves, base {bfPerPoint.toFixed(0)} BF per point, up to about {maxPrizeBf.toLocaleString()} BF net before Prizefly bonus.
      </div>
      </div>
    </div>
  );
}

function NotConnected({ onConnect, canConnect }: { onConnect: () => Promise<string | null>; canConnect: boolean }) {
  return (
    <div className="user-page-bg min-h-dvh flex items-center justify-center p-6">
      <div className="page-panel page-wrap px-6 py-6 text-center">
        <div className="text-6xl mb-3">🦋</div>
        <h1 className="page-title text-3xl">Whack-a-Butterfly</h1>
        <p className="page-copy text-sm mt-3">
          {canConnect ? "Connect your Farcaster wallet to start playing." : "Open this app inside Farcaster to connect your wallet and play."}
        </p>
        {canConnect ? (
          <button
            onClick={() => void onConnect()}
            className="mt-5 w-full py-4 rounded-[24px] text-lg font-black text-amber-950"
            style={{ background: "linear-gradient(135deg, #f7bd2b, #ffdc72)" }}
          >
            Connect Wallet
          </button>
        ) : (
          <div className="mt-5 w-full py-4 rounded-[24px] text-sm font-black text-amber-950" style={{ background: "linear-gradient(135deg, #f7bd2b, #ffdc72)" }}>
            Launch in Farcaster
          </div>
        )}
        <div className="page-muted text-xs mt-3">Prize wallet: {PRIZE_WALLET.slice(0, 6)}…{PRIZE_WALLET.slice(-4)}</div>
      </div>
    </div>
  );
}
