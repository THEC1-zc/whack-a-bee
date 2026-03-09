import { NextRequest, NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { buildAdminChallengeMessage, verifyAdminChallenge } from "@/lib/adminAuth";
import { getAdminWallet, hasAdminSessionSecret, setAdminCookie } from "@/lib/adminSession";

const ADMIN_WALLET = getAdminWallet();

export async function POST(req: NextRequest) {
  if (!hasAdminSessionSecret()) {
    return NextResponse.json({ error: "ADMIN_SESSION_SECRET missing" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const address = String(body?.address || "").toLowerCase();
  const challenge = String(body?.challenge || "");
  const message = String(body?.message || "");
  const signature = String(body?.signature || "");

  if (!address || address !== ADMIN_WALLET) {
    return NextResponse.json({ error: "Unauthorized wallet" }, { status: 401 });
  }

  // Login challenges must use the dedicated admin_login action —
  // prevents a reset_leaderboard challenge token from being used to log in
  const verification = verifyAdminChallenge(challenge, "admin_login", ADMIN_WALLET);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.reason }, { status: 401 });
  }
  if (message !== buildAdminChallengeMessage(verification.payload)) {
    return NextResponse.json({ error: "Challenge message mismatch" }, { status: 401 });
  }

  const signer = await recoverMessageAddress({
    message,
    signature: signature as `0x${string}`,
  }).catch(() => null);
  if (!signer || signer.toLowerCase() !== ADMIN_WALLET) {
    return NextResponse.json({ error: "Invalid wallet signature" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, address: ADMIN_WALLET });
  setAdminCookie(res, ADMIN_WALLET);
  return res;
}
