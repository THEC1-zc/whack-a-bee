import { NextRequest, NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

function isCronAuthorized(req: NextRequest) {
  const bearer = req.headers.get("authorization") || "";
  const token = req.headers.get("x-cron-secret") || (bearer.startsWith("Bearer ") ? bearer.slice(7) : "");
  return Boolean(CRON_SECRET && token && token === CRON_SECRET);
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!APP_URL) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL missing" }, { status: 500 });
  }
  if (!ADMIN_API_KEY) {
    return NextResponse.json({ error: "ADMIN_API_KEY missing" }, { status: 500 });
  }

  const response = await fetch(`${APP_URL}/api/admin/weekly-payout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": ADMIN_API_KEY,
    },
    body: JSON.stringify({ mode: "auto", force: false }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({ ok: false, ...data }, { status: response.status });
  }

  return NextResponse.json({ ok: true, run: data });
}
