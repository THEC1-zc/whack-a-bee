import { NextRequest, NextResponse } from "next/server";
import { getAdminStats, resetLeaderboard } from "@/lib/leaderboard";
import { getAdminWallet, getWeeklyState, resetWeeklyState } from "@/lib/weekly";

const ADMIN_WALLET = getAdminWallet();

function isAuthorized(req: NextRequest) {
  const addr = req.headers.get("x-admin-wallet") || "";
  return addr.toLowerCase() === ADMIN_WALLET;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stats = await getAdminStats();
  const weekly = await getWeeklyState();
  return NextResponse.json({ stats, weekly });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (body?.action === "reset") {
    await resetLeaderboard();
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "weekly_reset") {
    await resetWeeklyState();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
