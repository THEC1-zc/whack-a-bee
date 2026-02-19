export const BF_PER_USDC_FALLBACK = Number(process.env.NEXT_PUBLIC_BF_PER_USDC || "5100000");
const BF_TOKEN = "0x03935c240E52e5624dD95401d9ec67700ca2D138";

type DexPair = {
  priceUsd?: string;
  liquidity?: { usd?: number };
};

let cachedRate = BF_PER_USDC_FALLBACK;
let lastFetch = 0;

export async function getBfPerUsdc(): Promise<number> {
  const now = Date.now();
  if (now - lastFetch < 60_000) return cachedRate; // 1 min cache
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${BF_TOKEN}`, { cache: "no-store" });
    const data = await res.json();
    const pairs: DexPair[] = data?.pairs || [];
    if (!pairs.length) return cachedRate;
    // pick highest liquidity pair
    const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    const priceUsd = Number(best?.priceUsd || 0);
    if (!priceUsd) return cachedRate;
    cachedRate = 1 / priceUsd;
    lastFetch = now;
    return cachedRate;
  } catch {
    return cachedRate;
  }
}

export async function usdcToBf(usdcAmount: number): Promise<number> {
  const rate = await getBfPerUsdc();
  return usdcAmount * rate;
}

export async function bfToUsdc(bfAmount: number): Promise<number> {
  const rate = await getBfPerUsdc();
  return bfAmount / rate;
}
