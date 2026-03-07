import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonWithCors(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST() {
  return jsonWithCors(
    {
      ok: false,
      error: "End-game payout is disabled",
      errorCode: "PAYOUT_DISABLED",
      payoutToken: "BF",
      prizeStatus: "notpaid",
      potStatus: "notadded",
      prizeReason: "winner payout disabled",
      potReason: "pot payout disabled",
    },
    410
  );
}
