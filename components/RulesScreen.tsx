"use client";
import { DIFFICULTY_CONFIG, PRIZE_PER_POINT, PRIZE_WALLET } from "./App";

export default function RulesScreen({ onBack }: { onBack: () => void }) {
  const shortWallet = `${PRIZE_WALLET.slice(0, 6)}...${PRIZE_WALLET.slice(-4)}`;

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "#1a0a00" }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-amber-950">
        <button onClick={onBack} className="text-amber-400 font-bold text-sm">← Back</button>
        <h2 className="text-xl font-black text-white flex-1 text-center">📖 Regole & Prezzi</h2>
        <div className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Come si gioca */}
        <Section title="🎮 Come si gioca">
          <p className="text-amber-200 text-sm leading-relaxed">
            Api compaiono a caso in una griglia 3×3. Tocca le api prima che spariscano per guadagnare punti.
            Attenzione alle api rosse — ti tolgono punti!
          </p>
          <div className="mt-3 space-y-2">
            <BeeRule emoji="🐝" label="Ape normale" desc="Appare per 850–1500ms" points="+1 punto" color="#fbbf24" />
            <BeeRule emoji="🐝" label="Ape veloce" desc="Appare per 650–1200ms, più rapida" points="+3 punti" color="#3b82f6" fast />
            <BeeRule emoji="💣" label="Ape rossa" desc="Evitala! Ti penalizza" points="-2 punti" color="#dc2626" />
          </div>
        </Section>

        {/* Difficoltà */}
        <Section title="⚙️ Difficoltà">
          <div className="space-y-2">
            {(Object.entries(DIFFICULTY_CONFIG) as any[]).map(([key, cfg]: any) => (
              <div key={key} className="rounded-xl p-3 border" style={{ background: "#0f0800", borderColor: cfg.color + "55" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cfg.emoji}</span>
                    <span className="font-black text-white">{cfg.label}</span>
                  </div>
                  <span className="font-black text-lg" style={{ color: cfg.color }}>{cfg.fee} USDC</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Durata" value={`${cfg.time}s`} />
                  <Stat label="Max punti" value={`${cfg.maxPts} pt`} />
                  <Stat label="Premio max" value={`${(cfg.maxPts * PRIZE_PER_POINT).toFixed(3)} USDC`} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Premi */}
        <Section title="💰 Sistema Premi">
          <div className="space-y-3">
            <div className="rounded-xl p-3 border border-green-900" style={{ background: "#0a1f0a" }}>
              <div className="text-green-400 font-bold text-sm mb-1">Premio per punto</div>
              <div className="text-green-300 text-2xl font-black">{PRIZE_PER_POINT} USDC</div>
              <div className="text-green-700 text-xs mt-1">per ogni punto segnato</div>
            </div>

            <p className="text-amber-700 text-xs leading-relaxed">
              Il premio viene calcolato automaticamente al termine della partita moltiplicando i punti ottenuti per {PRIZE_PER_POINT} USDC.
              Il pagamento avviene sul tuo wallet Farcaster connesso.
            </p>

            <div className="rounded-xl p-3 border border-amber-900" style={{ background: "#1f1000" }}>
              <div className="text-amber-500 text-xs uppercase tracking-widest mb-2">Esempio premi</div>
              <div className="space-y-1">
                {[
                  { pts: 20, mode: "Easy" },
                  { pts: 40, mode: "Medium" },
                  { pts: 60, mode: "Hard" },
                ].map(ex => (
                  <div key={ex.pts} className="flex justify-between text-sm">
                    <span className="text-amber-700">{ex.pts} punti ({ex.mode})</span>
                    <span className="text-amber-400 font-bold">{(ex.pts * PRIZE_PER_POINT).toFixed(3)} USDC</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Prize Pool */}
        <Section title="🏦 Prize Pool">
          <p className="text-amber-200 text-sm leading-relaxed mb-3">
            Tutti i premi vengono pagati da un pool dedicato. Se il saldo del pool scende sotto <span className="text-amber-400 font-bold">0.10 USDC</span>, il gioco viene temporaneamente sospeso fino alla ricarica.
          </p>
          <div className="rounded-xl p-3 border border-amber-900" style={{ background: "#1f1000" }}>
            <div className="text-amber-500 text-xs uppercase tracking-widest mb-1">Wallet prize pool</div>
            <div className="text-amber-300 font-mono text-sm break-all">{PRIZE_WALLET}</div>
          </div>
        </Section>

        {/* Fee */}
        <Section title="💳 Pagamento Fee">
          <p className="text-amber-200 text-sm leading-relaxed mb-3">
            La fee viene addebitata prima di ogni partita tramite il tuo wallet Farcaster. Il pagamento avviene sulla rete <span className="text-amber-400 font-bold">Base</span> in <span className="text-amber-400 font-bold">USDC</span>.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl p-2 border border-green-900" style={{ background: "#0a1a0a" }}>
              <div className="text-green-400 text-xs">🟢 Easy</div>
              <div className="text-green-300 font-black">0.04</div>
              <div className="text-green-800 text-xs">USDC</div>
            </div>
            <div className="rounded-xl p-2 border border-yellow-900" style={{ background: "#1a1500" }}>
              <div className="text-yellow-400 text-xs">🟡 Medium</div>
              <div className="text-yellow-300 font-black">0.05</div>
              <div className="text-yellow-800 text-xs">USDC</div>
            </div>
            <div className="rounded-xl p-2 border border-red-900" style={{ background: "#1a0a0a" }}>
              <div className="text-red-400 text-xs">🔴 Hard</div>
              <div className="text-red-300 font-black">0.06</div>
              <div className="text-red-800 text-xs">USDC</div>
            </div>
          </div>
          <p className="text-amber-800 text-xs mt-3">
            ⚠️ Le fee non sono rimborsabili. Assicurati di avere USDC su Base prima di giocare.
          </p>
        </Section>

        {/* Fair play */}
        <Section title="⚖️ Fair Play">
          <ul className="text-amber-700 text-xs space-y-1 leading-relaxed">
            <li>• Il gioco è completamente on-chain e trasparente</li>
            <li>• I punteggi vengono registrati sul leaderboard pubblico</li>
            <li>• Ogni wallet può giocare quante partite vuole</li>
            <li>• Il prize pool è pubblicamente verificabile</li>
            <li>• In caso di errori tecnici la fee viene rimborsata</li>
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
      <div className="text-amber-700 text-xs">{label}</div>
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
        <div className="text-amber-700 text-xs">{desc}</div>
      </div>
      <div className="font-black text-sm" style={{ color }}>{points}</div>
    </div>
  );
}
