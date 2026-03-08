import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, fallback, formatEther } from "viem";
import { base } from "viem/chains";
import { BF_ADDRESS, USDC_ADDRESS, ERC20_ABI, USDC_ABI, fromBFUnits, fromUSDCUnits } from "@/lib/contracts";
import { getAdminWallet } from "@/lib/weekly";

const ADMIN_WALLET = getAdminWallet();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

const WALLETS = {
  prize:  (process.env.NEXT_PUBLIC_PRIZE_WALLET_ADDRESS || "0xFd144C774582a450a3F578ae742502ff11Ff92Df") as `0x${string}`,
  pot:    "0x468d066995A4C09209c9c165F30Bd76A4FDB88e0" as `0x${string}`,
  burn:   "0x5c29b12A731789182012D769B734D77eE15e530F" as `0x${string}`,
};

function isAuthorized(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  if (ADMIN_API_KEY && token === ADMIN_API_KEY) return true;
  return (req.headers.get("x-admin-wallet") || "").toLowerCase() === ADMIN_WALLET;
}

function client() {
  return createPublicClient({
    chain: base,
    transport: fallback([
      http("https://mainnet.base.org"),
      http("https://base.llamarpc.com"),
    ]),
  });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pub = client();
  const walletKeys = Object.keys(WALLETS) as (keyof typeof WALLETS)[];

  const results: Record<string, { address: string; eth: number; usdc: number; bf: number }> = {};

  await Promise.all(walletKeys.map(async (name) => {
    const addr = WALLETS[name];
    const [ethRaw, usdcRaw, bfRaw] = await Promise.all([
      pub.getBalance({ address: addr }),
      pub.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "balanceOf", args: [addr] }),
      pub.readContract({ address: BF_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] }),
    ]);
    results[name] = {
      address: addr,
      eth: parseFloat(formatEther(ethRaw as bigint)),
      usdc: fromUSDCUnits(usdcRaw as bigint),
      bf: fromBFUnits(bfRaw as bigint),
    };
  }));

  return NextResponse.json({ wallets: results });
}
