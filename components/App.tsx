"use client";
import { useState } from "react";
import { useFarcaster } from "@/hooks/useFarcaster";
import GameScreen from "./GameScreen";
import LeaderboardScreen from "./LeaderboardScreen";
import RulesScreen from "./RulesScreen";
import { useEffect } from "react";
import { BF_PER_USDC } from "@/lib/pricing";

type Screen = "home" | "game" | "leaderboard" | "rules";

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTY_CONFIG = {
  easy:   { label: "Easy",   emoji: "🟢", time: 30, maxPts: 48, fee: 0.015, color: "#16a34a" },
  medium: { label: "Medium", emoji: "🟡", time: 25, maxPts: 64, fee: 0.03, color: "#ca8a04" },
  hard:   { label: "Hard",   emoji: "🔴", time: 20, maxPts: 80, fee: 0.045, color: "#dc2626" },
};

export const PRIZE_PER_POINT = 0.001; // USDC
export const PRIZE_WALLET = "0xFd144C774582a450a3F578ae742502ff11Ff92Df";
export const MIN_POOL_BALANCE = 0.10;

export default function App() {
  const { user, isLoading, isConnected, logout } = useFarcaster();
  const [screen, setScreen] = useState<Screen>("home");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [lastResult, setLastResult] = useState<{ score: number; prize: number } | null>(null);
  const [poolBalance, setPoolBalance] = useState<number>(0);
  const [poolLoading, setPoolLoading] = useState(true);
  const [poolConfigured, setPoolConfigured] = useState(true);

  useEffect(() => {
    fetch("/api/payout")
      .then(r => r.json())
      .then(d => {
        setPoolBalance(typeof d.balance === "number" ? d.balance : 0);
        setPoolConfigured(d.configured !== false);
        setPoolLoading(false);
      })
      .catch(() => setPoolLoading(false));
  }, [lastResult]); // refresh after each game

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
  const poolEmpty = !poolLoading && poolConfigured && poolBalance < MIN_POOL_BALANCE;
  const poolUnavailable = !poolLoading && !poolConfigured;
  const poolDisabled = poolEmpty || poolUnavailable;
  const bfPerPoint = PRIZE_PER_POINT * BF_PER_USDC;

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
          {poolLoading ? "..." : poolUnavailable ? "—" : `${poolBalance.toFixed(3)} USDC`}
        </div>
        {poolEmpty && (
          <div className="text-red-400 text-xs text-center mt-1">Game temporarily suspended</div>
        )}
        {poolUnavailable && (
          <div className="text-red-400 text-xs text-center mt-1">Pool not configured</div>
        )}
        <div className="text-xs text-amber-700 text-center mt-1">Reward: {bfPerPoint.toFixed(0)} BF per point (approx)</div>
      </div>

      {/* Last result */}
      {lastResult && (
        <div className={`w-full max-w-sm rounded-2xl p-3 text-center border ${
          lastResult.prize > 0 ? "border-green-600 bg-green-950" : "border-amber-800 bg-amber-950"
        }`}>
          {lastResult.prize > 0
            ? <span className="text-green-300 font-bold">🎉 You won {Math.round(lastResult.prize * BF_PER_USDC).toLocaleString()} BF with {lastResult.score} points!</span>
            : <span className="text-amber-600 font-bold">No points scored — try again! ({lastResult.score} pts)</span>
          }
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

      {/* Quick rules */}
      <div className="w-full max-w-sm text-xs text-amber-800 grid grid-cols-2 gap-1">
        <div>🦋 Normal butterfly → +1 pt</div>
        <div>⚡ Fast butterfly → +3 pts</div>
        <div>💖 Fuchsia butterfly → +4 pts</div>
        <div>🔴 Red butterfly → -2 pts</div>
        <div>📖 <button onClick={() => setScreen("rules")} className="underline text-amber-600">All rules</button></div>
      </div>

      {/* Disclaimer */}
      <div className="w-full max-w-sm text-[11px] text-amber-700 text-center leading-relaxed">
        This game is for pure fun only. It is playable as long as there is prize pool available.
        It could end anytime or be paused. Under construction — it may change without notice.
      </div>

      {/* Play button */}
      <button
        disabled={poolDisabled}
        onClick={() => setScreen("game")}
        className="w-full max-w-sm py-5 rounded-2xl text-xl font-black text-black transition-all active:scale-95 disabled:opacity-40"
        style={{
          background: poolDisabled ? "#555" : `linear-gradient(135deg, #fbbf24, #f59e0b)`,
          boxShadow: poolDisabled ? "none" : "0 8px 30px rgba(251,191,36,0.4)"
        }}
      >
        {poolUnavailable ? "Pool Unavailable" : poolEmpty ? "Pool Empty 😔" : `PLAY — ${cfg.fee} USDC 🐝`}
      </button>
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
