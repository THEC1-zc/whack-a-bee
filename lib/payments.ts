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
  } catch (e: any) {
    console.error("payGameFee error:", e);
    const msg = e?.message || "Transaction failed";
    // User rejected
    if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
      return { success: false, error: "Transaction cancelled" };
    }
    return { success: false, error: msg };
  }
}

// Pay prize to winner: called from backend API (server-side)
// This is a placeholder — real payout needs a backend wallet with USDC
export async function claimPrize(
  recipientAddress: `0x${string}`,
  prizeAmount: number
): Promise<{ success: boolean; txHash?: string; error?: string; bfAmount?: number }> {
  try {
    const response = await fetch("/api/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: recipientAddress,
        amount: prizeAmount,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || "Payout failed" };
    }

    return { success: true, txHash: data.txHash, bfAmount: data.bfAmount };
  } catch (e: any) {
    return { success: false, error: e?.message || "Payout request failed" };
  }
}
