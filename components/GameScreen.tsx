"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { FarcasterUser } from "@/hooks/useFarcaster";
import { DIFFICULTY_CONFIG, PRIZE_PER_POINT, type Difficulty } from "./App";
import { payGameFee, claimPrize, getAddress } from "@/lib/payments";

interface Bee {
  id: number;
  slot: number;
  type: "normal" | "fast" | "bomb";
  visible: boolean;
  hit: boolean;
}

interface Props {
  user: FarcasterUser;
  difficulty: Difficulty;
  onGameEnd: (score: number, prize: number) => void;
}

const SLOTS = 9;

const BEE_CHANCES = {
  easy: { bomb: 0.07, fast: 0.22 },
  medium: { bomb: 0.10, fast: 0.25 },
  hard: { bomb: 0.18, fast: 0.30 },
} as const;

const SPAWN_CONFIG = {
  easy: { base: 900, min: 450, step: 16 },
  medium: { base: 820, min: 420, step: 18 },
  hard: { base: 720, min: 380, step: 22 },
} as const;

export default function GameScreen({ user, difficulty, onGameEnd }: Props) {
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const [bees, setBees] = useState<Bee[]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(cfg.time);
  const [gameState, setGameState] = useState<"countdown" | "playing" | "ended">("countdown");
  const [countdown, setCountdown] = useState(3);
  const [hitEffects, setHitEffects] = useState<{ id: number; slot: number; text: string }[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | "failed">("pending");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [feeStatus, setFeeStatus] = useState<"waiting" | "paying" | "paid" | "failed">("waiting");
  const [feeError, setFeeError] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);

  const beeIdRef = useRef(0);
  const scoreRef = useRef(0);
  const effectIdRef = useRef(0);

  const addHitEffect = useCallback((slot: number, text: string) => {
    const id = effectIdRef.current++;
    setHitEffects(prev => [...prev, { id, slot, text }]);
    setTimeout(() => setHitEffects(prev => prev.filter(e => e.id !== id)), 500);
  }, []);

  const spawnBee = useCallback(() => {
    setBees(prev => {
      const usedSlots = new Set(prev.filter(b => b.visible && !b.hit).map(b => b.slot));
      const available = Array.from({ length: SLOTS }, (_, i) => i).filter(s => !usedSlots.has(s));
      if (available.length === 0) return prev;

      const slot = available[Math.floor(Math.random() * available.length)];
      const rand = Math.random();

      // More red bees on harder difficulties
      const bombChance = BEE_CHANCES[difficulty].bomb;
      const fastChance = BEE_CHANCES[difficulty].fast;

      const type: Bee["type"] = rand < bombChance ? "bomb" : rand < bombChance + fastChance ? "fast" : "normal";
      const id = beeIdRef.current++;

      const duration = difficulty === "easy"
        ? (type === "fast" ? 1200 : 1500)
        : difficulty === "medium"
        ? (type === "fast" ? 900 : 1100)
        : (type === "fast" ? 650 : 850);

      setTimeout(() => setBees(p => p.filter(b => b.id !== id)), duration);
      return [...prev.filter(b => b.visible), { id, slot, type, visible: true, hit: false }];
    });
  }, [difficulty]);

  const whackBee = useCallback((bee: Bee) => {
    if (bee.hit || !bee.visible) return;
    setBees(prev => prev.map(b => b.id === bee.id ? { ...b, hit: true } : b));
    setTimeout(() => setBees(prev => prev.filter(b => b.id !== bee.id)), 150);

    let points = 0;
    let text = "";
    if (bee.type === "normal") { points = 1; text = "+1"; }
    else if (bee.type === "fast") { points = 3; text = "⚡ +3"; }
    else if (bee.type === "bomb") { points = -2; text = "💥 -2"; }

    addHitEffect(bee.slot, text);
    scoreRef.current = Math.max(0, Math.min(scoreRef.current + points, cfg.maxPts));
    setScore(scoreRef.current);
  }, [addHitEffect, cfg.maxPts]);

  // Pay fee before starting countdown
  useEffect(() => {
    if (gameStarted) return;
    setGameStarted(true);
    handlePayFee();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePayFee() {
    setFeeStatus("paying");
    const result = await payGameFee(cfg.fee);
    if (result.success) {
      setFeeStatus("paid");
    } else {
      setFeeStatus("failed");
      setFeeError(result.error || "Payment failed");
    }
  }

  // Countdown — only starts after fee is paid
  useEffect(() => {
    if (feeStatus !== "paid") return;
    if (gameState !== "countdown") return;
    if (countdown <= 0) { setGameState("playing"); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, gameState, feeStatus]);

  // Timer
  useEffect(() => {
    if (gameState !== "playing") return;
    if (timeLeft <= 0) {
      setGameState("ended");
      handleGameEnd();
      return;
    }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, gameState]);

  // Spawn interval — speeds up over time
  useEffect(() => {
    if (gameState !== "playing") return;
    const elapsed = cfg.time - timeLeft;
    const { base, min, step } = SPAWN_CONFIG[difficulty];
    const interval = Math.max(min, base - elapsed * step);
    const t = setTimeout(spawnBee, interval);
    return () => clearTimeout(t);
  }, [timeLeft, gameState, spawnBee, cfg.time]);

  async function handleGameEnd() {
    const finalScore = scoreRef.current;
    const adjustedScore = finalScore;
    const prize = parseFloat((adjustedScore * PRIZE_PER_POINT).toFixed(4));
    const fee = cfg.fee;
    const address = await getAddress();

    // Submit score
    try {
      await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: user.fid,
          username: user.username,
          displayName: user.displayName,
          pfpUrl: user.pfpUrl,
          score: adjustedScore,
          prize,
          fee,
          address,
          difficulty,
        }),
      });
    } catch (e) {
      console.error("Submit score error:", e);
    }

    // Pay prize if player scored
    if (prize > 0) {
      if (address) {
        const result = await claimPrize(address, prize);
        if (result.success) {
          setPaymentStatus("paid");
          setPaymentError(null);
        } else {
          setPaymentStatus("failed");
          setPaymentError(result.error || "Payment error");
        }
      } else {
        setPaymentStatus("failed");
        setPaymentError("No wallet connected");
      }
    } else {
      setPaymentStatus("paid");
      setPaymentError(null);
    }

    setTimeout(() => onGameEnd(adjustedScore, prize), 3000);
  }

  const timerPercent = (timeLeft / cfg.time) * 100;
  const timerColor = timeLeft > 8 ? "#fbbf24" : "#ef4444";
  const prize = parseFloat((score * PRIZE_PER_POINT).toFixed(4));

  // Fee payment screen
  if (feeStatus === "waiting" || feeStatus === "paying") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-6 p-6" style={{ background: "#1a0a00" }}>
        <div className="text-6xl animate-bounce">💳</div>
        <h2 className="text-2xl font-black text-white">Confirm Payment</h2>
        <div className="w-full max-w-xs rounded-2xl p-5 border border-amber-800" style={{ background: "#2a1500" }}>
          <div className="text-center">
            <div className="text-amber-500 text-xs uppercase tracking-widest mb-1">Game Fee</div>
            <div className="text-4xl font-black text-amber-400">{cfg.fee} USDC</div>
            <div className="text-amber-700 text-xs mt-1">{cfg.emoji} {cfg.label} Mode · {cfg.time}s</div>
          </div>
        </div>
        <div className="text-amber-400 text-sm animate-pulse">
          {feeStatus === "paying" ? "⏳ Waiting for wallet confirmation..." : "⏳ Initializing..."}
        </div>
        <button onClick={() => onGameEnd(0, 0)} className="text-amber-700 text-sm underline">Cancel</button>
      </div>
    );
  }

  // Fee failed screen
  if (feeStatus === "failed") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-6 p-6 text-center" style={{ background: "#1a0a00" }}>
        <div className="text-6xl">❌</div>
        <h2 className="text-2xl font-black text-white">Payment Failed</h2>
        <p className="text-red-400 text-sm max-w-xs">{feeError || "Transaction was rejected or failed."}</p>
        <button
          onClick={() => onGameEnd(0, 0)}
          className="w-full max-w-xs py-4 rounded-2xl text-lg font-black text-black"
          style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (gameState === "countdown") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4" style={{ background: "#1a0a00" }}>
        <div className="text-amber-500 text-sm font-bold uppercase tracking-widest">{cfg.emoji} {cfg.label} Mode</div>
        <div className="text-amber-400 text-sm">✅ Fee paid: {cfg.fee} USDC</div>
        <div className="text-9xl font-black text-amber-400 animate-pulse">{countdown || "GO!"}</div>
      </div>
    );
  }

  if (gameState === "ended") {
    const shownScore = scoreRef.current;
    const finalPrize = parseFloat((shownScore * PRIZE_PER_POINT).toFixed(4));
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center gap-4" style={{ background: "#1a0a00" }}>
        <div className="text-5xl">{finalPrize > 0 ? "🎉" : "😔"}</div>
        <h2 className="text-3xl font-black text-white">Game Over</h2>
        <div className="text-6xl font-black text-amber-400">{shownScore}</div>
        <div className="text-amber-600 text-sm">points out of {cfg.maxPts} max</div>

        <div className="w-full max-w-xs rounded-2xl p-4 border border-amber-800" style={{ background: "#2a1500" }}>
          <div className="text-xs text-amber-600 uppercase tracking-widest mb-2">Prize</div>
          <div className="text-3xl font-black text-amber-400">{finalPrize.toFixed(3)} USDC</div>
          <div className="text-xs text-amber-700 mt-1">{shownScore} pt × 0.001 USDC</div>

          {finalPrize > 0 && (
            <div className={`mt-3 text-xs font-bold rounded-lg p-2 ${
              paymentStatus === "paid" ? "bg-green-900 text-green-300" :
              paymentStatus === "failed" ? "bg-red-900 text-red-300" :
              "bg-amber-900 text-amber-300"
            }`}>
              {paymentStatus === "paid" ? "✅ Payment processing..." :
               paymentStatus === "failed" ? "❌ Payment error" :
               "⏳ Processing..."}
            </div>
          )}
          {paymentStatus === "failed" && paymentError && (
            <div className="mt-2 text-[11px] text-red-300 break-words">{paymentError}</div>
          )}
        </div>

        <div className="text-xs text-amber-800">Returning to home...</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "#1a0a00" }}>

      {/* HUD */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="text-center min-w-[60px]">
          <div className="text-xs text-amber-600 uppercase">Score</div>
          <div className="text-2xl font-black text-amber-400">{score}</div>
        </div>

        <div className="flex-1">
          <div className="h-4 bg-amber-950 rounded-full overflow-hidden border border-amber-900">
            <div className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${timerPercent}%`, background: timerColor }} />
          </div>
          <div className="text-center text-xs mt-0.5" style={{ color: timerColor }}>{timeLeft}s</div>
        </div>

        <div className="text-center min-w-[60px]">
          <div className="text-xs text-amber-600 uppercase">Prize</div>
          <div className="text-lg font-black text-green-400">{prize.toFixed(3)}</div>
          <div className="text-xs text-green-700">USDC</div>
        </div>
      </div>

      {/* Difficulty badge */}
      <div className="text-center text-xs mb-2" style={{ color: cfg.color }}>
        {cfg.emoji} {cfg.label} · max {cfg.maxPts} pt
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
                className="relative aspect-square rounded-2xl flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
                style={{
                  background: bee ? (bee.type === "bomb" ? "#7f1d1d" : bee.type === "fast" ? "#1e3a5f" : "#2a1500") : "#1a0a00",
                  border: `2px solid ${bee ? (bee.type === "bomb" ? "#dc2626" : bee.type === "fast" ? "#3b82f6" : "#92400e") : "#2a1000"}`,
                  boxShadow: bee ? "0 0 12px rgba(251,191,36,0.25)" : "none",
                }}
              >
                {bee && (
                  <span className="text-4xl select-none"
                    style={{
                      opacity: bee.hit ? 0 : 1,
                      transition: "opacity 0.15s",
                      filter: bee.type === "fast" ? "hue-rotate(180deg)" : undefined,
                    }}>
                    {bee.type === "bomb" ? "🐝🔴" : "🐝"}
                  </span>
                )}
                {effect && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-black pointer-events-none"
                    style={{
                      color: effect.text.includes("-") ? "#ef4444" : "#4ade80",
                      animation: "floatUp 0.5s ease-out forwards",
                    }}>
                    {effect.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        @keyframes floatUp {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(-35px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
