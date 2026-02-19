import { NextResponse } from "next/server";
import { getWeeklyState } from "@/lib/weekly";

export async function GET() {
  const state = await getWeeklyState();
  return NextResponse.json(state);
}

