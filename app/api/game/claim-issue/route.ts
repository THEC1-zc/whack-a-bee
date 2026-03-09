import { NextRequest, NextResponse } from "next/server";
import { issueClaimForGame } from "@/lib/gameSessions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await issueClaimForGame({
      gameId: String(body?.gameId || ""),
      gameSecret: String(body?.gameSecret || ""),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Claim issue failed", errorCode: "CLAIM_ISSUE_FAILED" },
      { status: 400 }
    );
  }
}
