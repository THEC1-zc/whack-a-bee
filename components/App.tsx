"use client";
import { useState } from "react";
import { useFarcaster } from "@/hooks/useFarcaster";
import GameScreen from "./GameScreen";
import LeaderboardScreen from "./LeaderboardScreen";

type Screen = "home" | "game" | "leaderboard";

export default function App() {
  const { user, isLoading, isConnected, connectWallet } = useFarcaster();
  const [screen, setScreen] = useState<Screen>("home");
  const [lastScore, setLastScore] = useState<number | null>(null);

  // Prize pool placeholder
  const PRIZE_POOL = "0.05 ETH";
  const WIN_SCORE = 50;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-amber-950">
        <div className="text-5xl animate-bounce">🐝</div>
      </div>
    );
  }

  if (!isConnected || !user) {
    return <NotConnected />;
  }

  if (screen === "game") {
    return (
      <GameScreen
        user={user}
        winScore={WIN_SCORE}
        onGameEnd={(score) => {
          setLastScore(score);
          setScreen("home");
        }}
      />
    );
  }

  if (screen === "leaderboard") {
    return <LeaderboardScreen onBack={() => setScreen("home")} />;
  }

  // Home screen
  return (
    <div className="min-h-dvh flex flex-col items-center justify-between p-5"
      style={{ background: "linear-gradient(180deg, #1a0a00 0%, #2a1200 100%)" }}>

      {/* Header */}
      <div className="w-full flex items-center gap-3 pt-2">
        {user.pfpUrl && (
          <img src={user.pfpUrl} alt={user.username} className="w-9 h-9 rounded-full border-2 border-amber-400" />
        )}
        <div>
          <div className="text-white font-bold text-sm">{user.displayName}</div>
          <div className="text-amber-400 text-xs">@{user.username}</div>
        </div>
        <button
          onClick={() => setScreen("leaderboard")}
          className="ml-auto text-2xl hover:scale-110 transition-transform"
          title="Leaderboard"
        >🏆</button>
      </div>

      {/* Title */}
      <div className="text-center">
        <div className="text-7xl mb-2 drop-shadow-lg" style={{ filter: "drop-shadow(0 0 20px #fbbf24)" }}>🐝</div>
        <h1 className="text-4xl font-black text-white tracking-tight">Whack-a-Bee</h1>
        <p className="text-amber-300 text-sm mt-1">Schiaccia le api, vinci premi!</p>
      </div>

      {/* Prize Pool Card */}
      <div className="w-full max-w-sm rounded-2xl p-4 border border-amber-700"
        style={{ background: "#2a1500" }}>
        <div className="text-xs text-amber-500 uppercase tracking-widest mb-1 text-center">💰 Prize Pool</div>
        <div className="text-3xl font-black text-amber-400 text-center">{PRIZE_POOL}</div>
        <div className="text-xs text-amber-700 text-center mt-1">
          Fai {WIN_SCORE}+ punti per vincere
        </div>

        {lastScore !== null && (
          <div className={`mt-3 p-2 rounded-xl text-center text-sm font-bold ${lastScore >= WIN_SCORE ? "bg-green-900 text-green-300" : "bg-red-950 text-red-400"}`}>
            {lastScore >= WIN_SCORE
              ? `🎉 HAI VINTO con ${lastScore} punti!`
              : `Ultimo score: ${lastScore} pt — riprova!`
            }
          </div>
        )}
      </div>

      {/* Rules */}
      <div className="w-full max-w-sm text-xs text-amber-800 space-y-1 px-1">
        <div>🐝 Api normali → +1 punto</div>
        <div>⚡ Api veloci → +3 punti</div>
        <div>💣 Api rosse → -2 punti (EVITA!)</div>
        <div>⏱ 30 secondi per giocare</div>
      </div>

      {/* Play Button */}
      <button
        onClick={() => setScreen("game")}
        className="w-full max-w-sm py-5 rounded-2xl text-xl font-black text-black transition-all active:scale-95"
        style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", boxShadow: "0 8px 30px rgba(251,191,36,0.4)" }}
      >
        GIOCA ORA 🐝
      </button>
    </div>
  );
}

function NotConnected() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center"
      style={{ background: "#1a0a00" }}>
      <div className="text-6xl mb-4">🐝</div>
      <h1 className="text-2xl font-black text-white mb-2">Whack-a-Bee</h1>
      <p className="text-amber-400 text-sm mb-6">Apri questa app da Warpcast per giocare!</p>
      <div className="text-xs text-amber-800 max-w-xs">
        Questa è una Farcaster Mini App. Aprila tramite un cast o cerca "Whack-a-Bee" su Warpcast.
      </div>
    </div>
  );
}
