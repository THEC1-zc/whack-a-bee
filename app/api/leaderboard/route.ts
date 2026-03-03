import { NextRequest, NextResponse } from "next/server";
import { saveGameResult, getLeaderboardStats } from "@/lib/leaderboard";
import { logTxRecord } from "@/lib/txLedger";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const difficulty = searchParams.get("difficulty") || undefined;
  return NextResponse.json(await getLeaderboardStats(20, difficulty || undefined));
}

export async function POST(req: NextRequest) {
  try {
    const { fid, username, displayName, pfpUrl, score, difficulty, prize, fee, address, feeTxHash } = await req.json();
    if (!fid || typeof score !== "number") {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    if (typeof prize !== "number" || typeof fee !== "number") {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    await saveGameResult({
      fid,
      username,
      displayName,
      pfpUrl,
      address,
      score,
      prize,
      fee,
      difficulty: difficulty || "medium",
      timestamp: Date.now(),
    });
    if (address && fee > 0) {
      await logTxRecord({
        kind: "game_fee_in",
        status: "ok",
        fid,
        playerUsername: username,
        playerAddress: String(address).toLowerCase(),
        from: String(address).toLowerCase(),
        amountUsdc: fee,
        txHash: typeof feeTxHash === "string" ? feeTxHash : undefined,
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
