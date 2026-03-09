"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import type { FarcasterUser } from "@/hooks/useFarcaster";
import { BF_PER_USDC_FALLBACK } from "@/lib/pricing";
import {
  BEE_LABELS,
  BEE_DURATIONS,
  calculatePrizeUsdc,
  capLabel,
  DIFFICULTY_CONFIG,
  FUCHSIA_MAX_PER_GAME,
  getEffectivePayoutPoints,
  getFastChance,
  getFastLimit,
  getFuchsiaChance,
  getFullValueThreshold,
  getWaveSpawnCount,
  LIVE_POINT_VALUES,
  SUPER_BEE_BONUS_BF,
  getSuperChance,
  type Difficulty,
} from "@/lib/gameRules";
import {
  claimPrize,
  createGameSession,
  finishGameSession,
  payGameFee,
  verifyGameFeeSession,
} from "@/lib/payments";

interface Bee {
  id: number;
  slot: number;
  type: "normal" | "fast" | "fuchsia" | "bomb" | "super";
  visible: boolean;
  hit: boolean;
}

interface Props {
  user: FarcasterUser;
  difficulty: Difficulty;
  onGameEnd: (score: number, prize: number) => void;
}

type HitStats = {
  normal: number;
  fast: number;
  fuchsia: number;
  bomb: number;
  super: number;
};

type GameSessionInfo = {
  gameId: string;
  gameSecret: string;
  capMultiplier: number;
  capLabel: string;
  capIcon: string;
  capScore: number;
};

const SLOTS = 9;
const BEE_DISPLAY_NAMES = BEE_LABELS;

