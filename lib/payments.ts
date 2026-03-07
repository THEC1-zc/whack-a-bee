"use client";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { base } from "viem/chains";
import { sdk } from "@farcaster/miniapp-sdk";
import {
  USDC_ADDRESS,
  USDC_ABI,
  PRIZE_WALLET,
  toUSDCUnits,
  fromUSDCUnits,
} from "./contracts";

const DEFAULT_APP_URL = "https://whack-a-bee.vercel.app";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// Public client for read-only calls (balance check)
export function getPublicClient() {
  return createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });
}

// Wallet client using Farcaster injected provider
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
    const currentId =
      typeof current === "string" ? parseInt(current, 16) : Number(current);

    if (currentId === base.id) {
      return { ok: true };
    }

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: baseChainHex() }],
      });
      return { ok: true };
    } catch (e: unknown) {
      const code = typeof e === "object" && e && "code" in e ? (e as { code?: unknown }).code : undefined;
      if (code === 4902) {
        const blockExplorerUrl = base.blockExplorers?.default?.url;
        const blockExplorerUrls = blockExplorerUrl ? [blockExplorerUrl] : [];

        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: baseChainHex(),
              chainName: base.name,
              rpcUrls: base.rpcUrls.default.http,
              nativeCurrency: base.nativeCurrency,
              blockExplorerUrls,
            },
          ],
        });

        return { ok: true };
      }

      return {
        ok: false,
        error: "Switch your wallet network to Base (chain id 8453) and try again.",
      };
    }
  } catch {
    return {
      ok: false,
      error: "Switch your wallet network to Base (chain id 8453) and try again.",
    };
  }
}

// Get connected wallet address
export async function getAddress(): Promise<`0x${string}` | null> {
  try {
    const walletClient = getWalletClient();
    const [address] = await walletClient.requestAddresses();
    return address;
  } catch {
    return null;
  }
}

// Get USDC balance of an address (returns human-readable number)
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

// Pay game fee: player sends USDC to prize wallet
export async function payGameFee(
  feeAmount: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const chainCheck = await ensureBaseChain();
    if (!chainCheck.ok) {
      return { success: false, error: chainCheck.error };
    }

    const walletClient = getWalletClient();
    const [address] = await walletClient.requestAddresses();

    if (!address) {
      return { success: false, error: "No wallet connected" };
    }

    // Check balance first
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

    // Wait for confirmation
    const publicClient = getPublicClient();
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return { success: true, txHash };
  } catch (e: unknown) {
    console.error("payGameFee error:", e);
    const msg = getErrorMessage(e, "Transaction failed");
    // User rejected
    if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
      return { success: false, error: "Transaction cancelled" };
    }
    return { success: false, error: msg };
  }
}

// ABI minimo per BFPayout.claimPrize
const BFPAYOUT_ABI = [
  {
    name: "claimPrize",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player",    type: "address" },
      { name: "bfGross",   type: "uint256" },
      { name: "nonce",     type: "bytes32" },
      { name: "expiry",    type: "uint256" },
      { name: "signature", type: "bytes"   },
    ],
    outputs: [],
  },
] as const;

/**
 * Step 1: chiama /api/payout per ottenere la firma server-side
 * Step 2: chiama claimPrize() sul contratto BFPayout — player paga gas
 * Il contratto splitta automaticamente: 94.5% player / 4.5% pot / 1% burn
 */
export async function claimPrize(
  recipientAddress: `0x${string}`,
  prizeAmount: number
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
  bfAmount?: number;
  payoutToken?: "BF" | "USDC";
  prizeStatus?: "paid" | "notpaid";
  potStatus?: "added" | "notadded";
  prizeReason?: string | null;
  potReason?: string | null;
  errorCode?: string;
  details?: unknown;
}> {
  try {
    // Step 1 — chiedi firma al backend
    const response = await fetch("/api/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: recipientAddress, amount: prizeAmount }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      return {
        success: false,
        error: data?.error || `Payout signing failed (${response.status})`,
        errorCode: data?.errorCode || "SIGN_FAILED",
        payoutToken: "BF",
        prizeStatus: "notpaid",
        potStatus: "notadded",
        prizeReason: data?.error || null,
        potReason: null,
      };
    }

    const { bfGross, nonce, expiry, signature, contractAddress } = data;

    // Step 2 — chiama claimPrize() on-chain (player paga gas)
    const chainCheck = await ensureBaseChain();
    if (!chainCheck.ok) {
      return { success: false, error: chainCheck.error, errorCode: "WRONG_CHAIN", prizeStatus: "notpaid", potStatus: "notadded" };
    }

    const walletClient = getWalletClient();
    const [address] = await walletClient.requestAddresses();
    if (!address) {
      return { success: false, error: "No wallet connected", errorCode: "NO_WALLET", prizeStatus: "notpaid", potStatus: "notadded" };
    }

    const txHash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: BFPAYOUT_ABI,
      functionName: "claimPrize",
      args: [
        recipientAddress,
        BigInt(bfGross),
        nonce as `0x${string}`,
        BigInt(expiry),
        signature as `0x${string}`,
      ],
      account: address,
    });

    // Step 3 — aspetta conferma on-chain
    const publicClient = getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === "reverted") {
      return {
        success: false,
        txHash,
        error: "Transaction reverted on-chain",
        errorCode: "TX_REVERTED",
        prizeStatus: "notpaid",
        potStatus: "notadded",
      };
    }

    return {
      success: true,
      txHash,
      payoutToken: "BF",
      prizeStatus: "paid",
      potStatus: "added",
      bfAmount: data.split?.playerBf,
      prizeReason: null,
      potReason: null,
    };

  } catch (e: unknown) {
    const msg = getErrorMessage(e, "Claim failed");
    if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
      return {
        success: false,
        error: "Transaction cancelled",
        errorCode: "USER_REJECTED",
        prizeStatus: "notpaid",
        potStatus: "notadded",
      };
    }
    return {
      success: false,
      error: msg,
      errorCode: "CLAIM_ERROR",
      prizeStatus: "notpaid",
      potStatus: "notadded",
    };
  }
}
