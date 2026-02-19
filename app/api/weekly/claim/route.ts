import { NextRequest, NextResponse } from "next/server";
import { claimTickets } from "@/lib/weekly";

export async function POST(req: NextRequest) {
  const address = req.headers.get("x-wallet-address") || "";
  if (!address) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
  return NextResponse.json(await claimTickets(address));
}

