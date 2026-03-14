import { NextRequest, NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { getAdminStats, getWeeklyAdminStats, resetLeaderboard } from "@/lib/leaderboard";
import { getWeeklyMeta, getWeeklyState, resetWeeklyState } from "@/lib/weekly";
import { getAdminWallet, requireAdminRequest } from "@/lib/adminSession";
import { buildAdminChallengeMessage, verifyAdminChallenge } from "@/lib/adminAuth";

const ADMIN_WALLET = getAdminWallet();


export async function GET(req: NextRequest) {
  if (!(await requireAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stats = await getAdminStats();
  const weeklyMeta = await getWeeklyMeta();
  const weeklyStats = await getWeeklyAdminStats(weeklyMeta.weekId);
  const weekly = await getWeeklyState();
  return NextResponse.json({ stats, weeklyStats, weekly });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminRequest(req))) {
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
    if (message !== buildAdminChallengeMessage(verification.payload)) {
      return NextResponse.json({ error: "Challenge message mismatch" }, { status: 401 });
    }

    const signer = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    }).catch(() => null);
    if (!signer || signer.toLowerCase() !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Invalid wallet signature" }, { status: 401 });
    }

    await resetLeaderboard();
    return NextResponse.json({ ok: false, error: "Total leaderboard is derived from all claimed games and cannot be reset" }, { status: 409 });
  }
  if (body?.action === "weekly_reset") {
    const challenge = String(body?.challenge || "");
    const message = String(body?.message || "");
    const signature = String(body?.signature || "");
    if (!challenge || !message || !signature) {
      return NextResponse.json({ error: "Missing signed authorization" }, { status: 400 });
    }
    const verification = verifyAdminChallenge(challenge, "weekly_reset", ADMIN_WALLET);
    if (!verification.ok) {
      return NextResponse.json({ error: verification.reason }, { status: 401 });
    }
    if (message !== buildAdminChallengeMessage(verification.payload)) {
      return NextResponse.json({ error: "Challenge message mismatch" }, { status: 401 });
    }
    const signer = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    }).catch(() => null);
    if (!signer || signer.toLowerCase() !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Invalid wallet signature" }, { status: 401 });
    }
    await resetWeeklyState();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
