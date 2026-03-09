import { NextRequest, NextResponse } from "next/server";
import { finishGameSession } from "@/lib/gameSessions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const game = await finishGameSession({
      gameId: String(body?.gameId || ""),
      gameSecret: String(body?.gameSecret || ""),
      score: Number(body?.score || 0),
      hitStats: body?.hitStats || {},
      finishMessage: String(body?.finishMessage || ""),
      finishSignature: String(body?.finishSignature || ""),
    });
    return NextResponse.json({
      ok: true,
      gameId: game.gameId,
      scoreRealized: game.scoreRealized,
      scorePossible: game.scorePossible,
      prizeUsdc: game.prizeUsdc,
      prizeBfGross: game.prizeBfGross,
      capLabel: game.capLabel,
      ticketCount: game.ticketCount,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Game finish failed" }, { status: 400 });
  }
}
