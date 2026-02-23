import { NextRequest, NextResponse } from "next/server";
import { getAdminWallet, getWeeklyConfig, getWeeklyPayoutLog, setWeeklyConfig } from "@/lib/weekly";

const ADMIN_WALLET = getAdminWallet();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

function isAuthorized(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  if (ADMIN_API_KEY && token === ADMIN_API_KEY) return true;
  const addr = req.headers.get("x-admin-wallet") || "";
  return addr.toLowerCase() === ADMIN_WALLET;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getWeeklyConfig();
  const logs = await getWeeklyPayoutLog(10);
  return NextResponse.json({ config, logs });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const next = await setWeeklyConfig({
    autoPayoutEnabled: typeof body?.autoPayoutEnabled === "boolean" ? body.autoPayoutEnabled : undefined,
    forceBypassSchedule: typeof body?.forceBypassSchedule === "boolean" ? body.forceBypassSchedule : undefined,
    autoClaimPendingTickets: typeof body?.autoClaimPendingTickets === "boolean" ? body.autoClaimPendingTickets : undefined,
  });

  return NextResponse.json({ ok: true, config: next });
}
