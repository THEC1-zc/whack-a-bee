"use client";

import { createPublicClient, createWalletClient, custom, http, stringToHex } from "viem";
import { base } from "viem/chains";
import { sdk } from "@farcaster/miniapp-sdk";
import {
  USDC_ADDRESS,
  USDC_ABI,
  PRIZE_WALLET,
  toUSDCUnits,
  fromUSDCUnits,
} from "./contracts";
import type { Difficulty } from "@/lib/gameRules";

const BFPAYOUT_ABI = [
  {
    name: "claimPrize",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "bfGross", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "expiry", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

type CreateGameResponse = {
  ok: true;
  gameId: string;
  gameSecret: string;
  difficulty: Difficulty;
  feeExpectedUsdc: number;
  capMultiplier: number;
  capLabel: string;
  capIcon: string;
  capScore: number;
  expiresAt: number;
};

type FinishGameResponse = {
  ok: true;
  gameId: string;
  scoreRealized: number;
  scorePossible: number;
  prizeUsdc: number;
  prizeBfGross: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function buildFinishAuthMessage(params: {
  gameId: string;
  score: number;
  hitStats: { normal: number; fast: number; fuchsia: number; bomb: number; super: number };
}) {
  return [
    "Whack-a-Butterfly Game Finish",
    `Game: ${params.gameId}`,
    `Score: ${params.score}`,
    `Hits: normal=${params.hitStats.normal},fast=${params.hitStats.fast},fuchsia=${params.hitStats.fuchsia},bomb=${params.hitStats.bomb},super=${params.hitStats.super}`,
  ].join("\n");
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

export function getPublicClient() {
  return createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });
}

export function getWalletClient() {
  return createWalletClient({
    chain: base,
    transport: custom(sdk.wallet.ethProvider),
  });
}

function baseChainHex() {
  return `0x${base.id.toString(16)}`;
}

async function ensureBaseChain(): Promise<{ ok: boolean; error?: string }> {
  const provider = sdk.wallet.ethProvider;
  try {
    const current = await provider.request({ method: "eth_chainId" });
    const currentId = typeof current === "string" ? parseInt(current, 16) : Number(current);
    if (currentId === base.id) return { ok: true };

    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: baseChainHex() }],
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Switch your wallet network to Base (chain id 8453) and try again." };
  }
}

export async function getAddress(): Promise<`0x${string}` | null> {
  try {
    const walletClient = getWalletClient();
    const [address] = await walletClient.requestAddresses();
    return address;
  } catch {
    return null;
  }
}

export async function getUSDCBalance(address: `0x${string}`): Promise<number> {
  try {
    const client = getPublicClient();
    const balance = await client.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [address],
    });
    return fromUSDCUnits(balance as bigint);
  } catch {
    return 0;
  }
}

export async function payGameFee(
  feeAmount: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const chainCheck = await ensureBaseChain();
    if (!chainCheck.ok) return { success: false, error: chainCheck.error };

    const walletClient = getWalletClient();
    const [address] = await walletClient.requestAddresses();
    if (!address) return { success: false, error: "No wallet connected" };

    const balance = await getUSDCBalance(address);
    if (balance < feeAmount) {
      return {
        success: false,
        error: `Insufficient USDC balance. You have ${balance.toFixed(4)} USDC, need ${feeAmount} USDC`,
      };
    }

    const amount = toUSDCUnits(feeAmount);
    const txHash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "transfer",
      args: [PRIZE_WALLET, amount],
      account: address,
    });

    const publicClient = getPublicClient();
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { success: true, txHash };
  } catch (e: unknown) {
    const msg = getErrorMessage(e, "Transaction failed");
    if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
      return { success: false, error: "Transaction cancelled" };
    }
    return { success: false, error: msg };
  }
}

export async function createGameSession(
  difficulty: Difficulty,
  playerAddress?: string
): Promise<CreateGameResponse> {
  const res = await fetch("/api/game/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Pass address for server-side anti-spam rate limiting
    body: JSON.stringify({ difficulty, address: playerAddress }),
  });
  const data = await parseJson(res);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Failed to create game session");
  }
  return data as CreateGameResponse;
}

