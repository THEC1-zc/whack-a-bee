import crypto from "node:crypto";

export type AdminAction = "reset_leaderboard";

type ChallengePayload = {
  action: AdminAction;
  address: string;
  nonce: string;
  exp: number;
};

function getSecret() {
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
  const message = [
    "Whack-a-butterfly Admin Authorization",
    `Action: ${action}`,
    `Wallet: ${normalized}`,
    `Nonce: ${payload.nonce}`,
    `Expires: ${new Date(payload.exp).toISOString()}`,
  ].join("\n");

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
