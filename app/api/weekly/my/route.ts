import { NextRequest, NextResponse } from "next/server";
import { getUserTickets } from "@/lib/weekly";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = String(searchParams.get("address") || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return NextResponse.json({ claimed: 0, pending: 0 });
  }
  return NextResponse.json(await getUserTickets(address));
}
