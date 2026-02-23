"use client";
import { useState } from "react";
import { useFarcaster } from "@/hooks/useFarcaster";
import GameScreen from "./GameScreen";
import LeaderboardScreen from "./LeaderboardScreen";
import RulesScreen from "./RulesScreen";
import { useEffect } from "react";
import { BF_PER_USDC_FALLBACK } from "@/lib/pricing";

type Screen = "home" | "game" | "leaderboard" | "rules";

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTY_CONFIG = {
  easy:   { label: "Easy",   emoji: "🟢", time: 30, maxPts: 48, fee: 0.015, color: "#16a34a" },
  medium: { label: "Medium", emoji: "🟡", time: 25, maxPts: 64, fee: 0.03, color: "#ca8a04" },
  hard:   { label: "Hard",   emoji: "🔴", time: 20, maxPts: 80, fee: 0.045, color: "#dc2626" },
};

export const PRIZE_PER_POINT = 0.001; // USDC
export const PRIZE_WALLET = "0xFd144C774582a450a3F578ae742502ff11Ff92Df";
export const MIN_POOL_BALANCE_BF = 100000;

const ADMIN_WALLET = (process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe").toLowerCase();

export default function App() {
  const { user, isLoading, isConnected, logout, connectWallet } = useFarcaster();
  const [screen, setScreen] = useState<Screen>("home");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [lastResult, setLastResult] = useState<{ score: number; prize: number } | null>(null);
  const [poolBalance, setPoolBalance] = useState<number>(0);
  const [poolBalanceBf, setPoolBalanceBf] = useState<number>(0);
  const [poolLoading, setPoolLoading] = useState(true);
  const [poolConfigured, setPoolConfigured] = useState(true);
  const [bfPerUsdc, setBfPerUsdc] = useState<number | null>(null);
  const [weeklyPot, setWeeklyPot] = useState<number | null>(null);
  const [nextReset, setNextReset] = useState<number | null>(null);
  const [myTickets, setMyTickets] = useState<{ pending: number; claimed: number } | null>(null);
  const [claimingTickets, setClaimingTickets] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/payout")
      .then(r => r.json())
      .then(d => {
        setPoolBalance(typeof d.balance === "number" ? d.balance : 0);
        setPoolBalanceBf(typeof d.balanceBf === "number" ? d.balanceBf : 0);
        setPoolConfigured(d.configured !== false);
        setPoolLoading(false);
      })
      .catch(() => setPoolLoading(false));
  }, [lastResult]); // refresh after each game

  useEffect(() => {
    fetch("/api/price")
      .then(r => r.json())
      .then(d => {
        if (typeof d.bfPerUsdc === "number" && d.bfPerUsdc > 0) {
          setBfPerUsdc(d.bfPerUsdc);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/weekly")
      .then(r => r.json())
      .then(d => {
        if (typeof d.potBf === "number") setWeeklyPot(d.potBf);
        if (typeof d.payoutAt === "number") setNextReset(d.payoutAt);
      })
      .catch(() => {});
  }, [lastResult]);

  useEffect(() => {
    if (!user?.address) {
      setMyTickets(null);
      return;
    }
    fetch("/api/weekly/my", { headers: { "x-wallet-address": user.address } })
      .then(r => r.json())
      .then(d => setMyTickets(d))
      .catch(() => {});
  }, [user?.address, lastResult]);

  async function handleClaimTickets() {
    if (!user?.address || claimingTickets) return;
    setClaimError(null);
    setClaimingTickets(true);
    try {
      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      headers.set("x-wallet-address", user.address);
      const res = await fetch("/api/weekly/claim", {
        method: "POST",
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setClaimError(data?.error || "Claim failed");
        return;
      }
      setMyTickets({
        pending: 0,
        claimed: typeof data.total === "number" ? data.total : (myTickets?.claimed ?? 0),
      });
    } catch {
      setClaimError("Claim failed");
    } finally {
      setClaimingTickets(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh" style={{ background: "#1a0a00" }}>
        <div className="text-5xl animate-bounce">🐝</div>
      </div>
    );
  }

  if (!isConnected || !user) return <NotConnected />;
  if (screen === "game") return (
    <GameScreen user={user} difficulty={difficulty} onGameEnd={(score, prize) => {
      setLastResult({ score, prize });
      setScreen("home");
    }} />
  );
  if (screen === "leaderboard") return <LeaderboardScreen onBack={() => setScreen("home")} />;
  if (screen === "rules") return <RulesScreen onBack={() => setScreen("home")} />;

  const cfg = DIFFICULTY_CONFIG[difficulty];
  const poolEmpty = !poolLoading && poolConfigured && poolBalanceBf < MIN_POOL_BALANCE_BF;
  const poolUnavailable = !poolLoading && !poolConfigured;
  const poolDisabled = poolEmpty || poolUnavailable;
  const liveBfPerUsdc = bfPerUsdc ?? BF_PER_USDC_FALLBACK;
  const bfPerPoint = PRIZE_PER_POINT * liveBfPerUsdc;

  return (
    <div className="min-h-dvh flex flex-col items-center p-5 gap-4"
      style={{ background: "linear-gradient(180deg, #1a0a00 0%, #2a1200 100%)" }}>

      {/* Header */}
      <div className="w-full flex items-center gap-3 pt-2">
        {user.pfpUrl && (
          <img src={user.pfpUrl} alt={user.username} className="w-9 h-9 rounded-full border-2 border-amber-400" />
        )}
        <div>
          <div className="text-white font-bold text-sm">{user.displayName}</div>
          <div className="text-amber-400 text-xs">@{user.username}</div>
          <button
            onClick={logout}
            className="text-[10px] text-amber-600 hover:text-amber-400 underline mt-1"
          >
            Logout
          </button>
          {!user.address && (
            <button
              onClick={connectWallet}
              className="text-[10px] text-amber-600 hover:text-amber-400 underline mt-1 block"
            >
              Connect wallet
            </button>
          )}
          {user.address && user.address.toLowerCase() === ADMIN_WALLET && (
            <a href="/admin" className="text-[10px] text-amber-400 underline mt-1 block">Admin</a>
          )}
        </div>
        <div className="ml-auto flex gap-3">
          <button onClick={() => setScreen("rules")} className="text-2xl" title="Rules">📖</button>
          <button onClick={() => setScreen("leaderboard")} className="text-2xl" title="Leaderboard">🏆</button>
        </div>
      </div>

      {/* Title */}
      <div className="text-center">
        <div className="text-6xl mb-1" style={{ filter: "drop-shadow(0 0 20px #fbbf24)" }}>🦋</div>
        <h1 className="text-3xl font-black text-white">Whack-a-Butterfly</h1>
      </div>

      {/* Prize Pool */}
      <div className="w-full max-w-sm rounded-2xl p-4 border"
        style={{ background: "#2a1500", borderColor: poolEmpty ? "#dc2626" : "#92400e" }}>
        <div className="text-xs text-amber-500 uppercase tracking-widest mb-1 text-center">
          {poolUnavailable ? "⚠️ Prize Pool Unavailable" : poolEmpty ? "⚠️ Prize Pool Empty" : "💰 Prize Pool (approx)"}
        </div>
        <div className={`text-3xl font-black text-center ${poolEmpty || poolUnavailable ? "text-red-400" : "text-amber-400"}`}>
          {poolLoading ? "..." : poolUnavailable ? "—" : `${Math.round(poolBalanceBf).toLocaleString()} BF`}
        </div>
        {poolEmpty && (
          <div className="text-red-400 text-xs text-center mt-1">Game temporarily suspended</div>
        )}
        {poolUnavailable && (
          <div className="text-red-400 text-xs text-center mt-1">Pool not configured</div>
        )}
        <div className="text-xs text-amber-700 text-center mt-1">Reward: {bfPerPoint.toFixed(0)} BF per point (approx)</div>
      </div>

      {/* BF/USDC rate */}
      <div className="w-full max-w-sm rounded-2xl p-3 border border-amber-900 text-center text-xs"
        style={{ background: "#1f1000" }}>
        <div className="text-amber-500 uppercase tracking-widest mb-1">Rate</div>
        <div className="text-amber-200 font-bold">
          1 USDC ≈ {Math.round((bfPerUsdc ?? BF_PER_USDC_FALLBACK)).toLocaleString()} BF
        </div>
      </div>

      {/* Weekly pot */}
      <div className="w-full max-w-sm rounded-2xl p-3 border border-amber-900 text-center text-xs"
        style={{ background: "#1f1000" }}>
        <div className="text-amber-500 uppercase tracking-widest mb-1">Weekly Pot</div>
        <div className="text-amber-200 font-bold">
          {weeklyPot == null ? "—" : `${Math.round(weeklyPot).toLocaleString()} BF`}
        </div>
        {nextReset && (
          <div className="text-amber-700 mt-1">
            Resets {new Date(nextReset).toLocaleString("en-GB", { timeZone: "Europe/Rome" })} CET
          </div>
        )}
        <a href="/weekly" className="text-amber-400 underline mt-2 inline-block">Weekly details</a>
      </div>

      <div className="w-full max-w-sm rounded-2xl p-3 border border-amber-900 text-center text-xs"
        style={{ background: "#1f1000" }}>
        <div className="text-amber-500 uppercase tracking-widest mb-1">My Tickets</div>
        {!user.address ? (
          <button
            onClick={connectWallet}
            className="px-4 py-2 rounded-lg text-sm font-black text-black"
            style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
          >
            Connect Wallet
          </button>
        ) : (
          <>
            <div className="text-amber-200 font-bold">
              Pending: {myTickets?.pending ?? 0} · Claimed: {myTickets?.claimed ?? 0}
            </div>
            <button
              onClick={handleClaimTickets}
              disabled={claimingTickets || (myTickets?.pending ?? 0) <= 0}
              className="mt-2 px-4 py-2 rounded-lg text-sm font-black text-black disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
            >
              {claimingTickets ? "Claiming..." : "Claim Tickets"}
            </button>
            {claimError && <div className="text-red-400 mt-2">{claimError}</div>}
          </>
        )}
      </div>

      {/* Last result */}
      {lastResult && (
        <div className={`w-full max-w-sm rounded-2xl p-3 text-center border ${
          lastResult.prize > 0 ? "border-green-600 bg-green-950" : "border-amber-800 bg-amber-950"
        }`}>
          {lastResult.prize > 0 ? (
            <span className="text-green-300 font-bold">
              🎉 You won {Math.round(lastResult.prize * liveBfPerUsdc * 0.95).toLocaleString()} BF with {lastResult.score} points!
            </span>
          ) : (
            <span className="text-amber-600 font-bold">No points scored — try again! ({lastResult.score} pts)</span>
          )}
        </div>
      )}

      {/* Difficulty selector */}
      <div className="w-full max-w-sm">
        <div className="text-xs text-amber-600 uppercase tracking-widest mb-2 text-center">Difficulty</div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(DIFFICULTY_CONFIG) as [Difficulty, typeof DIFFICULTY_CONFIG.easy][]).map(([key, c]) => (
            <button key={key} onClick={() => setDifficulty(key)}
              className="rounded-xl p-3 text-center border-2 transition-all"
              style={{
                background: difficulty === key ? c.color + "33" : "#1a0a00",
                borderColor: difficulty === key ? c.color : "#3d1a00",
              }}>
              <div className="text-lg">{c.emoji}</div>
              <div className="text-white font-bold text-xs">{c.label}</div>
              <div className="text-amber-500 text-xs mt-1">{c.fee} USDC</div>
              <div className="text-amber-700 text-xs">{c.time}s · {c.maxPts}pt max</div>
            </button>
          ))}
        </div>
      </div>

      {/* Play button */}
      <button
        type="button"
        disabled={poolDisabled}
        onClick={() => setScreen("game")}
        className="w-full max-w-sm py-5 rounded-2xl text-xl font-black text-black transition-all active:scale-95 disabled:opacity-40"
        style={{
          background: poolDisabled ? "#555" : `linear-gradient(135deg, #fbbf24, #f59e0b)`,
          boxShadow: poolDisabled ? "none" : "0 8px 30px rgba(251,191,36,0.4)"
        }}
      >
        {poolUnavailable ? "Pool Unavailable" : poolEmpty ? "Pool Empty 😔" : `PLAY — ${cfg.fee} USDC 🦋`}
      </button>

      {/* Quick rules */}
      <div className="w-full max-w-sm text-xs text-amber-800 grid grid-cols-2 gap-1">
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-md border flex items-center justify-center"
            style={{ background: "#5b3a1a", borderColor: "#fbbf24" }}
          >
            <img src="/bf.png" alt="" className="w-4 h-4" style={{ filter: "hue-rotate(20deg) saturate(0.8)" }} />
          </span>
          <span>Normal butterfly → +1 pt</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-md border flex items-center justify-center"
            style={{ background: "#7dd3fc", borderColor: "#1e3a8a" }}
          >
            <img
              src="/bf.png"
              alt=""
              className="w-4 h-4"
              style={{ filter: "hue-rotate(180deg) saturate(2)" }}
            />
          </span>
          <span>Power butterfly → +3 pts</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-md border flex items-center justify-center"
            style={{ background: "#f9a8d4", borderColor: "#ec4899" }}
          >
            <img
              src="/bf.png"
              alt=""
              className="w-4 h-4"
              style={{ filter: "hue-rotate(310deg) saturate(2)" }}
            />
          </span>
          <span>Fast butterfly → +4 pts</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-md border flex items-center justify-center"
            style={{ background: "#ef4444", borderColor: "#7f1d1d" }}
          >
            <img
              src="/bf.png"
              alt=""
              className="w-4 h-4"
              style={{ filter: "hue-rotate(330deg) saturate(2)" }}
            />
          </span>
          <span>Red butterfly → -2 pts</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-md border flex items-center justify-center"
            style={{ background: "#a855f7", borderColor: "#4c1d95" }}
          >
            <img
              src="/bf.png"
              alt=""
              className="w-4 h-4"
              style={{ filter: "hue-rotate(260deg) saturate(2)" }}
            />
          </span>
          <span>Mega butterfly → +100000 BF</span>
        </div>
        <div>📖 <button onClick={() => setScreen("rules")} className="underline text-amber-600">All rules</button></div>
      </div>

      {/* Disclaimer */}
      <div className="w-full max-w-sm text-[11px] text-amber-700 text-center leading-relaxed">
        This game is for pure fun only. It is playable as long as there is prize pool available.
        It could end anytime or be paused. Under construction — it may change without notice.
      </div>
    </div>
  );
}

function NotConnected() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center" style={{ background: "#1a0a00" }}>
      <div className="text-6xl mb-4">🦋</div>
      <h1 className="text-2xl font-black text-white mb-2">Whack-a-Butterfly</h1>
      <p className="text-amber-400 text-sm mb-6">Open this app from Warpcast to play!</p>
      <div className="text-xs text-amber-800 max-w-xs">Search "Whack-a-Butterfly" on Warpcast or open it via a cast.</div>
    </div>
  );
}
