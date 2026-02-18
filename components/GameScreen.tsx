"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { FarcasterUser } from "@/hooks/useFarcaster";

interface Bee {
  id: number;
  slot: number;
  type: "normal" | "fast" | "bomb";
  visible: boolean;
  hit: boolean;
}

interface Props {
  user: FarcasterUser;
  winScore: number;
  onGameEnd: (score: number) => void;
}

const SLOTS = 9;
const GAME_DURATION = 30;

export default function GameScreen({ user, winScore, onGameEnd }: Props) {
  const [bees, setBees] = useState<Bee[]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [gameState, setGameState] = useState<"countdown" | "playing" | "ended">("countdown");
  const [countdown, setCountdown] = useState(3);
  const [hitEffects, setHitEffects] = useState<{ id: number; slot: number; type: string }[]>([]);

  const beeIdRef = useRef(0);
  const scoreRef = useRef(0);
  const effectIdRef = useRef(0);

  const addHitEffect = useCallback((slot: number, type: string) => {
    const id = effectIdRef.current++;
    setHitEffects(prev => [...prev, { id, slot, type }]);
    setTimeout(() => setHitEffects(prev => prev.filter(e => e.id !== id)), 400);
  }, []);

  const spawnBee = useCallback(() => {
    const usedSlots = new Set<number>();
    setBees(prev => {
      prev.filter(b => b.visible && !b.hit).forEach(b => usedSlots.add(b.slot));
      return prev;
    });

    const availableSlots = Array.from({ length: SLOTS }, (_, i) => i).filter(s => !usedSlots.has(s));
    if (availableSlots.length === 0) return;

    const slot = availableSlots[Math.floor(Math.random() * availableSlots.length)];
    const rand = Math.random();
    const type: Bee["type"] = rand < 0.15 ? "bomb" : rand < 0.35 ? "fast" : "normal";
    const id = beeIdRef.current++;

    const duration = type === "fast" ? 800 : type === "bomb" ? 1200 : 1000;

    setBees(prev => [...prev.filter(b => b.visible), { id, slot, type, visible: true, hit: false }]);

    setTimeout(() => {
      setBees(prev => prev.filter(b => b.id !== id));
    }, duration);
  }, []);

  const whackBee = useCallback((bee: Bee) => {
    if (bee.hit || !bee.visible) return;

    setBees(prev => prev.map(b => b.id === bee.id ? { ...b, hit: true } : b));

    setTimeout(() => {
      setBees(prev => prev.filter(b => b.id !== bee.id));
    }, 200);

    let points = 0;
    if (bee.type === "normal") points = 1;
    else if (bee.type === "fast") points = 3;
    else if (bee.type === "bomb") points = -2;

    const label = bee.type === "bomb" ? "💥 -2" : bee.type === "fast" ? "⚡ +3" : "+1";
    addHitEffect(bee.slot, label);

    scoreRef.current = Math.max(0, scoreRef.current + points);
    setScore(scoreRef.current);
  }, [addHitEffect]);

  // Countdown
  useEffect(() => {
    if (gameState !== "countdown") return;
    if (countdown <= 0) {
      setGameState("playing");
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, gameState]);

  // Timer
  useEffect(() => {
    if (gameState !== "playing") return;
    if (timeLeft <= 0) {
      setGameState("ended");
      submitScore();
      return;
    }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, gameState]);

  // Spawn bees
  useEffect(() => {
    if (gameState !== "playing") return;
    const interval = Math.max(400, 800 - (GAME_DURATION - timeLeft) * 15);
    const t = setTimeout(spawnBee, interval);
    return () => clearTimeout(t);
  }, [timeLeft, gameState, spawnBee]);

  async function submitScore() {
    const finalScore = scoreRef.current;
    try {
      await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: user.fid,
          username: user.username,
          displayName: user.displayName,
          pfpUrl: user.pfpUrl,
          score: finalScore,
        }),
      });
    } catch (e) {
      console.error("Submit score error:", e);
    }
  }

  const timerPercent = (timeLeft / GAME_DURATION) * 100;
  const timerColor = timeLeft > 10 ? "#fbbf24" : "#ef4444";

  // Countdown screen
  if (gameState === "countdown") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center" style={{ background: "#1a0a00" }}>
        <div className="text-amber-400 text-lg font-bold mb-4">Preparati!</div>
        <div className="text-9xl font-black text-amber-400 animate-pulse">
          {countdown === 0 ? "GO!" : countdown}
        </div>
      </div>
    );
  }

  // End screen
  if (gameState === "ended") {
    const won = scoreRef.current >= winScore;
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center"
        style={{ background: "#1a0a00" }}>
        <div className="text-6xl mb-4">{won ? "🎉" : "😔"}</div>
        <h2 className="text-3xl font-black text-white mb-2">
          {won ? "HAI VINTO!" : "Game Over"}
        </h2>
        <div className="text-6xl font-black text-amber-400 my-4">{scoreRef.current}</div>
        <div className="text-amber-600 text-sm mb-2">punti</div>

        {won ? (
          <div className="bg-green-900 border border-green-600 rounded-2xl p-4 mb-6 w-full max-w-xs">
            <div className="text-green-300 font-bold">🏆 Complimenti!</div>
            <div className="text-green-400 text-sm mt-1">Il prize pool è tuo! (funzione pagamento in arrivo)</div>
          </div>
        ) : (
          <div className="text-amber-700 text-sm mb-6">
            Ti servivano {winScore} punti. Riprova!
          </div>
        )}

        <button
          onClick={() => onGameEnd(scoreRef.current)}
          className="w-full max-w-xs py-4 rounded-2xl text-lg font-black text-black"
          style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
        >
          Torna Home
        </button>
      </div>
    );
  }

  // Game grid
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "#1a0a00" }}>

      {/* HUD */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="text-center">
          <div className="text-xs text-amber-600 uppercase tracking-widest">Punti</div>
          <div className="text-3xl font-black text-amber-400">{score}</div>
        </div>

        {/* Timer bar */}
        <div className="flex-1 mx-4">
          <div className="h-4 bg-amber-950 rounded-full overflow-hidden border border-amber-800">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${timerPercent}%`, background: timerColor }}
            />
          </div>
          <div className="text-center text-xs mt-1" style={{ color: timerColor }}>{timeLeft}s</div>
        </div>

        <div className="text-center">
          <div className="text-xs text-amber-600 uppercase tracking-widest">Target</div>
          <div className="text-3xl font-black text-amber-700">{winScore}</div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
          {Array.from({ length: SLOTS }, (_, slot) => {
            const bee = bees.find(b => b.slot === slot && b.visible);
            const effect = hitEffects.find(e => e.slot === slot);

            return (
              <div
                key={slot}
                onClick={() => bee && whackBee(bee)}
                className="relative aspect-square rounded-2xl flex items-center justify-center cursor-pointer active:scale-90 transition-transform select-none"
                style={{
                  background: bee ? (
                    bee.type === "bomb" ? "#7f1d1d" :
                    bee.type === "fast" ? "#1e3a5f" :
                    "#2a1500"
                  ) : "#1a0a00",
                  border: `2px solid ${bee ? (
                    bee.type === "bomb" ? "#dc2626" :
                    bee.type === "fast" ? "#3b82f6" :
                    "#92400e"
                  ) : "#2a1000"}`,
                  boxShadow: bee ? "0 0 15px rgba(251,191,36,0.3)" : "none",
                  transform: bee && !bee.hit ? "scale(1)" : undefined,
                }}
              >
                {bee && (
                  <span
                    className="text-4xl select-none"
                    style={{
                      animation: bee.hit ? "none" : "popIn 0.15s ease-out",
                      opacity: bee.hit ? 0 : 1,
                      transition: "opacity 0.15s",
                      filter: bee.type === "fast" ? "hue-rotate(180deg)" : undefined,
                    }}
                  >
                    {bee.type === "bomb" ? "💣" : "🐝"}
                  </span>
                )}

                {/* Hit effect */}
                {effect && (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-lg font-black pointer-events-none"
                    style={{
                      color: effect.type.includes("-") ? "#ef4444" : "#4ade80",
                      animation: "floatUp 0.4s ease-out forwards",
                    }}
                  >
                    {effect.type}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        @keyframes popIn {
          from { transform: scale(0.3); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes floatUp {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(-30px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
