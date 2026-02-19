import { NextRequest, NextResponse } from "next/server";
import { getAdminStats, resetLeaderboard } from "@/lib/leaderboard";

const ADMIN_WALLET = (process.env.ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe").toLowerCase();

function isAuthorized(req: NextRequest) {
  const addr = req.headers.get("x-admin-wallet") || "";
  return addr.toLowerCase() === ADMIN_WALLET;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getAdminStats());
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
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

