import { NextRequest, NextResponse } from "next/server";
import { getAdminWallet } from "@/lib/adminSession";
import { createAdminChallenge, type AdminAction } from "@/lib/adminAuth";

const ADMIN_WALLET = getAdminWallet();

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const requestedAction = body?.action as string | undefined;
  const address = String(body?.address || "").toLowerCase();

  if (!address || address !== ADMIN_WALLET) {
    return NextResponse.json({ error: "Unauthorized wallet" }, { status: 401 });
  }

  // Map request action to the correct AdminAction — prevents token reuse across actions
  let action: AdminAction;
  if (requestedAction === "admin_login") {
    action = "admin_login";
  } else if (requestedAction === "reset_leaderboard") {
    action = "reset_leaderboard";
  } else if (requestedAction === "weekly_payout") {
    action = "weekly_payout";
  } else if (requestedAction === "weekly_reset") {
    action = "weekly_reset";
  } else if (requestedAction === "rescue_payout") {
    action = "rescue_payout";
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const challenge = createAdminChallenge(action, address);
  if (!challenge) {
    return NextResponse.json({ error: "Admin signing secret missing" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, ...challenge, action });
}
