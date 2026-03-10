"use client";
import { PRIZE_WALLET } from "@/lib/contracts";
import type { FarcasterUser } from "@/hooks/useFarcaster";
import {
  BEE_LABELS,
  calculatePrizeUsdc,
  DIFFICULTY_CONFIG,
  getFullValueThreshold,
  LIVE_POINT_VALUES,
  PRIZE_PER_POINT,
} from "@/lib/gameRules";
import { BF_PER_USDC_FALLBACK } from "@/lib/pricing";
import UserPageHeader from "./UserPageHeader";

export default function RulesScreen({
  user,
  isAdmin,
  onBack,
  onLeaderboard,
}: {
  user: FarcasterUser;
  isAdmin: boolean;
  onBack: () => void;
  onLeaderboard: () => void;
}) {
  return (
    <div className="user-page-bg min-h-dvh flex flex-col">
      <div className="mx-4 mt-4">
        <UserPageHeader
          user={user}
          isAdmin={isAdmin}
          showBack
          onBack={onBack}
          leaderboardHref="/?screen=leaderboard"
          onLeaderboard={onLeaderboard}
          active="rules"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Come si gioca */}
        <Section title="🎮 How to Play">
          <p className="text-amber-200 text-sm leading-relaxed">
            Each run is a fixed number of waves on a 3×3 grid. Tap butterflies before they disappear, survive the forced Bombfly in every wave,
            and push your score as high as possible before you hit the point cap.
          </p>
          <div className="mt-3 space-y-2">
            <BeeRule emoji="🦋" label={BEE_LABELS.normal} desc="Core scorer in every wave" points="+1 point" color="#fbbf24" />
            <BeeRule emoji="🔵" label={BEE_LABELS.fast} desc={`Quick scorer, worth +${LIVE_POINT_VALUES.medium.fast} in Medium`} points="+2 / +3 / +4" color="#3b82f6" fast />
            <BeeRule emoji="💖" label={BEE_LABELS.fuchsia} desc="Rare burst scorer, doubled chance in Mega" points="+3 / +5 / +7" color="#ec4899" fast />
            <BeeRule emoji="🔴" label={BEE_LABELS.bomb} desc="Forced once per wave. Hit it and you lose points." points="-1 / -2 / -3" color="#dc2626" />
            <BeeRule emoji="💜" label={BEE_LABELS.super} desc="One per run max. Adds 100,000 BF on top of score payout." points="+100000 BF" color="#a855f7" />
          </div>
        </Section>

        {/* Difficoltà */}
        <Section title="⚙️ Difficulty">
          <div className="space-y-2">
            {(Object.entries(DIFFICULTY_CONFIG) as [keyof typeof DIFFICULTY_CONFIG, typeof DIFFICULTY_CONFIG.easy][]).map(([key, cfg]) => (
              <div key={key} className="rounded-xl p-3 border" style={{ background: "#0f0800", borderColor: cfg.color + "55" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cfg.emoji}</span>
                    <span className="font-black text-white">{cfg.label}</span>
                  </div>
                  <span className="font-black text-lg" style={{ color: cfg.color }}>{cfg.fee} USDC</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Waves" value={`${cfg.waves}`} />
                  <Stat label="Point cap" value={`${cfg.maxPts} pts`} />
                  <Stat label="Max prize" value={`${calculatePrizeUsdc(cfg.maxPts, key as keyof typeof DIFFICULTY_CONFIG).toFixed(3)} USDC`} />
                </div>
                <div className="text-amber-700 text-xs mt-2 text-center">Linear payout up to {getFullValueThreshold(key as keyof typeof DIFFICULTY_CONFIG)} pts.</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Premi */}
        <Section title="💰 Prize System">
          <div className="space-y-3">
            <div className="rounded-xl p-3 border border-green-900" style={{ background: "#0a1f0a" }}>
              <div className="text-green-400 font-bold text-sm mb-1">Reward per point</div>
              <div className="text-green-300 text-2xl font-black">{(PRIZE_PER_POINT.medium * BF_PER_USDC_FALLBACK).toFixed(0)} BF</div>
              <div className="text-green-700 text-xs mt-1">base value for each point</div>
            </div>

            <p className="text-amber-300 text-xs leading-relaxed">
              Prize payout is now linear: every point pays the same base value for that difficulty, up to the current point cap.
              Claims are executed on-chain in BF from your connected Farcaster wallet.
            </p>

            <div className="rounded-xl p-3 border border-amber-900" style={{ background: "#1f1000" }}>
              <div className="text-amber-500 text-xs uppercase tracking-widest mb-2">Prize examples</div>
              <div className="space-y-1">
                {[
                  { pts: 20, mode: "Easy", diff: "Easy" },
                  { pts: 40, mode: "Medium", diff: "Medium" },
                  { pts: 60, mode: "Hard", diff: "Hard" },
                ].map(ex => (
                  <div key={ex.pts} className="flex justify-between text-sm">
                    <span className="text-amber-200">{ex.pts} pts ({ex.mode})</span>
                    <span className="text-amber-400 font-bold">{Math.round(calculatePrizeUsdc(ex.pts, ex.diff.toLowerCase() as keyof typeof PRIZE_PER_POINT) * BF_PER_USDC_FALLBACK)} BF</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl p-3 border border-amber-900" style={{ background: "#1f1000" }}>
              <div className="text-amber-500 text-xs uppercase tracking-widest mb-2">Weekly tickets</div>
              <div className="text-amber-200 text-sm">1 base ticket, +1 for reaching the point cap, +1 for a profitable run, +1 every 10th claimed win.</div>
            </div>
          </div>
        </Section>

        {/* Prize Pool */}
        <Section title="🏦 Prize Pool">
          <p className="text-amber-200 text-sm leading-relaxed mb-3">
            All prizes are paid from a dedicated pool. If the balance drops below <span className="text-amber-400 font-bold">100,000 BF</span>, the game is temporarily suspended until the pool is refilled.
          </p>
          <div className="rounded-xl p-3 border border-amber-900" style={{ background: "#1f1000" }}>
            <div className="text-amber-500 text-xs uppercase tracking-widest mb-1">Prize pool wallet</div>
            <div className="text-amber-300 font-mono text-sm break-all">{PRIZE_WALLET}</div>
          </div>
        </Section>

        {/* Fee */}
        <Section title="💳 Game Fee">
          <p className="text-amber-200 text-sm leading-relaxed mb-3">
            The fee is charged before each game via your Farcaster wallet. Payment is made on the <span className="text-amber-400 font-bold">Base</span> network in <span className="text-amber-400 font-bold">USDC</span>.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl p-2 border border-green-900" style={{ background: "#0a1a0a" }}>
              <div className="text-green-400 text-xs">🟢 Easy</div>
              <div className="text-green-300 font-black">{DIFFICULTY_CONFIG.easy.fee.toFixed(3)}</div>
              <div className="text-green-800 text-xs">USDC</div>
            </div>
            <div className="rounded-xl p-2 border border-yellow-900" style={{ background: "#1a1500" }}>
              <div className="text-yellow-400 text-xs">🟡 Medium</div>
              <div className="text-yellow-300 font-black">{DIFFICULTY_CONFIG.medium.fee.toFixed(3)}</div>
              <div className="text-yellow-800 text-xs">USDC</div>
            </div>
            <div className="rounded-xl p-2 border border-red-900" style={{ background: "#1a0a0a" }}>
              <div className="text-red-400 text-xs">🔴 Hard</div>
              <div className="text-red-300 font-black">{DIFFICULTY_CONFIG.hard.fee.toFixed(3)}</div>
              <div className="text-red-800 text-xs">USDC</div>
            </div>
          </div>
          <p className="text-amber-300 text-xs mt-3">
            ⚠️ Fees are non-refundable. Make sure you have USDC on Base before playing.
          </p>
        </Section>

        {/* Fair play */}
        <Section title="⚖️ Fair Play">
          <ul className="text-amber-200 text-xs space-y-1 leading-relaxed">
            <li>• The game is fully on-chain and transparent</li>
            <li>• Scores are recorded on the public leaderboard</li>
            <li>• Any wallet can play unlimited games</li>
            <li>• The prize pool is publicly verifiable</li>
            <li>• Payout claims happen on-chain through the game payout flow</li>
          </ul>
        </Section>

      </div>

      <div className="h-6" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 border border-amber-950" style={{ background: "#150800" }}>
      <h3 className="text-white font-black text-base mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: "#1a0a00" }}>
      <div className="text-amber-300 text-xs">{label}</div>
      <div className="text-amber-300 font-bold text-sm">{value}</div>
    </div>
  );
}

function BeeRule({ emoji, label, desc, points, color, fast }: {
  emoji: string; label: string; desc: string; points: string; color: string; fast?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "#0f0800", border: `1px solid ${color}33` }}>
      <span className="text-3xl" style={{ filter: fast ? "hue-rotate(180deg)" : undefined }}>{emoji}</span>
      <div className="flex-1">
        <div className="text-white font-bold text-sm">{label}</div>
        <div className="text-amber-200 text-xs">{desc}</div>
      </div>
      <div className="font-black text-sm" style={{ color }}>{points}</div>
    </div>
  );
}
