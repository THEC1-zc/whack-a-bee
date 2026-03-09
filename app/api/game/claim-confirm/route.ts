import { NextRequest, NextResponse } from "next/server";
import { confirmClaimForGame } from "@/lib/gameSessions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const game = await confirmClaimForGame({
      gameId: String(body?.gameId || ""),
      gameSecret: String(body?.gameSecret || ""),
      txHash: String(body?.txHash || "") as `0x${string}`,
    });
    return NextResponse.json({
      ok: true,
      gameId: game.gameId,
      claimTxHash: game.claimTxHash,
      prizeBfGross: game.prizeBfGross,
      ticketAssigned: game.ticketAssigned,
      ticketCount: game.ticketCount,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Claim confirmation failed", errorCode: "CLAIM_CONFIRM_FAILED" }, { status: 400 });
  }
}