export default function GameScreen({ user, difficulty, onGameEnd }: Props) {
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const [session, setSession] = useState<GameSessionInfo | null>(null);
  const [bees, setBees] = useState<Bee[]>([]);
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<"countdown" | "playing" | "ended">("countdown");
  const [countdown, setCountdown] = useState(3);
  const [hitEffects, setHitEffects] = useState<{ id: number; slot: number; text: string }[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | "failed">("pending");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentErrorCode, setPaymentErrorCode] = useState<string | null>(null);
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  const [feeStatus, setFeeStatus] = useState<"waiting" | "preparing" | "paying" | "paid" | "failed">("waiting");
  const [feeError, setFeeError] = useState<string | null>(null);
  const [superBonus, setSuperBonus] = useState(0);
  const [bfPerUsdc, setBfPerUsdc] = useState(BF_PER_USDC_FALLBACK);
  const [hitStats, setHitStats] = useState<HitStats>({ normal: 0, fast: 0, fuchsia: 0, bomb: 0, super: 0 });
  const [capScore, setCapScore] = useState(cfg.maxPts);
  const [capInfo, setCapInfo] = useState(capLabel(1));
  const [ticketCount, setTicketCount] = useState(0);
  const [currentWave, setCurrentWave] = useState(0);

  const beeIdRef = useRef(0);
  const scoreRef = useRef(0);
  const effectIdRef = useRef(0);
  const feeTxHashRef = useRef<string | null>(null);
  const bonusRef = useRef(0);
  const superSpawnedRef = useRef(false);
  const fuchsiaCountRef = useRef(0);
  const capScoreRef = useRef<number>(cfg.maxPts);
  const shouldSpawnSuperRef = useRef(false);
  const gameStartedRef = useRef(false);
  const endTriggeredRef = useRef(false);
  const nextWaveQueuedRef = useRef(false);

  const addHitEffect = useCallback((slot: number, text: string) => {
    const id = effectIdRef.current++;
    setHitEffects((prev) => [...prev, { id, slot, text }]);
    setTimeout(() => setHitEffects((prev) => prev.filter((effect) => effect.id !== id)), 500);
  }, []);

  useEffect(() => {
    fetch("/api/price")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.bfPerUsdc === "number" && d.bfPerUsdc > 0) setBfPerUsdc(d.bfPerUsdc);
      })
      .catch(() => {});
  }, []);

  const spawnBees = useCallback((count: number, ensureRed: boolean) => {
    setBees((prev) => {
      let next = prev.filter((bee) => bee.visible);
      const usedSlots = new Set(next.filter((bee) => bee.visible && !bee.hit).map((bee) => bee.slot));
      let bombPlaced = 0;
      let fastPlaced = 0;
      let fuchsiaPlaced = false;
      const capMultiplier = session?.capMultiplier || 1;
      const fastLimit = getFastLimit(capMultiplier);
      const fuchsiaChance = getFuchsiaChance(capMultiplier);
      const fastChance = getFastChance(difficulty, capMultiplier);
      const bombTarget = ensureRed ? 1 : 0;
      const spawnCount = count;

      for (let i = 0; i < spawnCount; i += 1) {
        const available = Array.from({ length: SLOTS }, (_, idx) => idx).filter((slot) => !usedSlots.has(slot));
        if (available.length === 0) break;

        const slot = available[Math.floor(Math.random() * available.length)];
        const rand = Math.random();

        let type: Bee["type"] = "normal";
        if (bombPlaced < bombTarget) {
          type = "bomb";
          bombPlaced += 1;
        } else if (shouldSpawnSuperRef.current && !superSpawnedRef.current) {
          type = "super";
          superSpawnedRef.current = true;
        } else if (!fuchsiaPlaced && fuchsiaCountRef.current < FUCHSIA_MAX_PER_GAME && rand < fuchsiaChance) {
          type = "fuchsia";
          fuchsiaPlaced = true;
          fuchsiaCountRef.current += 1;
        } else if (fastPlaced < fastLimit && rand < fastChance) {
          type = "fast";
          fastPlaced += 1;
        }

        const id = beeIdRef.current++;
        const duration = BEE_DURATIONS[difficulty][type];

        setTimeout(() => setBees((current) => current.filter((bee) => bee.id !== id)), duration);
        next = [...next, { id, slot, type, visible: true, hit: false }];
        usedSlots.add(slot);
      }
      return next;
    });
  }, [difficulty, session]);

  const whackBee = useCallback((bee: Bee) => {
    if (bee.hit || !bee.visible) return;
    setBees((prev) => prev.map((entry) => entry.id === bee.id ? { ...entry, hit: true } : entry));
    setTimeout(() => setBees((prev) => prev.filter((entry) => entry.id !== bee.id)), 150);
    setHitStats((prev) => ({ ...prev, [bee.type]: prev[bee.type] + 1 }));

    const pointsTable = LIVE_POINT_VALUES[difficulty];
    let points = 0;
    let text = "";
    if (bee.type === "normal") { points = pointsTable.normal; text = `+${points}`; }
    else if (bee.type === "fast") { points = pointsTable.fast; text = `⚡ +${points}`; }
    else if (bee.type === "fuchsia") { points = pointsTable.fuchsia; text = `💖 +${points}`; }
    else if (bee.type === "bomb") { points = pointsTable.bomb; text = `💥 ${points}`; }
    else if (bee.type === "super") {
      points = pointsTable.super;
      text = "💜 +100K BF";
      const bonusUsdc = SUPER_BEE_BONUS_BF / bfPerUsdc;
      bonusRef.current = parseFloat((bonusRef.current + bonusUsdc).toFixed(6));
      setSuperBonus(bonusRef.current);
    }

    addHitEffect(bee.slot, text);
    const nextScore = scoreRef.current + points;
    scoreRef.current = Math.max(0, Math.min(nextScore, capScoreRef.current));
    setScore(scoreRef.current);
  }, [addHitEffect, bfPerUsdc, difficulty]);

  useEffect(() => {
    if (gameStartedRef.current) return;
    gameStartedRef.current = true;
    void (async () => {
      try {
        setFeeStatus("preparing");
        const created = await createGameSession(difficulty, user.address);
        setSession(created);
        capScoreRef.current = created.capScore;
        setCapScore(created.capScore);
        setCapInfo({ icon: created.capIcon, label: created.capLabel });
        shouldSpawnSuperRef.current = Math.random() < getSuperChance(created.capMultiplier);
        setFeeStatus("paying");
        const payment = await payGameFee(cfg.fee);
        if (!payment.success || !payment.txHash) {
          setFeeStatus("failed");
          setFeeError(payment.error || "Payment failed");
          return;
        }
        feeTxHashRef.current = payment.txHash;
        await verifyGameFeeSession({
          gameId: created.gameId,
          gameSecret: created.gameSecret,
          txHash: payment.txHash as `0x${string}`,
          fid: user.fid,
          username: user.username,
          displayName: user.displayName,
          pfpUrl: user.pfpUrl,
        });
        setFeeStatus("paid");
      } catch (error) {
        setFeeStatus("failed");
        setFeeError(error instanceof Error ? error.message : "Game initialization failed");
      }
    })();
  }, [cfg.fee, difficulty, user]);

  useEffect(() => {
    if (feeStatus !== "paid") return;
    if (gameState !== "countdown") return;
    if (countdown <= 0) {
      const start = setTimeout(() => {
        endTriggeredRef.current = false;
        nextWaveQueuedRef.current = false;
        setCurrentWave(0);
        setBees([]);
        setGameState("playing");
      }, 0);
      return () => clearTimeout(start);
    }
    const t = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, feeStatus, gameState]);

  const handleGameEnd = useCallback(async () => {
    const shownScore = scoreRef.current;
    if (!session) {
      setPaymentStatus("failed");
      setPaymentError("Missing game session");
      return;
    }

    try {
      const finished = await finishGameSession({
        gameId: session.gameId,
        gameSecret: session.gameSecret,
        score: shownScore,
        hitStats,
      });
      setTicketCount(Number(finished.ticketCount || 0));
      const prize = Number(finished.prizeUsdc || 0);
      if (prize <= 0) {
        setPaymentStatus("paid");
        setPaymentNote("No payout required");
        return;
      }

      const claim = await claimPrize(session.gameId, session.gameSecret);
      if (claim.success) {
        setPaymentStatus("paid");
        setPaymentError(null);
        setPaymentErrorCode(null);
        setPaymentNote("Prize: paid · Pot: added");
      } else {
        setPaymentStatus("failed");
        setPaymentError(claim.error || "Claim failed");
        setPaymentErrorCode(claim.errorCode || null);
        setPaymentNote(`Prize: ${claim.prizeStatus === "paid" ? "paid" : "not paid"} · Pot: ${claim.potStatus === "added" ? "added" : "not added"}`);
      }
    } catch (error) {
      setPaymentStatus("failed");
      setPaymentError(error instanceof Error ? error.message : "Game finish failed");
      setPaymentErrorCode("GAME_FINISH_FAILED");
      setPaymentNote("Prize: not paid · Pot: not added");
    }
  }, [hitStats, session]);

  useEffect(() => {
    if (gameState !== "playing" || !session) return;
    if (currentWave >= cfg.waves) return;
    if (currentWave > 0 && bees.length > 0) return;
    if (nextWaveQueuedRef.current) return;

    nextWaveQueuedRef.current = true;
    let fired = false;
    const t = setTimeout(() => {
      fired = true;
      nextWaveQueuedRef.current = false;
      const count = getWaveSpawnCount(difficulty, session.capMultiplier);
      spawnBees(count, true);
      setCurrentWave((value) => value + 1);
    }, 0);
    return () => {
      clearTimeout(t);
      if (!fired) nextWaveQueuedRef.current = false;
    };
  }, [bees.length, cfg.waves, currentWave, difficulty, gameState, session, spawnBees]);

  useEffect(() => {
    if (gameState !== "playing") return;
    if (currentWave < cfg.waves) return;
    if (bees.length > 0) return;
    if (endTriggeredRef.current) return;
    endTriggeredRef.current = true;
    const finish = setTimeout(() => {
      setGameState("ended");
      void handleGameEnd();
    }, 60);
    return () => clearTimeout(finish);
  }, [bees.length, cfg.waves, currentWave, gameState, handleGameEnd]);

  const progressPercent = Math.min(100, Math.round((currentWave / cfg.waves) * 100));
  const prize = calculatePrizeUsdc(score, difficulty, superBonus);
  const effectivePoints = getEffectivePayoutPoints(score, difficulty);
  const prizeBfGross = Math.round(prize * bfPerUsdc);
  const prizeBfNet = Math.round(prizeBfGross * 0.945);
  const shortPaymentError = paymentError
    ? (paymentError.includes("replacement transaction underpriced")
      ? "Network busy. Please try again later."
      : paymentError.split("\n")[0].slice(0, 220))
    : null;
  const ticketEstimate = paymentStatus === "paid" ? ticketCount : 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://whack-a-bee.vercel.app";
  const pct = Math.round((score / capScore) * 100);
  const displayedWave = Math.min(currentWave + 1, cfg.waves);
  const weeklyBf = Math.floor(prizeBfGross * 0.045);
  const burnBf = Math.floor(prizeBfGross * 0.01);
  const payoutRows = [
    { label: "Game ID", value: session?.gameId || "—", tone: "#fef3c7", mono: true },
    { label: "Game Difficulty", value: `${cfg.emoji} ${cfg.label}`, tone: cfg.color },
    { label: "Game Type", value: `${capInfo.icon} ${capInfo.label}`, tone: "#c084fc" },
    { label: "Win", value: `${prizeBfNet.toLocaleString()} BF`, tone: "#34d399" },
    { label: "Weekly", value: `${weeklyBf.toLocaleString()} BF`, tone: "#fbbf24" },
    { label: "Burn", value: `${burnBf.toLocaleString()} BF`, tone: "#f87171" },
  ];
  const shareImage = `${appUrl}/api/share-image?score=${score}&pct=${pct}&prizeBf=${prizeBfNet}&fee=${cfg.fee}&difficulty=${cfg.label}&tickets=${ticketEstimate}&waves=${cfg.waves}&v=4`;
  const shareText = `I just cleared ${cfg.waves} waves on Whack-a-Butterfly by @Thec1, entered a ${cfg.fee} USDC ${cfg.label} run, hit ${pct}% of the cap and won ${prizeBfNet} BF plus ${ticketEstimate} weekly tickets. Can you beat it?`;

  if (["waiting", "preparing", "paying"].includes(feeStatus)) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-6 p-6" style={{ background: "#1a0a00" }}>
        <div className="text-6xl animate-bounce">💳</div>
        <h2 className="text-2xl font-black text-white">Confirm Payment</h2>
        <div className="w-full max-w-xs rounded-2xl p-5 border border-amber-800" style={{ background: "#2a1500" }}>
          <div className="text-center">
            <div className="text-amber-500 text-xs uppercase tracking-widest mb-1">Game Fee</div>
            <div className="text-4xl font-black text-amber-400">{cfg.fee} USDC</div>
            <div className="text-amber-700 text-xs mt-1">{cfg.emoji} {cfg.label} Mode · {cfg.waves} waves</div>
          </div>
        </div>
        <div className="text-amber-400 text-sm animate-pulse">
          {feeStatus === "preparing" ? "⏳ Preparing secure game session..." : "⏳ Waiting for wallet confirmation..."}
        </div>
        <button onClick={() => onGameEnd(0, 0)} className="text-amber-700 text-sm underline">Cancel</button>
      </div>
    );
  }

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
        <div className="text-amber-400 text-sm">✅ Fee verified · Secure game ID active</div>
        <div className="text-amber-400 text-xs">{capInfo.icon} Max prize was {capInfo.label}</div>
        <div className="text-amber-500 text-xs">{cfg.waves} waves · full-value band up to {getFullValueThreshold(difficulty)} pts</div>
        <div className="text-9xl font-black text-amber-400 animate-pulse">{countdown || "GO!"}</div>
      </div>
    );
  }

  if (gameState === "ended") {
    return (
      <div className="user-page-bg min-h-dvh p-4">
        <div className="max-w-sm mx-auto flex flex-col gap-4 pb-6">
          <div className="user-page-chrome rounded-[28px] px-5 py-5 text-center">
            <div className="text-5xl">{prizeBfNet > 0 ? "🎉" : "😔"}</div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.35em] text-amber-300">Payout Summary</div>
            <h2 className="mt-2 text-3xl font-black text-white">Game Over</h2>
            <div className="mt-4 text-6xl font-black text-amber-300">{prizeBfNet.toLocaleString()}</div>
            <div className="text-sm font-bold text-emerald-300">BF won</div>
            <div className="mt-3 text-amber-100 text-sm">
              {score} points · {effectivePoints.toFixed(2)} effective payout points
            </div>
            <div className="mt-1 text-amber-200/80 text-xs">
              {cfg.waves}/{cfg.waves} waves cleared · {pct}% of cap
            </div>
            <div className="mt-4 h-2 rounded-full bg-amber-950/80 border border-amber-900 overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, #f87171 0%, #fbbf24 52%, #34d399 100%)",
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {payoutRows.map((row) => (
              <div
                key={row.label}
                className="user-page-chrome rounded-2xl px-4 py-3 border"
                style={{ borderColor: "rgba(251,191,36,0.18)" }}
              >
                <div className="text-[10px] uppercase tracking-[0.24em] text-amber-400/80">{row.label}</div>
                <div
                  className={`mt-2 text-sm font-black ${row.mono ? "font-mono break-all text-[12px] leading-4" : ""}`}
                  style={{ color: row.tone }}
                >
                  {row.value}
                </div>
              </div>
            ))}
          </div>

          <div className="user-page-chrome rounded-[24px] px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.3em] text-amber-300">Run Details</div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <MetricTile label="Gross" value={`${prizeBfGross.toLocaleString()} BF`} tone="#fbbf24" />
              <MetricTile label="Tickets" value={`${ticketCount}`} tone="#fde68a" />
              <MetricTile label="Fee" value={`${cfg.fee} USDC`} tone="#c4b5fd" />
            </div>
            <div className="mt-3 text-[11px] text-amber-200/80">
              Bands: full value to {getFullValueThreshold(difficulty)} pts, then payout weight drops. Split: 94.5% win / 4.5% weekly / 1% burn.
            </div>
            {superBonus > 0 && (
              <div className="mt-2 text-xs text-purple-200">Prizefly bonus +{Math.round(superBonus * bfPerUsdc)} BF</div>
            )}
            {prizeBfNet > 0 && (
              <div className={`mt-3 text-xs font-bold rounded-xl px-3 py-2 ${paymentStatus === "paid" ? "bg-green-900/80 text-green-300" : paymentStatus === "failed" ? "bg-red-900/80 text-red-300" : "bg-amber-900/80 text-amber-300"}`}>
                {paymentStatus === "paid" ? `✅ ${paymentNote || "Payment sent"}` : paymentStatus === "failed" ? "❌ Payment error" : "⏳ Processing..."}
              </div>
            )}
            {paymentStatus === "failed" && paymentError && (
              <div className="mt-2 text-[11px] text-red-200 whitespace-pre-wrap break-words">
                {paymentErrorCode ? `[${paymentErrorCode}] ` : ""}{shortPaymentError}
              </div>
            )}
            {paymentStatus === "failed" && paymentNote && (
              <div className="mt-1 text-[11px] text-amber-200">{paymentNote}</div>
            )}
          </div>

          <div className="user-page-chrome rounded-[24px] px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.3em] text-amber-300">Hit Counter</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <CounterRow label={BEE_DISPLAY_NAMES.normal} value={hitStats.normal} />
              <CounterRow label={BEE_DISPLAY_NAMES.fast} value={hitStats.fast} />
              <CounterRow label={BEE_DISPLAY_NAMES.fuchsia} value={hitStats.fuchsia} />
              <CounterRow label={BEE_DISPLAY_NAMES.bomb} value={hitStats.bomb} />
              <CounterRow label={BEE_DISPLAY_NAMES.super} value={hitStats.super} />
            </div>
          </div>

          <button
            onClick={async () => {
              try {
                await sdk.actions.composeCast({ text: `${shareText}\n${appUrl}`, embeds: [shareImage] });
              } catch (error) {
                console.error("Share error", error);
              }
            }}
            className="w-full py-3.5 rounded-2xl text-sm font-black text-black flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
          >
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black" style={{ background: "#6d28d9", color: "#fff" }}>f</span>
            Share to Farcaster
          </button>

          <button
            onClick={() => onGameEnd(scoreRef.current, prize)}
            className="w-full py-4 rounded-2xl text-lg font-black text-black"
            style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const honeyBg = "url(/back-portrait.png)";
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: honeyBg, backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="text-center min-w-[60px]">
          <div className="text-xs text-amber-600 uppercase">Score</div>
          <div className="text-2xl font-black text-amber-400">{score}</div>
        </div>

        <div className="flex-1">
          <div className="h-4 bg-amber-950 rounded-full overflow-hidden border border-amber-900">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progressPercent}%`, background: cfg.color }} />
          </div>
          <div className="text-center text-xs mt-0.5" style={{ color: cfg.color }}>Wave {displayedWave} / {cfg.waves}</div>
        </div>

        <div className="text-center min-w-[60px]">
          <div className="text-xs text-amber-600 uppercase">Prize</div>
          <div className="text-lg font-black text-green-400">{prizeBfNet.toLocaleString()}</div>
          <div className="text-xs text-green-700">BF</div>
        </div>
      </div>

      {session && session.capMultiplier >= 3 && (
        <div className="mx-4 mb-2 rounded-xl border border-purple-700 bg-purple-900/40 text-purple-200 text-xs font-black text-center py-1">
          💥 MEGA JACKPOT ROUND — 3× CAP
        </div>
      )}

      <div className="text-center text-xs mb-2" style={{ color: cfg.color }}>
        {cfg.emoji} {cfg.label} · max {capScore} pt
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="grid grid-cols-3 gap-3 w-full max-w-xs" style={{ touchAction: "none" }}>
          {Array.from({ length: SLOTS }, (_, slot) => {
            const bee = bees.find((entry) => entry.slot === slot && entry.visible);
            const effect = hitEffects.find((entry) => entry.slot === slot);
            return (
              <div
                key={slot}
                onPointerDown={() => bee && whackBee(bee)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  if (bee) whackBee(bee);
                }}
                className="relative aspect-square rounded-2xl flex items-center justify-center cursor-pointer active:scale-90 transition-transform select-none"
                style={{
                  background: bee
                    ? (bee.type === "bomb" ? "#7f1d1d" : bee.type === "fast" ? "#1e3a5f" : bee.type === "fuchsia" ? "#3b0a24" : bee.type === "super" ? "#2a1540" : "#2a1500")
                    : "#1a0a00",
                  border: `2px solid ${bee ? (bee.type === "bomb" ? "#dc2626" : bee.type === "fast" ? "#3b82f6" : bee.type === "fuchsia" ? "#ec4899" : bee.type === "super" ? "#a855f7" : "#92400e") : "#2a1000"}`,
                  boxShadow: bee ? "0 0 12px rgba(251,191,36,0.25)" : "none",
                }}
              >
                {bee && (
                  <img
                    src="/bf.png"
                    alt=""
                    className="w-14 h-14 select-none pointer-events-none"
                    style={{
                      opacity: bee.hit ? 0 : 1,
                      transition: "opacity 0.15s",
                      filter:
                        bee.type === "fast" ? "hue-rotate(180deg)" :
                        bee.type === "fuchsia" ? "hue-rotate(310deg) saturate(2) drop-shadow(0 0 6px rgba(236,72,153,0.9))" :
                        bee.type === "bomb" ? "hue-rotate(330deg) saturate(2)" :
                        bee.type === "super" ? "hue-rotate(260deg) saturate(2) drop-shadow(0 0 6px rgba(168,85,247,0.8))" :
                        undefined,
                    }}
                  />
                )}
                {effect && (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-sm font-black pointer-events-none"
                    style={{ color: effect.text.includes("-") ? "#ef4444" : "#4ade80", animation: "floatUp 0.5s ease-out forwards" }}
                  >
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

function MetricTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl px-3 py-3 border border-amber-900/50" style={{ background: "rgba(20, 10, 0, 0.42)" }}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-amber-400/80">{label}</div>
      <div className="mt-2 text-sm font-black" style={{ color: tone }}>{value}</div>
    </div>
  );
}

function CounterRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl px-3 py-2 border border-amber-900/45" style={{ background: "rgba(20, 10, 0, 0.34)" }}>
      <div className="text-amber-200">{label}</div>
      <div className="mt-1 text-amber-300 font-black">{value}</div>
    </div>
  );
}