export async function verifyGameFeeSession(params: {
  gameId: string;
  gameSecret: string;
  txHash: `0x${string}`;
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
}) {
  const res = await fetch("/api/game/fee-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await parseJson(res);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Fee verification failed");
  }
  return data;
}

export async function finishGameSession(params: {
  gameId: string;
  gameSecret: string;
  score: number;
  hitStats: { normal: number; fast: number; fuchsia: number; bomb: number; super: number };
}) {
  const walletClient = getWalletClient();
  const [address] = await walletClient.requestAddresses();
  if (!address) {
    throw new Error("No wallet connected");
  }
  const finishMessage = buildFinishAuthMessage({
    gameId: params.gameId,
    score: params.score,
    hitStats: params.hitStats,
  });
  const finishSignature = await sdk.wallet.ethProvider.request({
    method: "personal_sign",
    params: [stringToHex(finishMessage), address],
  });

  const res = await fetch("/api/game/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      finishMessage,
      finishSignature,
    }),
  });
  const data = await parseJson(res);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Game finish failed");
  }
  return data as FinishGameResponse;
}

export async function claimPrize(
  gameId: string,
  gameSecret: string
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
  bfAmount?: number;
  prizeStatus?: "paid" | "notpaid";
  potStatus?: "added" | "notadded";
  prizeReason?: string | null;
  potReason?: string | null;
  errorCode?: string;
}> {
  try {
    // Step 1: request a signed claim from the server via the dedicated route
    const signRes = await fetch("/api/game/claim-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, gameSecret }),
    });
    const signData = await parseJson(signRes);
    if (!signRes.ok || !signData?.ok) {
      return {
        success: false,
        error: signData?.error || `Payout signing failed (${signRes.status})`,
        errorCode: signData?.errorCode || "SIGN_FAILED",
        prizeStatus: "notpaid",
        potStatus: "notadded",
        prizeReason: signData?.error || null,
        potReason: null,
      };
    }

    // Step 2: ensure player is on Base
    const chainCheck = await ensureBaseChain();
    if (!chainCheck.ok) {
      return { success: false, error: chainCheck.error, errorCode: "WRONG_CHAIN", prizeStatus: "notpaid", potStatus: "notadded" };
    }

    // Step 3: player calls claimPrize on-chain (signed by server signer)
    const walletClient = getWalletClient();
    const [address] = await walletClient.requestAddresses();
    if (!address) {
      return { success: false, error: "No wallet connected", errorCode: "NO_WALLET", prizeStatus: "notpaid", potStatus: "notadded" };
    }

    const txHash = await walletClient.writeContract({
      address: signData.contractAddress as `0x${string}`,
      abi: BFPAYOUT_ABI,
      functionName: "claimPrize",
      args: [
        signData.recipient as `0x${string}`,
        BigInt(signData.bfGross),
        signData.nonce as `0x${string}`,
        BigInt(signData.expiry),
        signData.signature as `0x${string}`,
      ],
      account: address,
    });

    const publicClient = getPublicClient();
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Step 4: confirm on-chain claim to server
    const confirmRes = await fetch("/api/game/claim-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, gameSecret, txHash }),
    });
    const confirmData = await parseJson(confirmRes);
    if (!confirmRes.ok || !confirmData?.ok) {
      return {
        success: false,
        txHash,
        error: confirmData?.error || "Claim confirmation failed",
        errorCode: confirmData?.errorCode || "CLAIM_CONFIRM_FAILED",
        prizeStatus: "notpaid",
        potStatus: "notadded",
        prizeReason: confirmData?.error || null,
        potReason: confirmData?.error || null,
      };
    }

    return {
      success: true,
      txHash,
      bfAmount: Number(confirmData.prizeBfGross || 0),
      prizeStatus: "paid",
      potStatus: "added",
      prizeReason: null,
      potReason: null,
    };
  } catch (e: unknown) {
    const msg = getErrorMessage(e, "Claim failed");
    return {
      success: false,
      error: msg,
      errorCode: "CLAIM_FAILED",
      prizeStatus: "notpaid",
      potStatus: "notadded",
      prizeReason: msg,
      potReason: msg,
    };
  }
}
