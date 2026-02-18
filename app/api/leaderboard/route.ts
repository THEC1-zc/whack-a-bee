import { NextRequest, NextResponse } from "next/server";
import { saveScore, getLeaderboard } from "@/lib/leaderboard";

export async function GET() {
  return NextResponse.json(getLeaderboard(20));
}

export async function POST(req: NextRequest) {
  try {
    const { fid, username, displayName, pfpUrl, score, difficulty } = await req.json();
    if (!fid || typeof score !== "number") {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    saveScore({ fid, username, displayName, pfpUrl, score, difficulty: difficulty || "medium", timestamp: Date.now() });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
