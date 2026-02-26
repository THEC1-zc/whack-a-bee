import { NextRequest, NextResponse } from "next/server";
import { getAdminWallet } from "@/lib/weekly";
import { createAdminChallenge, type AdminAction } from "@/lib/adminAuth";

const ADMIN_WALLET = getAdminWallet();

function isAuthorizedWallet(req: NextRequest) {
  const addr = req.headers.get("x-admin-wallet") || "";
  return addr.toLowerCase() === ADMIN_WALLET;
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedWallet(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action as AdminAction | undefined;
  const address = (body?.address || "").toLowerCase();

  if (!action || action !== "reset_leaderboard") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!address || address !== ADMIN_WALLET) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const challenge = createAdminChallenge(action, address);
  if (!challenge) {
    return NextResponse.json({ error: "Admin signing secret missing" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, ...challenge });
}
