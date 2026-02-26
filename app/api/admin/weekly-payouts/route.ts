import { NextRequest, NextResponse } from "next/server";
import { getAdminWallet, getWeeklyPayoutHistory, type WeeklyPayoutLogEntry } from "@/lib/weekly";

const ADMIN_WALLET = getAdminWallet();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

function isAuthorized(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  if (ADMIN_API_KEY && token === ADMIN_API_KEY) return true;
  const addr = req.headers.get("x-admin-wallet") || "";
  return addr.toLowerCase() === ADMIN_WALLET;
}

function toRows(logs: WeeklyPayoutLogEntry[]) {
  const rows: Array<{
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
  }> = [];

  for (const log of logs) {
    for (const result of log.results || []) {
      rows.push({
        weekId: log.weekId,
        at: log.at,
        status: log.status,
        mode: log.mode,
        force: log.force,
        autoClaimPendingTickets: log.autoClaimPendingTickets,
        potBf: log.potBf,
        group: result.group || "n/a",
        player: result.playerName || "",
        playerUsername: result.playerUsername || "",
        wallet: result.to || "",
        amountBf: Number(result.amountBf || 0),
        txHash: result.txHash || "",
        basescanUrl: result.txHash ? `https://basescan.org/tx/${result.txHash}` : "",
        ok: Boolean(result.ok),
        error: result.error || "",
      });
    }
  }

  return rows;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 200);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;
  const weekId = req.nextUrl.searchParams.get("weekId") || undefined;

  const logs = await getWeeklyPayoutHistory(limit, weekId);
  const rows = toRows(logs);

  return NextResponse.json({
    rows,
    logs,
    totalRows: rows.length,
    totalPayoutRuns: logs.length,
  });
}
