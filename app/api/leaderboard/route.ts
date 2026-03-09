import { NextRequest, NextResponse } from "next/server";
import { saveGameResult, getLeaderboardStats } from "@/lib/leaderboard";
import { logTxRecord } from "@/lib/txLedger";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const difficulty = searchParams.get("difficulty") || undefined;
  return NextResponse.json(await getLeaderboardStats(20, difficulty || undefined));
}

export async function POST(req: NextRequest) {
  void req;
  return NextResponse.json({
    error: "Leaderboard submission temporarily disabled pending authenticated server-side game session redesign",
    errorCode: "LEADERBOARD_SUBMIT_DISABLED",
  }, { status: 503 });
}
