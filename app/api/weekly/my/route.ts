import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  void req;
  return NextResponse.json({ error: "Weekly ticket lookup temporarily disabled pending wallet-authenticated session hardening", errorCode: "WEEKLY_AUTH_DISABLED" }, { status: 503 });
}
