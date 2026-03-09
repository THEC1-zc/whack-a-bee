import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_WALLET = (process.env.ADMIN_WALLET || process.env.NEXT_PUBLIC_ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe").toLowerCase();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";

// Session secret must be explicitly set — no silent fallback to API key.
// If not configured the admin cookie auth is disabled (header token still works).
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "";

const COOKIE_NAME = "wab_admin";

type AdminCookiePayload = {
  address: string;
  exp: number;
};

function sign(value: string) {
  if (!ADMIN_SESSION_SECRET) return "";
  return crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(value).digest("hex");
}

function encode(payload: AdminCookiePayload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = sign(body);
  if (!sig) return null;
  return `${body}.${sig}`;
}

function decode(token: string | undefined | null): AdminCookiePayload | null {
  if (!token || !ADMIN_SESSION_SECRET) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  // Constant-time comparison to prevent timing attacks
  const expected = sign(body);
  if (!expected) return null;
  if (
    expected.length !== sig.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdminCookiePayload;
    if (payload.address.toLowerCase() !== ADMIN_WALLET) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getAdminWallet() {
  return ADMIN_WALLET;
}

export function hasAdminSessionSecret() {
  return Boolean(ADMIN_SESSION_SECRET);
}

export function createAdminSessionCookie(address: string) {
  return encode({ address: address.toLowerCase(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
}

export async function hasAdminSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  return Boolean(decode(token));
}

export async function getAdminSessionAddress() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  return decode(token)?.address || null;
}

export async function requireAdminRequest(req: NextRequest) {
  const headerToken = req.headers.get("x-admin-token") || "";
  if (ADMIN_API_KEY && headerToken === ADMIN_API_KEY) return true;
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;
  return Boolean(decode(cookieToken));
}

export function setAdminCookie(res: NextResponse, address: string) {
  const token = createAdminSessionCookie(address);
  if (!token) return; // session secret not configured — skip cookie
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearAdminCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });
}
