import { NextRequest, NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { buildAdminChallengeMessage, verifyAdminChallenge } from "@/lib/adminAuth";
import { getAdminGames, rescueUnclaimedGamePayout } from "@/lib/gameSessions";
import { getAdminWallet, requireAdminRequest } from "@/lib/adminSession";

const ADMIN_WALLET = getAdminWallet();

export async function GET(req: NextRequest) {
  if (!(await requireAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || 200);
  const games = await getAdminGames(limit);
  return NextResponse.json({ ok: true, games });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const gameId = String(body?.gameId || "");
  const challenge = String(body?.challenge || "");
  const message = String(body?.message || "");
  const signature = String(body?.signature || "");

  if (!gameId) {
    return NextResponse.json({ error: "Missing gameId" }, { status: 400 });
  }

  const verification = verifyAdminChallenge(challenge, "rescue_payout", ADMIN_WALLET);
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

  try {
    const rescued = await rescueUnclaimedGamePayout(gameId);
    return NextResponse.json({
      ok: true,
      gameId,
      claimMethod: rescued.game.claimMethod,
      prizeTxHash: rescued.prizeTxHash,
      potTxHash: rescued.potTxHash,
      burnTxHash: rescued.burnTxHash,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Rescue payout failed" },
      { status: 400 }
    );
  }
}
