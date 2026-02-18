import { NextRequest, NextResponse } from "next/server";
import { saveScore, getLeaderboard } from "@/lib/leaderboard";

export async function GET() {
  const board = getLeaderboard(10);
  return NextResponse.json(board);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fid, username, displayName, pfpUrl, score } = body;

    if (!fid || typeof score !== "number") {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    saveScore({
      fid,
      username: username || `fid:${fid}`,
      displayName: displayName || username || `FID ${fid}`,
      pfpUrl: pfpUrl || "",
      score,
      timestamp: Date.now(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
