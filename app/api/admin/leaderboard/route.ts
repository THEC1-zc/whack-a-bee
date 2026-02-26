import { NextRequest, NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { getAdminStats, resetLeaderboard } from "@/lib/leaderboard";
import { getAdminWallet, getWeeklyState, resetWeeklyState } from "@/lib/weekly";
import { verifyAdminChallenge } from "@/lib/adminAuth";

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
    const challenge = String(body?.challenge || "");
    const message = String(body?.message || "");
    const signature = String(body?.signature || "");
    if (!challenge || !message || !signature) {
      return NextResponse.json({ error: "Missing signed authorization" }, { status: 400 });
    }

    const verification = verifyAdminChallenge(challenge, "reset_leaderboard", ADMIN_WALLET);
    if (!verification.ok) {
      return NextResponse.json({ error: verification.reason }, { status: 401 });
    }

    const signer = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    }).catch(() => null);
    if (!signer || signer.toLowerCase() !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Invalid wallet signature" }, { status: 401 });
    }

    await resetLeaderboard();
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "weekly_reset") {
    await resetWeeklyState();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
