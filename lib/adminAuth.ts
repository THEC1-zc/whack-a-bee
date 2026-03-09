import crypto from "node:crypto";

// admin_login is a dedicated action so its challenge token cannot be replayed
// to authorize other admin operations (e.g. reset_leaderboard).
export type AdminAction = "reset_leaderboard" | "admin_login" | "weekly_payout" | "weekly_reset";

type ChallengePayload = {
  action: AdminAction;
  address: string;
  nonce: string;
  exp: number;
};

function getSecret() {
  // Prefer a dedicated signing secret; fallback to API key only if explicitly set
  return process.env.ADMIN_SIGNING_SECRET || process.env.ADMIN_API_KEY || "";
}

function toB64(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromB64(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(payload: ChallengePayload) {
  const secret = getSecret();
  if (!secret) return null;
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function buildAdminChallengeMessage(payload: ChallengePayload) {
  return [
    "Whack-a-butterfly Admin Authorization",
    `Action: ${payload.action}`,
    `Wallet: ${payload.address}`,
    `Nonce: ${payload.nonce}`,
    `Expires: ${new Date(payload.exp).toISOString()}`,
  ].join("\n");
}

export function createAdminChallenge(action: AdminAction, address: string) {
  const normalized = address.toLowerCase();
  const payload: ChallengePayload = {
    action,
    address: normalized,
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Date.now() + 5 * 60 * 1000,
  };
  const sig = signPayload(payload);
  if (!sig) return null;

  const token = toB64(JSON.stringify({ payload, sig }));
  const message = buildAdminChallengeMessage(payload);

  return { token, message, expiresAt: payload.exp };
}

export function verifyAdminChallenge(token: string, expectedAction: AdminAction, expectedAddress: string) {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "Admin signing secret missing" } as const;

  try {
    const decoded = JSON.parse(fromB64(token)) as { payload: ChallengePayload; sig: string };
    const payload = decoded.payload;
    const expectedSig = signPayload(payload);

    if (!expectedSig || decoded.sig !== expectedSig) {
      return { ok: false, reason: "Invalid challenge signature" } as const;
    }
    if (Date.now() > payload.exp) {
      return { ok: false, reason: "Challenge expired" } as const;
    }
    // Strict action check — an admin_login token cannot authorize reset_leaderboard
    if (payload.action !== expectedAction) {
      return { ok: false, reason: "Invalid action in challenge" } as const;
    }
    if (payload.address !== expectedAddress.toLowerCase()) {
      return { ok: false, reason: "Challenge wallet mismatch" } as const;
    }

    return { ok: true, payload } as const;
  } catch {
    return { ok: false, reason: "Malformed challenge" } as const;
  }
}
