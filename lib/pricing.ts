export const BF_PER_USDC = Number(process.env.NEXT_PUBLIC_BF_PER_USDC || "5100000");

export function usdcToBf(usdcAmount: number): number {
  return usdcAmount * BF_PER_USDC;
}

export function bfToUsdc(bfAmount: number): number {
  return bfAmount / BF_PER_USDC;
}

