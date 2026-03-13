"use client";
import { useEffect, useState } from "react";
import { useFarcaster } from "@/hooks/useFarcaster";
import UserPageHeader from "@/components/UserPageHeader";

const ADMIN_WALLET = (
  process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe"
).toLowerCase();

type WeeklyState = {
  potBf: number;
  snapshotAt?: number;
  payoutAt?: number;
  tickets: Record<string, number>;
  pendingTickets?: Record<string, number>;
};

export default function WeeklyPage() {
  const { user } = useFarcaster();
  const [state, setState] = useState<WeeklyState | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/weekly")
      .then(r => r.json())
      .then(d => setState(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="user-page-bg user-page-overlay min-h-dvh p-6">
      <div className="max-w-xl mx-auto space-y-4">
        {user && (
          <UserPageHeader
            user={user}
            isAdmin={user.address?.toLowerCase() === ADMIN_WALLET}
            showBack
            backHref="/"
            rulesHref="/?screen=rules"
            leaderboardHref="/?screen=leaderboard"
            active="weekly"
          />
        )}

        <div className="page-panel px-5 py-5 text-center">
          <div className="page-kicker">Current Pot</div>
          <div className="mt-2 text-3xl font-black text-amber-50">
            {state ? `${Math.round(state.potBf).toLocaleString()} BF` : "—"}
          </div>
          {state?.payoutAt && (
            <div className="page-copy text-xs mt-2">
              Payout {new Date(state.payoutAt).toLocaleString("en-GB", { timeZone: "Europe/Rome" })} CET
            </div>
          )}
          {state?.payoutAt && now != null && (
            <div className="page-muted text-xs mt-1">
              Countdown {formatCountdown(state.payoutAt - now)}
            </div>
          )}
        </div>

        <div className="page-panel px-5 py-5">
          <div className="page-kicker mb-3">How it works</div>
          <ul className="page-copy text-sm space-y-2 leading-6">
            <li>• Weekly pot = 4.5% of every claimed payout</li>
            <li>• Burn = 1% of every claimed payout</li>
            <li>• Top 3 (overall net gain) split 60% (50/30/20)</li>
            <li>• 7 lottery prizes split 40% equally</li>
            <li>• Tickets: 1 base, +1 cap-cleared run, +1 profitable run, +1 every 10th claimed win</li>
          </ul>
        </div>

      </div>
    </div>
  );
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
