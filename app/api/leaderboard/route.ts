import { NextRequest, NextResponse } from "next/server";
import { getLeaderboardStats, getWeeklyLeaderboardStats } from "@/lib/leaderboard";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const difficulty = searchParams.get("difficulty") || undefined;
  const scope = searchParams.get("scope") === "weekly" ? "weekly" : "total";
  return NextResponse.json(
    scope === "weekly"
      ? await getWeeklyLeaderboardStats(20, difficulty || undefined)
      : await getLeaderboardStats(20, difficulty || undefined)
  );
}
