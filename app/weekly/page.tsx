"use client";
import { useEffect, useState } from "react";

type WeeklyState = {
  potBf: number;
  nextReset: number;
  tickets: Record<string, number>;
};

export default function WeeklyPage() {
  const [state, setState] = useState<WeeklyState | null>(null);

  useEffect(() => {
    fetch("/api/weekly")
      .then(r => r.json())
      .then(d => setState(d))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-dvh p-6" style={{ background: "#1a0a00" }}>
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <a href="/" className="text-amber-400 font-bold text-sm">← Back</a>
          <h1 className="text-2xl font-black text-white">Weekly Pot</h1>
        </div>

        <div className="rounded-xl border border-amber-900 p-4 text-center" style={{ background: "#140a00" }}>
          <div className="text-amber-500 text-xs uppercase tracking-widest">Current Pot</div>
          <div className="text-2xl font-black text-amber-200 mt-1">
            {state ? `${Math.round(state.potBf).toLocaleString()} BF` : "—"}
          </div>
          {state?.nextReset && (
            <div className="text-amber-700 text-xs mt-1">
              Resets {new Date(state.nextReset).toLocaleString("en-GB", { timeZone: "Europe/Rome" })} CET
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-900 p-4" style={{ background: "#140a00" }}>
          <div className="text-amber-400 text-xs uppercase tracking-widest mb-2">How it works</div>
          <ul className="text-amber-200 text-sm space-y-1">
            <li>• Pot = 5% of every win paid</li>
            <li>• Top 3 (overall net gain) split 60% (50/30/20)</li>
            <li>• 7 lottery prizes split 40% equally</li>
            <li>• Tickets: 1 per game, +1 per 1000 points, +1 per 0.25 USDC spent, +1 per 25 wins</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

