"use client";
import { useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

export interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  address?: string;
}

export function useFarcaster() {
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const ctx = await sdk.context;
        if (cancelled) return;

        if (ctx?.user) {
          setUser({
            fid: ctx.user.fid,
            username: ctx.user.username || `fid:${ctx.user.fid}`,
            displayName: ctx.user.displayName || ctx.user.username || `FID ${ctx.user.fid}`,
            pfpUrl: ctx.user.pfpUrl || "",
          });
          setIsConnected(true);
        }

        await sdk.actions.ready();
      } catch (e) {
        console.error("Farcaster init error:", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  async function connectWallet() {
    try {
      const provider = sdk.wallet.ethProvider;
      const result = await provider.request({ method: "eth_requestAccounts" });
      const address = (result as string[])[0];
      if (address && user) {
        setUser({ ...user, address });
      }
      return address;
    } catch (e) {
      console.error("Wallet connect error:", e);
      return null;
    }
  }

  return { user, isLoading, isConnected, connectWallet };
}
