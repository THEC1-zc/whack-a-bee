"use client";
import { useEffect, useState } from "react";
import { useFarcaster } from "@/hooks/useFarcaster";
import UserPageHeader from "@/components/UserPageHeader";
import { DIFFICULTY_CONFIG, type Difficulty } from "@/lib/gameRules";

const ADMIN_WALLET = (
  process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe"
).toLowerCase();

type WeeklyState = {
  weekId: string;
  baseWeekId?: string;
  cycle?: number;
  potBf: number;
  snapshotAt?: number;
  payoutAt?: number;
  tickets: Record<string, number>;
  pendingTickets?: Record<string, number>;
};

type WeeklyEntry = {
  username: string;
  displayName: string;
  address?: string;
  net: number;
  tickets: number;
  wins: number;
  games: number;
};

export default function WeeklyPage() {
  const { user } = useFarcaster();
  const [state, setState] = useState<WeeklyState | null>(null);
  const [entries, setEntries] = useState<WeeklyEntry[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [filter, setFilter] = useState<Difficulty | "all">("all");

  useEffect(() => {
    fetch("/api/weekly")
      .then(r => r.json())
      .then(d => setState(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ scope: "weekly" });
    if (filter !== "all") params.set("difficulty", filter);
    fetch(`/api/leaderboard?${params.toString()}`)
      .then(r => r.json())
      .then(d => setEntries(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [filter]);

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
          <div className="page-copy text-xs mt-2">
            Week {state?.weekId || "—"}
          </div>
          <div className="mt-2 text-3xl font-black text-emerald-50">
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
            <li>• Top 3 weekly leaderboard split 60% (50/30/20)</li>
            <li>• 7 lottery prizes split 40% equally</li>
            <li>• Tickets: 1 base, +1 cap-cleared run, +1 profitable run, +1 every 10th claimed win</li>
          </ul>
        </div>

        <div className="page-panel px-5 py-5">
          <div className="page-kicker mb-3">Weekly leaderboard</div>
          <div className="mb-4 flex gap-2">
            {(["all", "easy", "medium", "hard"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className="page-chip flex-1 rounded-full py-2 text-xs font-bold transition-all"
                style={{
                  background: filter === item ? "rgba(220, 252, 231, 0.94)" : "rgba(236, 253, 245, 0.08)",
                  color: filter === item ? "#052e16" : "#f0fdf4",
                }}
              >
                {item === "all" ? "All" : `${DIFFICULTY_CONFIG[item].emoji} ${DIFFICULTY_CONFIG[item].label}`}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {entries.length === 0 ? (
              <div className="page-copy text-sm">No weekly runs yet.</div>
            ) : (
              entries.slice(0, 10).map((entry, index) => (
                <div key={`${entry.address || entry.username}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-bold text-emerald-50 truncate">{index + 1}. {entry.displayName}</div>
                    <div className="page-muted text-xs">
                      @{entry.username} · {entry.games} games · {entry.wins} wins · {entry.tickets} tickets
                    </div>
                  </div>
                  <div className={`font-black ${entry.net >= 0 ? "text-green-300" : "text-red-300"}`}>
                    {entry.net >= 0 ? "+" : ""}{entry.net.toFixed(3)}
                  </div>
                </div>
              ))
            )}
          </div>
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
