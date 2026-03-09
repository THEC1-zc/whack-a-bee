import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  void req;
  return NextResponse.json({ error: "Weekly ticket claim temporarily disabled pending wallet-authenticated session hardening", errorCode: "WEEKLY_AUTH_DISABLED" }, { status: 503 });
}
