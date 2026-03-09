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
  const [isMiniApp, setIsMiniApp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cachedWalletKey = "farcaster_wallet_address";
    const CONTEXT_TIMEOUT_MS = 1500;

    function timeoutContext() {
      return new Promise<null>((resolve) => {
        const id = window.setTimeout(() => {
          window.clearTimeout(id);
          resolve(null);
        }, CONTEXT_TIMEOUT_MS);
      });
    }

    async function init() {
      try {
        const ctx = await Promise.race([sdk.context, timeoutContext()]);
        if (cancelled) return;
        setIsMiniApp(Boolean(ctx));

        if (ctx?.user) {
          const baseUser: FarcasterUser = {
            fid: ctx.user.fid,
            username: ctx.user.username || `fid:${ctx.user.fid}`,
            displayName: ctx.user.displayName || ctx.user.username || `FID ${ctx.user.fid}`,
            pfpUrl: ctx.user.pfpUrl || "",
          };

          let address: string | undefined;
          const cached = typeof window !== "undefined" ? window.localStorage.getItem(cachedWalletKey) : null;
          if (cached && /^0x[0-9a-fA-F]{40}$/.test(cached)) {
            address = cached;
          }

          try {
            const provider = sdk.wallet.ethProvider;
            const accounts = await provider.request({ method: "eth_accounts" });
            const account = Array.isArray(accounts) ? accounts[0] : undefined;
            if (typeof account === "string" && /^0x[0-9a-fA-F]{40}$/.test(account)) {
              address = account;
              if (typeof window !== "undefined") window.localStorage.setItem(cachedWalletKey, account);
            }
          } catch {
            // ignore auto-restore wallet errors
          }

          setUser({ ...baseUser, address });
          setIsConnected(true);
        }

        if (ctx) {
          await sdk.actions.ready();
        }
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
      if (!provider) return null;
      const result = await provider.request({ method: "eth_requestAccounts" });
      const address = (result as string[])[0];
      if (address && user) {
        setUser({ ...user, address });
        if (typeof window !== "undefined") window.localStorage.setItem("farcaster_wallet_address", address);
      }
      return address;
    } catch (e) {
      console.error("Wallet connect error:", e);
      return null;
    }
  }

  function logout() {
    if (typeof window !== "undefined") window.localStorage.removeItem("farcaster_wallet_address");
    setUser(null);
    setIsConnected(false);
  }

  return { user, isLoading, isConnected, isMiniApp, connectWallet, logout };
}
