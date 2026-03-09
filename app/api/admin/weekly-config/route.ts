import { NextRequest, NextResponse } from "next/server";
import { getWeeklyConfig, getWeeklyPayoutLog, setWeeklyConfig } from "@/lib/weekly";
import { requireAdminRequest } from "@/lib/adminSession";

export async function GET(req: NextRequest) {
  if (!(await requireAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getWeeklyConfig();
  const logs = await getWeeklyPayoutLog(10);
  return NextResponse.json({ config, logs });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminRequest(req))) {
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
