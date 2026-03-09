import { NextRequest, NextResponse } from "next/server";
import { getAdminGames } from "@/lib/gameSessions";
import { requireAdminRequest } from "@/lib/adminSession";

export async function GET(req: NextRequest) {
  if (!(await requireAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || 200);
  const games = await getAdminGames(limit);
  return NextResponse.json({ ok: true, games });
}
