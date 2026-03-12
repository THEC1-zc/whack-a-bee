"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { stringToHex } from "viem";
import type { AdminAction } from "@/lib/adminAuth";

export async function ensureAdminSession(address: string) {
  const normalized = address.toLowerCase();
  const me = await fetch("/api/admin/auth/session", { credentials: "include" }).then((r) => r.json()).catch(() => null);
  if (me?.ok && typeof me.address === "string" && me.address.toLowerCase() === normalized) {
    return true;
  }

  const challengeRes = await fetch("/api/admin/auth/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "admin_login", address: normalized }),
  });
  const challenge = await challengeRes.json().catch(() => ({}));
  if (!challengeRes.ok || !challenge?.message || !challenge?.token) {
    throw new Error(challenge?.error || "Admin challenge failed");
  }

  const sig = await sdk.wallet.ethProvider.request({
    method: "personal_sign",
    params: [stringToHex(String(challenge.message)), normalized as `0x${string}`],
  });

  const verifyRes = await fetch("/api/admin/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "admin_login",
      address: normalized,
      challenge: challenge.token,
      message: challenge.message,
      signature: String(sig || ""),
    }),
  });
  const verify = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok || !verify?.ok) {
    throw new Error(verify?.error || "Admin session verification failed");
  }

  return true;
}

export async function adminFetch(address: string, input: RequestInfo | URL, init?: RequestInit) {
  await ensureAdminSession(address);
  return fetch(input, {
    ...init,
    credentials: "include",
  });
}

export async function signAdminAction(address: string, action: Extract<AdminAction, "reset_leaderboard" | "weekly_payout" | "weekly_reset" | "rescue_payout">) {
  await ensureAdminSession(address);
  const normalized = address.toLowerCase();
  const challengeRes = await fetch("/api/admin/auth/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action, address: normalized }),
  });
  const challenge = await challengeRes.json().catch(() => ({}));
  if (!challengeRes.ok || !challenge?.message || !challenge?.token) {
    throw new Error(challenge?.error || "Admin challenge failed");
  }
  const sig = await sdk.wallet.ethProvider.request({
    method: "personal_sign",
    params: [stringToHex(String(challenge.message)), normalized as `0x${string}`],
  });

  return {
    challenge: String(challenge.token),
    message: String(challenge.message),
    signature: String(sig || ""),
  };
}
