import { NextRequest, NextResponse } from "next/server";
import { getAdminWallet } from "@/lib/weekly";
import { getTxRecords, type TxKind } from "@/lib/txLedger";

const ADMIN_WALLET = getAdminWallet();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

function isAuthorized(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  if (ADMIN_API_KEY && token === ADMIN_API_KEY) return true;
  const addr = req.headers.get("x-admin-wallet") || "";
  return addr.toLowerCase() === ADMIN_WALLET;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 200);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 200;
  const statusRaw = req.nextUrl.searchParams.get("status") || undefined;
  const status = statusRaw === "ok" || statusRaw === "failed" ? statusRaw : undefined;

  const kindsRaw = req.nextUrl.searchParams.get("kinds") || "";
  const kinds = kindsRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean) as TxKind[];

  const records = await getTxRecords({
    limit,
    status,
    kinds: kinds.length ? kinds : undefined,
  });

  return NextResponse.json({ records, total: records.length });
}
