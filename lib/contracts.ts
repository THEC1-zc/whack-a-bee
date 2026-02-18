// USDC on Base
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const ENV_PRIZE_WALLET = process.env.NEXT_PUBLIC_PRIZE_WALLET_ADDRESS as string | undefined;
export const PRIZE_WALLET =
  ((ENV_PRIZE_WALLET && ENV_PRIZE_WALLET !== "undefined")
    ? (ENV_PRIZE_WALLET as `0x${string}`)
    : ("0xFd144C774582a450a3F578ae742502ff11Ff92Df" as `0x${string}`));

// BF token on Base
export const BF_ADDRESS = "0x03935c240E52e5624dD95401d9ec67700ca2D138" as const;
export const BF_DECIMALS = 18;

// USDC has 6 decimals
export const USDC_DECIMALS = 6;

export const USDC_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

// Convert USDC amount (human) to contract units (6 decimals)
export function toUSDCUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

// Convert contract units to human readable
export function fromUSDCUnits(units: bigint): number {
  return Number(units) / 10 ** USDC_DECIMALS;
}

export function toBFUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** BF_DECIMALS));
}

export function fromBFUnits(units: bigint): number {
  return Number(units) / 10 ** BF_DECIMALS;
}
