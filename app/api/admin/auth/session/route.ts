import { NextResponse } from "next/server";
import { getAdminSessionAddress } from "@/lib/adminSession";

export async function GET() {
  const address = await getAdminSessionAddress();
  if (!address) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, address });
}
