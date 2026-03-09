import { NextRequest, NextResponse } from "next/server";
import { createGameSession } from "@/lib/gameSessions";
import type { Difficulty } from "@/lib/gameRules";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const difficulty = String(body?.difficulty || "") as Difficulty;
    if (!["easy", "medium", "hard"].includes(difficulty)) {
      return NextResponse.json({ ok: false, error: "Invalid difficulty" }, { status: 400 });
    }
    // Pass caller address for anti-spam rate limiting (optional — only enforced if provided)
    const callerAddress = typeof body?.address === "string" ? body.address : undefined;
    const session = await createGameSession(difficulty, callerAddress);
    return NextResponse.json({ ok: true, ...session });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Game creation failed" },
      { status: 400 }
    );
  }
}
