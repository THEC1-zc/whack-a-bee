"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFarcaster } from "@/hooks/useFarcaster";

const ADMIN_WALLET = (process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe").toLowerCase();

type TxRecord = {
  id: string;
  at: number;
  kind: string;
  status: "ok" | "failed";
  weekId?: string;
  playerUsername?: string;
  playerAddress?: string;
  to?: string;
  amountUsdc?: number;
  amountBf?: number;
  txHash?: string;
  basescanUrl?: string;
  stage?: string;
  reason?: string;
};

function short(addr?: string) {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function shortTx(hash?: string) {
  if (!hash) return "-";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export default function AdminTxRecordsPage() {
  const { user, connectWallet } = useFarcaster();
  const address = user?.address?.toLowerCase() || "";
  const authorized = address === ADMIN_WALLET;

  const [records, setRecords] = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authorized) return;
    fetch("/api/admin/tx-records?limit=300", {
      headers: { "x-admin-wallet": address },
    })
      .then((r) => r.json())
      .then((d) => setRecords(Array.isArray(d.records) ? d.records : []))
      .catch(() => setError("Failed to load tx records"))
      .finally(() => setLoading(false));
  }, [authorized, address]);

  if (!user?.address) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center" style={{ background: "#1a0a00" }}>
        <h1 className="text-2xl font-black text-white mb-3">Tx Records</h1>
        <p className="text-amber-500 text-sm mb-4">Connect your wallet to continue.</p>
        <button onClick={connectWallet} className="px-5 py-3 rounded-xl font-black text-black" style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}>
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center" style={{ background: "#1a0a00" }}>
        <h1 className="text-2xl font-black text-white mb-2">Tx Records</h1>
        <p className="text-red-400 text-sm">Unauthorized wallet.</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh p-5" style={{ background: "#1a0a00" }}>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-amber-400 font-bold text-sm">← Back Admin</Link>
          <h1 className="text-2xl font-black text-white">Transaction Records</h1>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}

        <div className="rounded-xl border border-amber-900 overflow-auto" style={{ background: "#140a00" }}>
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-amber-400 border-b border-amber-900">
                <th className="text-left p-2">Date CET</th>
                <th className="text-left p-2">Kind</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Player</th>
                <th className="text-left p-2">To</th>
                <th className="text-left p-2">USDC</th>
                <th className="text-left p-2">BF</th>
                <th className="text-left p-2">Tx</th>
                <th className="text-left p-2">Stage</th>
                <th className="text-left p-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-3 text-amber-500" colSpan={10}>Loading...</td></tr>
              ) : records.length === 0 ? (
                <tr><td className="p-3 text-amber-500" colSpan={10}>No records</td></tr>
              ) : records.map((r) => (
                <tr key={r.id} className="border-b border-amber-950 text-amber-200">
                  <td className="p-2">{new Date(r.at).toLocaleString("en-GB", { timeZone: "Europe/Rome" })}</td>
                  <td className="p-2">{r.kind}</td>
                  <td className={`p-2 ${r.status === "ok" ? "text-green-400" : "text-red-400"}`}>{r.status}</td>
                  <td className="p-2">{r.playerUsername ? `@${r.playerUsername}` : short(r.playerAddress)}</td>
                  <td className="p-2">{short(r.to)}</td>
                  <td className="p-2">{typeof r.amountUsdc === "number" ? r.amountUsdc.toFixed(4) : "-"}</td>
                  <td className="p-2">{typeof r.amountBf === "number" ? Math.round(r.amountBf).toLocaleString() : "-"}</td>
                  <td className="p-2">
                    {r.txHash ? (
                      <a href={r.basescanUrl} target="_blank" rel="noreferrer" className="text-amber-400 underline">{shortTx(r.txHash)}</a>
                    ) : "-"}
                  </td>
                  <td className="p-2">{r.stage || "-"}</td>
                  <td className="p-2 max-w-[280px] truncate" title={r.reason || ""}>{r.reason || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
