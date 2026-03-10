import { NextRequest, NextResponse } from "next/server";
import { verifyGameFee } from "@/lib/gameSessions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const game = await verifyGameFee({
      gameId: String(body?.gameId || ""),
      gameSecret: String(body?.gameSecret || ""),
      txHash: String(body?.txHash || "") as `0x${string}`,
      fid: typeof body?.fid === "number" ? body.fid : undefined,
      username: typeof body?.username === "string" ? body.username : undefined,
      displayName: typeof body?.displayName === "string" ? body.displayName : undefined,
      pfpUrl: typeof body?.pfpUrl === "string" ? body.pfpUrl : undefined,
    });
    return NextResponse.json({
      ok: true,
      gameId: game.gameId,
      status: game.status,
      playerAddress: game.playerAddress,
      capType: game.capType,
      capMultiplier: game.capMultiplier,
      capScore: game.capScore,
      capLabel: game.capLabel,
      waveMultipliers: game.waveMultipliers || [],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Fee verification failed" }, { status: 400 });
  }
}
