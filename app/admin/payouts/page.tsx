"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFarcaster } from "@/hooks/useFarcaster";

const ADMIN_WALLET = (process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe").toLowerCase();

type PayoutRow = {
  weekId: string;
  at: number;
  status: string;
  mode: string;
  force: boolean;
  autoClaimPendingTickets: boolean;
  potBf: number;
  group: string;
  player: string;
  playerUsername: string;
  wallet: string;
  amountBf: number;
  txHash: string;
  basescanUrl: string;
  ok: boolean;
  error: string;
};

function shortWallet(addr: string) {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function shortTx(hash: string) {
  if (!hash) return "-";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export default function AdminPayoutsPage() {
  const { user, connectWallet } = useFarcaster();
  const address = user?.address?.toLowerCase() || "";
  const authorized = address === ADMIN_WALLET;

  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [weekFilter, setWeekFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyInfo, setCopyInfo] = useState<string | null>(null);

  function rowToText(r: PayoutRow) {
    return [
      `week=${r.weekId}`,
      `date_cet=${new Date(r.at).toLocaleString("en-GB", { timeZone: "Europe/Rome" })}`,
      `status=${r.status}`,
      `player=${r.playerUsername ? `@${r.playerUsername}` : (r.player || "-")}`,
      `wallet=${r.wallet || "-"}`,
      `group=${r.group || "-"}`,
      `amount_bf=${r.amountBf}`,
      `pot_bf=${r.potBf}`,
      `tx=${r.txHash || "-"}`,
      `mode=${r.mode}${r.force ? "_force" : ""}`,
      `error=${r.error || "-"}`,
    ].join(" | ");
  }

  async function copyText(text: string, okMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyInfo(okMessage);
      setTimeout(() => setCopyInfo(null), 2000);
    } catch {
      setCopyInfo("Copy failed");
      setTimeout(() => setCopyInfo(null), 2000);
    }
  }

  useEffect(() => {
    if (!authorized) return;
    const query = weekFilter ? `?weekId=${encodeURIComponent(weekFilter)}&limit=500` : "?limit=500";
    fetch(`/api/admin/weekly-payouts${query}`, {
      headers: { "x-admin-wallet": address },
    })
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setError(null);
      })
      .catch(() => setError("Failed to load payout history"))
      .finally(() => setLoading(false));
  }, [authorized, address, weekFilter]);

  const uniqueWeeks = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.weekId));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  if (!user?.address) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center" style={{ background: "#1a0a00" }}>
        <h1 className="text-2xl font-black text-white mb-3">Weekly Payouts</h1>
        <p className="text-amber-500 text-sm mb-4">Connect your wallet to continue.</p>
        <button
          onClick={connectWallet}
          className="px-5 py-3 rounded-xl font-black text-black"
          style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center" style={{ background: "#1a0a00" }}>
        <h1 className="text-2xl font-black text-white mb-2">Weekly Payouts</h1>
        <p className="text-red-400 text-sm">Unauthorized wallet.</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh p-5" style={{ background: "#1a0a00" }}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/admin/weekly" className="text-amber-400 font-bold text-sm">← Weekly</Link>
            <h1 className="text-2xl font-black text-white">Weekly Payout History</h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-amber-300 text-xs">Week</label>
            <input
              value={weekFilter}
              onChange={(e) => {
                setLoading(true);
                setWeekFilter(e.target.value.trim());
              }}
              placeholder="YYYY-W##"
              className="px-3 py-2 rounded-lg bg-amber-950 border border-amber-900 text-amber-100 text-sm"
            />
          </div>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}

        <div className="rounded-xl border border-amber-900 p-3 text-amber-200 text-sm" style={{ background: "#140a00" }}>
          Rows: {rows.length}
          {uniqueWeeks.length > 0 && <span className="ml-3">Weeks: {uniqueWeeks.join(", ")}</span>}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => copyText(rows.map(rowToText).join("\n"), `Copied ${rows.length} rows`)}
            className="px-3 py-1 rounded-lg text-xs font-black text-black"
            style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
          >
            Copy All
          </button>
          {copyInfo && <span className="text-green-400 text-xs">{copyInfo}</span>}
        </div>

        <div className="md:hidden space-y-2">
          {loading ? (
            <div className="text-amber-500 text-sm">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="text-amber-500 text-sm">No payout rows</div>
          ) : rows.map((r, idx) => (
            <div key={`${r.weekId}-${r.txHash || idx}`} className="rounded-xl border border-amber-900 p-3 text-xs" style={{ background: "#140a00" }}>
              <div className="text-amber-400">{r.weekId} · {new Date(r.at).toLocaleString("en-GB", { timeZone: "Europe/Rome" })}</div>
              <div className={`mt-1 ${r.ok ? "text-green-400" : "text-red-400"}`}>{r.status}</div>
              <div className="text-amber-200 mt-1">Player: {r.playerUsername ? `@${r.playerUsername}` : (r.player || "-")}</div>
              <div className="text-amber-200">Wallet: {r.wallet || "-"}</div>
              <div className="text-amber-200">Group: {r.group || "-"}</div>
              <div className="text-amber-200">Amount BF: {Math.round(r.amountBf).toLocaleString()}</div>
              <div className="text-amber-200">Pot BF: {Math.round(r.potBf).toLocaleString()}</div>
              <div className="text-amber-200">Mode: {r.mode}{r.force ? " (force)" : ""}</div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                {r.txHash ? (
                  <a className="text-amber-400 underline" href={r.basescanUrl} target="_blank" rel="noreferrer">
                    {shortTx(r.txHash)}
                  </a>
                ) : (
                  <span className="text-red-400">{r.error || "failed"}</span>
                )}
                <button
                  type="button"
                  onClick={() => copyText(rowToText(r), "Row copied")}
                  className="px-2 py-1 rounded text-[11px] font-bold text-black"
                  style={{ background: "#fbbf24" }}
                >
                  Copy Row
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block rounded-xl border border-amber-900 overflow-auto" style={{ background: "#140a00" }}>
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-amber-400 border-b border-amber-900">
                <th className="text-left p-2">Week</th>
                <th className="text-left p-2">Date CET</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Player</th>
                <th className="text-left p-2">Wallet</th>
                <th className="text-left p-2">Group</th>
                <th className="text-left p-2">Amount BF</th>
                <th className="text-left p-2">Tx Hash</th>
                <th className="text-left p-2">Mode</th>
                <th className="text-left p-2">Pot BF</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-3 text-amber-500" colSpan={10}>Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="p-3 text-amber-500" colSpan={10}>No payout rows</td></tr>
              ) : rows.map((r, idx) => (
                <tr key={`${r.weekId}-${r.txHash || idx}`} className="border-b border-amber-950 text-amber-200">
                  <td className="p-2">{r.weekId}</td>
                  <td className="p-2">{new Date(r.at).toLocaleString("en-GB", { timeZone: "Europe/Rome" })}</td>
                  <td className={`p-2 ${r.ok ? "text-green-400" : "text-red-400"}`}>{r.status}</td>
                  <td className="p-2">
                    {r.playerUsername ? `@${r.playerUsername}` : (r.player || "-")}
                  </td>
                  <td className="p-2" title={r.wallet}>{shortWallet(r.wallet)}</td>
                  <td className="p-2">{r.group}</td>
                  <td className="p-2">{Math.round(r.amountBf).toLocaleString()}</td>
                  <td className="p-2" title={r.txHash || r.error || ""}>
                    <div className="flex items-center gap-2">
                      {r.txHash ? (
                        <a className="text-amber-400 underline" href={r.basescanUrl} target="_blank" rel="noreferrer">
                          {shortTx(r.txHash)}
                        </a>
                      ) : (
                        <span className="text-red-400">{r.error || "failed"}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => copyText(rowToText(r), "Row copied")}
                        className="px-2 py-0.5 rounded text-[10px] font-bold text-black"
                        style={{ background: "#fbbf24" }}
                      >
                        Copy
                      </button>
                    </div>
                  </td>
                  <td className="p-2">{r.mode}{r.force ? " (force)" : ""}</td>
                  <td className="p-2">{Math.round(r.potBf).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
