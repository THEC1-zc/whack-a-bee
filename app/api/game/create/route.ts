import { NextRequest, NextResponse } from "next/server";
import { createGameSession } from "@/lib/gameSessions";
import type { Difficulty } from "@/lib/gameRules";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const difficulty = String(body?.difficulty || "") as Difficulty;
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    return NextResponse.json({ ok: false, error: "Invalid difficulty" }, { status: 400 });
  }
  const session = await createGameSession(difficulty);
  return NextResponse.json({ ok: true, ...session });
}
