"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { sdk } from "@farcaster/miniapp-sdk";
import type { FarcasterUser } from "@/hooks/useFarcaster";
import { BF_PER_USDC_FALLBACK } from "@/lib/pricing";
import {
  BEE_LABELS,
  calculatePrizeUsdc,
  capLabel,
  DIFFICULTY_CONFIG,
  getFastChance,
  getFastLimit,
  getFuchsiaChance,
  getFullValueThreshold,
  getLivePointValuesForType,
  getPrizeflyBonusUsdc,
  getQuickLimit,
  getRunTypeConfig,
  getWaveTimeoutMs,
  type CapTypeKey,
  type Difficulty,
} from "@/lib/gameRules";
import UserPageHeader from "./UserPageHeader";
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
  wave: number;
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
  capType: CapTypeKey;
  capMultiplier: number;
  capLabel: string;
  capIcon: string;
  capScore: number;
  prizeEligible: boolean;
  prizeWaveIndex: number | null;
  waveTypes: CapTypeKey[];
  waveMultipliers: number[];
};

const SLOTS = 9;
const BEE_DISPLAY_NAMES = BEE_LABELS;
const ADMIN_WALLET = (
  process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe"
).toLowerCase();

export default function GameScreen({ user, difficulty, onGameEnd }: Props) {
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const [session, setSession] = useState<GameSessionInfo | null>(null);
  const [bees, setBees] = useState<Bee[]>([]);
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<"countdown" | "playing" | "ended">("countdown");
  const [countdown, setCountdown] = useState(3);
  const [hitEffects, setHitEffects] = useState<{ id: number; slot: number; text: string }[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "claimable" | "claiming" | "paid" | "failed">("idle");
  const [claimTapReady, setClaimTapReady] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentErrorCode, setPaymentErrorCode] = useState<string | null>(null);
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  const [feeStatus, setFeeStatus] = useState<"waiting" | "preparing" | "paying" | "paid" | "failed">("waiting");
  const [feeError, setFeeError] = useState<string | null>(null);
  const [superBonus, setSuperBonus] = useState(0);
  const [bfPerUsdc, setBfPerUsdc] = useState(BF_PER_USDC_FALLBACK);
  const [hitStats, setHitStats] = useState<HitStats>({ normal: 0, fast: 0, fuchsia: 0, bomb: 0, super: 0 });
  const [capScore, setCapScore] = useState(cfg.maxPts);
  const [capInfo, setCapInfo] = useState<{ icon: string; label: string }>(capLabel(1));
  const [ticketCount, setTicketCount] = useState(0);
  const [currentWave, setCurrentWave] = useState(0);
  const totalWaves = session?.waveTypes?.length ?? cfg.waves;

  const beeIdRef = useRef(0);
  const scoreRef = useRef(0);
  const effectIdRef = useRef(0);
  const feeTxHashRef = useRef<string | null>(null);
  const bonusRef = useRef(0);
  const superSpawnedRef = useRef(false);
  const tripleCountRef = useRef(0);
  const quickCountRef = useRef(0);
  const capScoreRef = useRef<number>(cfg.maxPts);
  const gameStartedRef = useRef(false);
  const endTriggeredRef = useRef(false);
  const nextWaveQueuedRef = useRef(false);
  const claimUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const getWaveTypeForIndex = useCallback((waveIndex: number): CapTypeKey => {
    if (!session) return "low";
    return session.waveTypes?.[waveIndex] ?? session.capType;
  }, [session]);

  const spawnBees = useCallback((waveType: CapTypeKey, waveIndex: number) => {
    setBees((prev) => {
      let next = prev.filter((bee) => bee.visible);
      const usedSlots = new Set(next.filter((bee) => bee.visible && !bee.hit).map((bee) => bee.slot));
      const tuning = getRunTypeConfig(difficulty, waveType);
      const bombTarget = Math.min(
        Math.max(1, tuning.maxButterfliesPerWave - 1),
        tuning.bombsBasePerWave + (Math.random() < tuning.bombsSecondChance ? 1 : 0)
      );
      const spawnCount = tuning.maxButterfliesPerWave;
      let bombPlaced = 0;
      let fastPlaced = 0;
      let quickPlaced = 0;
      const shouldSpawnSuper = !!session?.prizeEligible && session.prizeWaveIndex === waveIndex && !superSpawnedRef.current;
      const fastLimit = getFastLimit(difficulty, waveType);
      const quickLimit = getQuickLimit(difficulty, waveType);
      const quickChance = getFuchsiaChance(difficulty, waveType);
      const fastChance = getFastChance(difficulty, waveType);

      for (let i = 0; i < spawnCount; i += 1) {
        const available = Array.from({ length: SLOTS }, (_, idx) => idx).filter((slot) => !usedSlots.has(slot));
        if (available.length === 0) break;

        const slot = available[Math.floor(Math.random() * available.length)];
        const rand = Math.random();

        let type: Bee["type"] = "normal";
        if (bombPlaced < bombTarget) {
          type = "bomb";
          bombPlaced += 1;
        } else if (shouldSpawnSuper && !superSpawnedRef.current) {
          type = "super";
          superSpawnedRef.current = true;
        } else if (quickPlaced < quickLimit && quickCountRef.current < tuning.quickMaxPerGame && rand < quickChance) {
          type = "fuchsia";
          quickPlaced += 1;
          quickCountRef.current += 1;
        } else if (fastPlaced < fastLimit && tripleCountRef.current < tuning.tripleMaxPerGame && rand < fastChance) {
          type = "fast";
          fastPlaced += 1;
          tripleCountRef.current += 1;
        }

        const id = beeIdRef.current++;
        const duration = {
          normal: tuning.normalDurationMs,
          fast: tuning.tripleDurationMs,
          fuchsia: tuning.quickDurationMs,
          bomb: tuning.bombDurationMs,
          super: tuning.prizeDurationMs,
        }[type];

        setTimeout(() => setBees((current) => current.filter((bee) => bee.id !== id)), duration);
        next = [...next, { id, slot, wave: waveIndex, type, visible: true, hit: false }];
        usedSlots.add(slot);
      }
      return next;
    });
    setTimeout(() => {
      setBees((current) => current.filter((bee) => bee.wave !== waveIndex || bee.hit));
    }, getWaveTimeoutMs(difficulty, waveType));
  }, [difficulty, session]);

  const whackBee = useCallback((bee: Bee) => {
    if (bee.hit || !bee.visible) return;
    setBees((prev) => prev.map((entry) => entry.id === bee.id ? { ...entry, hit: true } : entry));
    setTimeout(() => setBees((prev) => prev.filter((entry) => entry.id !== bee.id)), 150);
    setHitStats((prev) => ({ ...prev, [bee.type]: prev[bee.type] + 1 }));

    const pointsTable = getLivePointValuesForType(difficulty, session?.capType || "low");
    let points = 0;
    let text = "";
    if (bee.type === "normal") { points = pointsTable.normal; text = `+${points}`; }
    else if (bee.type === "fast") { points = pointsTable.fast; text = `⚡ +${points}`; }
    else if (bee.type === "fuchsia") { points = pointsTable.fuchsia; text = `💖 +${points}`; }
    else if (bee.type === "bomb") { points = pointsTable.bomb; text = `💥 ${points}`; }
    else if (bee.type === "super") {
      points = pointsTable.super;
      text = "💜 PRIZE!";
      const bonusUsdc = session ? getPrizeflyBonusUsdc(difficulty, session.capType) : 0;
      bonusRef.current = parseFloat((bonusRef.current + bonusUsdc).toFixed(6));
      setSuperBonus(bonusRef.current);
    }

    addHitEffect(bee.slot, text);
    const nextScore = scoreRef.current + points;
    scoreRef.current = Math.max(0, Math.min(nextScore, capScoreRef.current));
    setScore(scoreRef.current);
  }, [addHitEffect, difficulty, session]);

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
        tripleCountRef.current = 0;
        quickCountRef.current = 0;
        superSpawnedRef.current = false;
        bonusRef.current = 0;
        setCurrentWave(0);
        setBees([]);
        setSuperBonus(0);
        setGameState("playing");
      }, 450);
      return () => clearTimeout(start);
    }
    const t = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, feeStatus, gameState]);

  useEffect(() => {
    return () => {
      if (claimUnlockTimerRef.current) clearTimeout(claimUnlockTimerRef.current);
    };
  }, []);

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
        setClaimTapReady(false);
        setPaymentNote("No payout required");
        setPaymentError(null);
        setPaymentErrorCode(null);
        return;
      }
      if (claimUnlockTimerRef.current) clearTimeout(claimUnlockTimerRef.current);
      setClaimTapReady(false);
      setPaymentStatus("claimable");
      setPaymentError(null);
      setPaymentErrorCode(null);
      setPaymentNote("Claim Prize unlocks in 1 second to let the session settle.");
      claimUnlockTimerRef.current = setTimeout(() => setClaimTapReady(true), 1000);
    } catch (error) {
      if (claimUnlockTimerRef.current) clearTimeout(claimUnlockTimerRef.current);
      setClaimTapReady(false);
      setPaymentStatus("failed");
      setPaymentError(error instanceof Error ? error.message : "Game finish failed");
      setPaymentErrorCode("GAME_FINISH_FAILED");
      setPaymentNote("Prize: not paid · Pot: not added");
    }
  }, [hitStats, session]);

  const handleClaimPrize = useCallback(async () => {
    if (!session || paymentStatus === "claiming") return;
    if (claimUnlockTimerRef.current) clearTimeout(claimUnlockTimerRef.current);
    setPaymentStatus("claiming");
    setClaimTapReady(false);
    setPaymentError(null);
    setPaymentErrorCode(null);
    try {
      const claim = await claimPrize(session.gameId, session.gameSecret);
      if (claim.success) {
        setPaymentStatus("paid");
        setClaimTapReady(false);
        setPaymentNote("Prize: paid · Pot: added");
        return;
      }
      setPaymentStatus("failed");
      setClaimTapReady(true);
      setPaymentError(claim.error || "Claim failed");
      setPaymentErrorCode(claim.errorCode || null);
      setPaymentNote(
        `Prize: ${claim.prizeStatus === "paid" ? "paid" : "not paid"} · Pot: ${claim.potStatus === "added" ? "added" : "not added"}`
      );
    } catch (error) {
      setPaymentStatus("failed");
      setClaimTapReady(true);
      setPaymentError(error instanceof Error ? error.message : "Claim failed");
      setPaymentErrorCode("CLAIM_FAILED");
      setPaymentNote("Prize: not paid · Pot: not added");
    }
  }, [paymentStatus, session]);

  useEffect(() => {
    if (gameState !== "playing" || !session) return;
    if (currentWave >= totalWaves) return;
    if (currentWave > 0 && bees.length > 0) return;
    if (nextWaveQueuedRef.current) return;

    nextWaveQueuedRef.current = true;
    let fired = false;
    const t = setTimeout(() => {
      fired = true;
      nextWaveQueuedRef.current = false;
      const waveType = getWaveTypeForIndex(currentWave);
      spawnBees(waveType, currentWave);
      setCurrentWave((value) => value + 1);
    }, 0);
    return () => {
      clearTimeout(t);
      if (!fired) nextWaveQueuedRef.current = false;
    };
  }, [bees.length, currentWave, difficulty, gameState, getWaveTypeForIndex, session, spawnBees, totalWaves]);

  useEffect(() => {
    if (gameState !== "playing") return;
    if (currentWave < totalWaves) return;
    if (bees.length > 0) return;
    if (endTriggeredRef.current) return;
    endTriggeredRef.current = true;
    const finish = setTimeout(() => {
      setGameState("ended");
      void handleGameEnd();
    }, 60);
    return () => clearTimeout(finish);
  }, [bees.length, currentWave, gameState, handleGameEnd, totalWaves]);

  const progressPercent = Math.min(100, Math.round((currentWave / totalWaves) * 100));
  const prize = calculatePrizeUsdc(score, difficulty, superBonus, session?.capType || "low");
  const prizeBfGross = Math.round(prize * bfPerUsdc);
  const prizeBfNet = Math.round(prizeBfGross * 0.945);
  const shortPaymentError = paymentError
    ? (paymentError.includes("replacement transaction underpriced")
      ? "Network busy. Please try again later."
      : paymentError.split("\n")[0].slice(0, 220))
    : null;
  const ticketEstimate = ticketCount;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://whack-a-bee.vercel.app";
  const pct = Math.round((score / capScore) * 100);
  const displayedWave = Math.min(currentWave + 1, totalWaves);
  const activeWaveIndex = Math.max(0, Math.min(totalWaves - 1, currentWave - 1));
  const activeWaveType = getWaveTypeForIndex(activeWaveIndex);
  const activeWaveInfo = capLabel(1, activeWaveType);
  const weeklyBf = Math.floor(prizeBfGross * 0.045);
  const burnBf = Math.floor(prizeBfGross * 0.01);
  const payoutRows = [
    { label: "Game Difficulty", value: `${cfg.emoji} ${cfg.label}`, tone: cfg.color },
    { label: "Game Type", value: `${capInfo.icon} ${capInfo.label}`, tone: "#f8e7b4" },
    { label: "Weekly Pot Share", value: `${weeklyBf.toLocaleString()} BF`, tone: "#fbbf24" },
    { label: "Burn Share", value: `${burnBf.toLocaleString()} BF`, tone: "#f87171" },
  ];
  const shareQuery = new URLSearchParams({
    score: String(score),
    pct: String(pct),
    prizeBf: String(prizeBfNet),
    fee: String(cfg.fee),
    difficulty: cfg.label,
    type: capInfo.label,
    tickets: String(ticketEstimate),
    waves: String(totalWaves),
    v: "5",
  }).toString();
  const shareUrl = `${appUrl}/share/payout?${shareQuery}`;
  const shareText = `I just cleared ${totalWaves} waves in a ${capInfo.label} ${cfg.label} run on Whack-a-Butterfly by @Thec1 and won ${prizeBfNet} BF plus ${ticketEstimate} weekly tickets. Can you beat it?`;

  if (["waiting", "preparing", "paying"].includes(feeStatus)) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-6 p-6" style={{ background: "#07140d" }}>
        <div className="text-6xl animate-bounce">💳</div>
        <h2 className="text-2xl font-black text-white">Confirm Payment</h2>
        <div className="w-full max-w-xs rounded-2xl p-5 border border-emerald-300/20 bg-emerald-950/55 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-lime-200/80 text-xs uppercase tracking-widest mb-1">Game Fee</div>
            <div className="text-4xl font-black text-emerald-50">{cfg.fee} USDC</div>
            <div className="text-emerald-100/70 text-xs mt-1">{cfg.emoji} {cfg.label} Mode · {totalWaves} waves</div>
          </div>
        </div>
        <div className="text-lime-200 text-sm animate-pulse">
          {feeStatus === "preparing" ? "⏳ Preparing secure game session..." : "⏳ Waiting for wallet confirmation..."}
        </div>
        <button onClick={() => onGameEnd(0, 0)} className="text-emerald-100/75 text-sm underline">Cancel</button>
      </div>
    );
  }

  if (feeStatus === "failed") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-6 p-6 text-center" style={{ background: "#07140d" }}>
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

  if (gameState === "ended") {
    return (
      <div className="payout-page-bg min-h-dvh p-4">
        <div className="mx-auto flex max-w-sm flex-col gap-4 pb-6">
          <UserPageHeader
            user={user}
            isAdmin={user.address?.toLowerCase() === ADMIN_WALLET}
            showBack
            onBack={() => onGameEnd(scoreRef.current, prize)}
            rulesHref="/?screen=rules"
            leaderboardHref="/?screen=leaderboard"
            active="payout"
          />

          <div className="user-page-chrome rounded-[28px] px-5 py-5 text-center">
            <div className="text-4xl">{prizeBfNet > 0 ? "🎉" : "😔"}</div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.24em] text-lime-200/85">Payout Summary</div>
            <h2 className="mt-2 text-[2.1rem] leading-none font-black text-white">BF Won</h2>
            <div className="mt-4 text-[4.6rem] leading-[0.9] font-black text-lime-200 sm:text-[5.1rem]">{prizeBfNet.toLocaleString()}</div>
            <div className="mt-1 text-sm font-bold text-emerald-300">
              {prizeBfNet > 0
                ? paymentStatus === "paid"
                  ? "Claimed payout"
                  : paymentStatus === "claimable" || paymentStatus === "claiming" || paymentStatus === "failed"
                    ? "Claimable payout"
                    : "Finalizing payout"
                : "Run complete"}
            </div>
            <div className="mt-3 text-emerald-50 text-sm leading-5">
              {score} points made
            </div>
            <div className="mt-1 text-emerald-100/75 text-xs leading-5">
              {totalWaves}/{totalWaves} waves cleared
            </div>
            <div className="mt-4 h-2 rounded-full bg-emerald-950/80 border border-emerald-300/15 overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, #f87171 0%, #fbbf24 52%, #34d399 100%)",
                }}
              />
            </div>
          </div>

          <div
            className="user-page-chrome rounded-2xl px-4 py-3 border"
            style={{ borderColor: "rgba(134,239,172,0.18)" }}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-lime-200/70">Game ID</div>
            <div className="mt-2 font-mono text-[13px] leading-5 text-emerald-50 break-all">
              {session?.gameId || "—"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {payoutRows.map((row) => (
              <div
                key={row.label}
                className="user-page-chrome rounded-2xl px-4 py-3 border"
                style={{ borderColor: "rgba(134,239,172,0.18)" }}
              >
                <div className="text-[10px] uppercase tracking-[0.18em] text-lime-200/70">{row.label}</div>
                <div className="mt-2 text-[15px] leading-5 font-black" style={{ color: row.tone }}>
                  {row.value}
                </div>
              </div>
            ))}
            <div
              className="user-page-chrome rounded-2xl px-4 py-3 border"
              style={{ borderColor: "rgba(134,239,172,0.18)" }}
            >
              <div className="text-[10px] uppercase tracking-[0.18em] text-lime-200/70">Tickets</div>
              <div className="mt-2 text-[15px] leading-5 font-black text-emerald-50">
                {ticketCount}
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  await sdk.actions.composeCast({ text: `${shareText}\n${appUrl}`, embeds: [shareUrl] });
                } catch (error) {
                  console.error("Share error", error);
                }
              }}
              className="user-page-chrome rounded-2xl border px-4 py-3 text-left"
              style={{ borderColor: "rgba(168,85,247,0.35)" }}
            >
              <div className="flex items-center gap-3">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full shadow-[0_6px_18px_rgba(76,29,149,0.35)]">
                  <Image src="/farcaster-share.svg" alt="" fill sizes="48px" className="object-cover" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-violet-200/80">Share</span>
                  <span className="mt-1 block text-[15px] leading-5 font-black text-violet-100">Share to Farcaster</span>
                </span>
              </div>
            </button>
          </div>

          {prizeBfNet > 0 && ["claimable", "claiming", "failed"].includes(paymentStatus) && (
            <button
              type="button"
              onClick={() => void handleClaimPrize()}
              disabled={paymentStatus === "claiming" || !claimTapReady}
              className="w-full rounded-[24px] px-4 py-4 text-lg font-black text-black disabled:opacity-60 disabled:cursor-wait"
              style={{ background: "linear-gradient(135deg, #f7bd2b, #ffdc72)" }}
            >
              {paymentStatus === "claiming"
                ? "Claiming Prize..."
                : paymentStatus === "failed"
                  ? "Retry Claim Prize"
                  : claimTapReady
                    ? "Claim Prize"
                    : "Claim Prize in 1s..."}
            </button>
          )}

          <div className="user-page-chrome rounded-[24px] px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-lime-200/85">Split</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <MetricTile label="Weekly" value="4.5%" tone="#fbbf24" />
              <MetricTile label="Burn" value="1%" tone="#f87171" />
            </div>
            <div className="mt-3 text-[11px] leading-5 text-emerald-100/75">
              Weekly pot share and burn share are derived from the gross payout before the player net amount is sent.
            </div>
            {superBonus > 0 && (
              <div className="mt-2 text-xs leading-5 text-purple-200">Prizefly bonus +{Math.round(superBonus * bfPerUsdc)} BF</div>
            )}
            {prizeBfNet > 0 && (
              <div className={`mt-3 text-sm font-bold rounded-xl px-3 py-2.5 leading-5 ${
                paymentStatus === "paid"
                  ? "bg-green-900/80 text-green-300"
                  : paymentStatus === "failed"
                    ? "bg-red-900/80 text-red-300"
                    : paymentStatus === "claiming"
                      ? "bg-emerald-900/80 text-emerald-200"
                      : "bg-sky-950/80 text-sky-200"
              }`}>
                {paymentStatus === "paid"
                  ? `✅ ${paymentNote || "Payment sent"}`
                  : paymentStatus === "failed"
                    ? "❌ Payment error"
                    : paymentStatus === "claiming"
                      ? "⏳ Claim transaction in progress..."
                      : `🪙 ${paymentNote || "Ready to claim"}`}
              </div>
            )}
            {paymentStatus === "failed" && paymentError && (
              <div className="mt-2 text-[12px] leading-5 text-red-200 whitespace-pre-wrap break-words">
                {paymentErrorCode ? `[${paymentErrorCode}] ` : ""}{shortPaymentError}
              </div>
            )}
            {paymentStatus === "failed" && paymentNote && (
              <div className="mt-1 text-[11px] leading-5 text-emerald-100/75">{paymentNote}</div>
            )}
          </div>

          <div className="user-page-chrome rounded-[24px] px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-lime-200/85">Hit Counter</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <CounterRow label={BEE_DISPLAY_NAMES.normal} value={hitStats.normal} />
              <CounterRow label={BEE_DISPLAY_NAMES.fast} value={hitStats.fast} />
              <CounterRow label={BEE_DISPLAY_NAMES.fuchsia} value={hitStats.fuchsia} />
              <CounterRow label={BEE_DISPLAY_NAMES.bomb} value={hitStats.bomb} />
              <CounterRow label={BEE_DISPLAY_NAMES.super} value={hitStats.super} />
            </div>
          </div>

        </div>
      </div>
    );
  }

  const honeyBg = "url(/back-portrait.png)";
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: honeyBg, backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="text-center min-w-[60px]">
          <div className="text-xs text-emerald-200/70 uppercase">Score</div>
          <div className="text-2xl font-black text-lime-200">{score}</div>
        </div>

        <div className="flex-1">
          <div className="h-4 bg-emerald-950 rounded-full overflow-hidden border border-emerald-300/20">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progressPercent}%`, background: cfg.color }} />
          </div>
          <div className="text-center text-xs mt-0.5" style={{ color: cfg.color }}>Wave {displayedWave} / {totalWaves}</div>
        </div>

        <div className="text-center min-w-[60px]">
          <div className="text-xs text-emerald-200/70 uppercase">Prize</div>
          <div className="text-lg font-black text-green-400">{prizeBfNet.toLocaleString()}</div>
          <div className="text-xs text-green-700">BF</div>
        </div>
      </div>

      {session && activeWaveType === "mega" && (
        <div className="mx-4 mb-2 rounded-xl border border-purple-700 bg-purple-900/40 text-purple-200 text-xs font-black text-center py-1">
          💥 MEGA JACKPOT ROUND
        </div>
      )}

      <div className="mx-4 mb-2">
        <div
          className="rounded-full border px-3 py-1.5 text-center text-[11px] font-black tracking-[0.18em] uppercase"
          style={{
            background: "rgba(6, 28, 17, 0.68)",
            borderColor: "rgba(134, 239, 172, 0.24)",
            color: "#f4fff5",
            textShadow: "0 1px 8px rgba(3, 19, 11, 0.32)",
          }}
        >
          {capInfo.icon} {capInfo.label} Run
        </div>
      </div>

      {session?.capType === "jolly" && (
        <div className="mx-4 mb-2 rounded-xl border border-violet-300/30 bg-[rgba(69,34,113,0.38)] text-violet-100 text-[11px] font-bold text-center py-1.5 shadow-[0_8px_18px_rgba(69,34,113,0.18)]">
          🃏 JOLLY WAVE: {activeWaveInfo.icon} {activeWaveInfo.label}
        </div>
      )}

      <div className="text-center text-xs mb-2" style={{ color: cfg.color }}>
        {cfg.emoji} {cfg.label} · max {capScore} pt
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="relative w-full max-w-xs">
          <div className="grid grid-cols-3 gap-3 w-full" style={{ touchAction: "none" }}>
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
                    ? (bee.type === "bomb" ? "#7f1d1d" : bee.type === "fast" ? "#1e3a5f" : bee.type === "fuchsia" ? "#3b0a24" : bee.type === "super" ? "#2a1540" : "#10341d")
                    : "#082114",
                  border: `2px solid ${bee ? (bee.type === "bomb" ? "#dc2626" : bee.type === "fast" ? "#3b82f6" : bee.type === "fuchsia" ? "#ec4899" : bee.type === "super" ? "#a855f7" : "#34d399") : "#0f3a22"}`,
                  boxShadow: bee ? "0 0 12px rgba(74,222,128,0.22)" : "none",
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
          {gameState === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[28px] bg-[rgba(4,20,12,0.56)] backdrop-blur-[2px]">
              <div className="text-center px-5">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-lime-200/85">
                  {cfg.emoji} {cfg.label} Mode
                </div>
                <div className="mt-2 text-[11px] text-emerald-50/90">
                  {capInfo.icon} {capInfo.label} run · {totalWaves} waves · up to {getFullValueThreshold(difficulty, session?.capType || "low")} pts
                </div>
                <div className="mt-4 text-[5.5rem] leading-none font-black text-lime-200 drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                  {countdown || "GO!"}
                </div>
              </div>
            </div>
          )}
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
    <div className="rounded-2xl px-3 py-3 border border-emerald-300/15" style={{ background: "rgba(10, 44, 26, 0.34)" }}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-lime-200/70">{label}</div>
      <div className="mt-2 text-[15px] leading-5 font-black" style={{ color: tone }}>{value}</div>
    </div>
  );
}

function CounterRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl px-3 py-2.5 border border-emerald-300/12" style={{ background: "rgba(10, 44, 26, 0.26)" }}>
      <div className="text-[13px] leading-5 text-emerald-50">{label}</div>
      <div className="mt-1 text-lg leading-none text-lime-200 font-black">{value}</div>
    </div>
  );
}
