import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "Tickets are assigned automatically when a claimed game is confirmed",
    errorCode: "WEEKLY_TICKETS_AUTO_ASSIGNED",
  }, { status: 400 });
}
