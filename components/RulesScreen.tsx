"use client";
import { PRIZE_WALLET } from "@/lib/contracts";
import type { FarcasterUser } from "@/hooks/useFarcaster";
import {
  BEE_LABELS,
  CAP_TYPES,
  calculatePrizeUsdc,
  DIFFICULTY_CONFIG,
  getFullValueThreshold,
  getMaxPrizeUsdc,
  getPrizeflyBonusUsdc,
  LIVE_POINT_VALUES,
  PRIZE_PER_POINT,
  getRunWaveCount,
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
    <div className="user-page-bg user-page-overlay min-h-dvh flex flex-col">
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

      <div className="page-wrap mx-auto flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Come si gioca */}
        <Section title="🎮 How to Play">
          <p className="text-amber-200 text-sm leading-relaxed">
            Each run is a fixed number of waves on a 3×3 grid. Tap butterflies before they disappear, survive the guaranteed Bombfly in every wave,
            and push your score as high as possible before you hit the point cap.
          </p>
          <div className="mt-3 space-y-2">
            <BeeRule emoji="🦋" label={BEE_LABELS.normal} desc="Core scorer in every wave" points="+1 point" color="#fbbf24" />
            <BeeRule emoji="🔵" label={BEE_LABELS.fast} desc={`Triplefly burst scorer, worth +${LIVE_POINT_VALUES.medium.fast} in Medium`} points={`+${LIVE_POINT_VALUES.easy.fast} / +${LIVE_POINT_VALUES.medium.fast} / +${LIVE_POINT_VALUES.hard.fast}`} color="#3b82f6" fast />
            <BeeRule emoji="💖" label={BEE_LABELS.fuchsia} desc="Quickfly burst scorer. Rarer than Triplefly and tuned per difficulty." points={`+${LIVE_POINT_VALUES.easy.fuchsia} / +${LIVE_POINT_VALUES.medium.fuchsia} / +${LIVE_POINT_VALUES.hard.fuchsia}`} color="#ec4899" fast />
            <BeeRule
              emoji="🔴"
              label={BEE_LABELS.bomb}
              desc="At least one Bombfly appears every wave, and some types can add a second one. Hit it and you lose points."
              points={`${LIVE_POINT_VALUES.easy.bomb} / ${LIVE_POINT_VALUES.medium.bomb} / ${LIVE_POINT_VALUES.hard.bomb}`}
              color="#dc2626"
            />
            <BeeRule
              emoji="💜"
              label={BEE_LABELS.super}
              desc="Max one per run. Flat 1% chance per run on every difficulty and type. Bonus depends on difficulty and run type, with Hard Big anchored at 2.5x fee."
              points={`+${getPrizeflyBonusUsdc("hard", "big").toFixed(4)} USDC gross`}
              color="#a855f7"
            />
          </div>
        </Section>

        <Section title="🎲 Game Types">
          <div className="space-y-2">
            {CAP_TYPES.map((item) => (
              <div key={item.key} className="page-panel-soft rounded-[22px] p-3">
                <div className="flex items-center justify-between">
                  <div className="text-white font-black">{item.icon} {item.label}</div>
                  <div className="text-violet-300 text-sm font-bold">{item.pct}% chance</div>
                </div>
                <div className="mt-1 text-amber-200 text-xs">
                  {item.key === "jolly"
                    ? "Each wave rerolls into Low, Nice, Big, or Mega using their current odds."
                    : `${item.pct}% of runs. Type now changes wave structure and pacing, not point value.`}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Difficoltà */}
        <Section title="⚙️ Difficulty">
          <div className="space-y-2">
            {(Object.entries(DIFFICULTY_CONFIG) as [keyof typeof DIFFICULTY_CONFIG, typeof DIFFICULTY_CONFIG.easy][]).map(([key, cfg]) => (
              <div key={key} className="page-panel-soft rounded-[22px] p-3" style={{ borderColor: cfg.color + "33" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cfg.emoji}</span>
                    <span className="font-black text-white">{cfg.label}</span>
                  </div>
                  <span className="font-black text-lg" style={{ color: cfg.color }}>{cfg.fee} USDC</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Waves" value={`${getRunWaveCount(key, "low")}–${getRunWaveCount(key, "mega")}`} />
                  <Stat label="Point cap" value={`${getFullValueThreshold(key, "mega")} pts`} />
                  <Stat label="Max prize" value={`${getMaxPrizeUsdc(key, "mega").toFixed(3)} USDC`} />
                </div>
                <div className="text-amber-700 text-xs mt-2 text-center">Linear payout, with run types increasing wave count from Low to Mega.</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Premi */}
        <Section title="💰 Prize System">
          <div className="space-y-3">
            <div className="page-panel-soft rounded-[22px] p-3 border border-green-300/15">
              <div className="text-green-400 font-bold text-sm mb-1">Reward per point</div>
              <div className="grid grid-cols-3 gap-2">
                {(["easy", "medium", "hard"] as const).map((difficulty) => (
                  <div key={difficulty} className="rounded-[16px] border border-white/8 bg-white/5 px-2 py-2 text-center">
                    <div className="text-[10px] uppercase tracking-widest text-green-200/80">{DIFFICULTY_CONFIG[difficulty].label}</div>
                    <div className="text-green-300 text-lg font-black">{Math.round(PRIZE_PER_POINT[difficulty] * BF_PER_USDC_FALLBACK).toLocaleString()} BF</div>
                  </div>
                ))}
              </div>
              <div className="text-green-700 text-xs mt-2">approximate base value for each point at the current BF/USDC reference</div>
            </div>

            <p className="text-amber-300 text-xs leading-relaxed">
              Prize payout is now linear: every point pays the same base value for that difficulty, up to the current point cap.
              Claims are executed on-chain in BF from your connected Farcaster wallet.
            </p>

            <div className="page-panel-soft rounded-[22px] p-3">
              <div className="text-amber-500 text-xs uppercase tracking-widest mb-2">Prize examples</div>
              <div className="space-y-1">
                {[
                  { pts: 20, mode: "Easy", diff: "Easy" },
                  { pts: 40, mode: "Medium", diff: "Medium" },
                  { pts: 60, mode: "Hard", diff: "Hard" },
                ].map(ex => (
                  <div key={ex.pts} className="flex justify-between text-sm">
                    <span className="text-amber-200">{ex.pts} pts ({ex.mode})</span>
                    <span className="text-amber-400 font-bold">
                      {Math.round(
                        calculatePrizeUsdc(
                          ex.pts,
                          ex.diff.toLowerCase() as keyof typeof PRIZE_PER_POINT,
                          0,
                          "low"
                        ) * BF_PER_USDC_FALLBACK
                      ).toLocaleString()} BF
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="page-panel-soft rounded-[22px] p-3">
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
          <div className="page-panel-soft rounded-[22px] p-3">
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
            <div className="page-panel-soft rounded-[18px] p-2 border border-green-300/15">
              <div className="text-green-400 text-xs">🟢 Easy</div>
              <div className="text-green-300 font-black">{DIFFICULTY_CONFIG.easy.fee.toFixed(3)}</div>
              <div className="text-green-800 text-xs">USDC</div>
            </div>
            <div className="page-panel-soft rounded-[18px] p-2 border border-yellow-300/15">
              <div className="text-yellow-400 text-xs">🟡 Medium</div>
              <div className="text-yellow-300 font-black">{DIFFICULTY_CONFIG.medium.fee.toFixed(3)}</div>
              <div className="text-yellow-800 text-xs">USDC</div>
            </div>
            <div className="page-panel-soft rounded-[18px] p-2 border border-red-300/15">
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
    <div className="page-panel page-fade-top rounded-[28px] p-5">
      <h3 className="page-title text-base mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="page-panel-soft rounded-[18px] p-2.5">
      <div className="text-amber-100 text-xs">{label}</div>
      <div className="text-amber-50 font-bold text-sm">{value}</div>
    </div>
  );
}

function BeeRule({ emoji, label, desc, points, color, fast }: {
  emoji: string; label: string; desc: string; points: string; color: string; fast?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[22px] p-3 page-panel-soft" style={{ border: `1px solid ${color}26` }}>
      <span className="text-3xl" style={{ filter: fast ? "hue-rotate(180deg)" : undefined }}>{emoji}</span>
      <div className="flex-1">
        <div className="text-white font-bold text-sm">{label}</div>
        <div className="page-copy text-xs">{desc}</div>
      </div>
      <div className="font-black text-sm" style={{ color }}>{points}</div>
    </div>
  );
}
