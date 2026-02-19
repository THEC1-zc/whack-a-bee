import { NextResponse } from "next/server";
import { getBfPerUsdc } from "@/lib/pricing";

export async function GET() {
  const bfPerUsdc = await getBfPerUsdc();
  return NextResponse.json({ bfPerUsdc });
}

