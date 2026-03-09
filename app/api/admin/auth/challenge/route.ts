import { NextRequest, NextResponse } from "next/server";
import { getAdminWallet } from "@/lib/adminSession";
import { createAdminChallenge, type AdminAction } from "@/lib/adminAuth";

const ADMIN_WALLET = getAdminWallet();

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body?.action as AdminAction | "admin_login" | undefined;
  const address = String(body?.address || "").toLowerCase();

  if (action !== "reset_leaderboard" && action !== "admin_login") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!address || address !== ADMIN_WALLET) {
    return NextResponse.json({ error: "Unauthorized wallet" }, { status: 401 });
  }

  const challenge = createAdminChallenge("reset_leaderboard", address);
  if (!challenge) {
    return NextResponse.json({ error: "Admin signing secret missing" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, ...challenge, action });
}
