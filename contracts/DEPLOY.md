# BFPayout Contract — Deploy & Integration Guide

## Panoramica

Contratto per il claim dei premi BF in Whack-a-Butterfly.

**Pattern:** Server firma → Player clama on-chain e paga il gas → Contratto splitta 95/5

```
Fine partita
    │
    ▼
Backend calcola bfGross (prizeUsdc × rate), firma (player, bfGross, nonce, expiry)
    │
    ▼
Frontend chiama claimPrize() — il player paga il gas (~0.0001 ETH su Base)
    │
    ▼
Contratto verifica firma → transferFrom(vault, player, 95%) + transferFrom(vault, pot, 5%)
```

**Wallets:**
- `player`  (`0x...1cDe`) — riceve 95% del prize
- `prize`   (`0x...92Df`) — vault con i BF, zero ETH necessario
- `pot`     (`0x...88e0`) — riceve 5%, paga weekly

---

## Deploy su Base

### Prerequisiti
Usa Remix IDE (remix.ethereum.org) — nessuna installazione locale necessaria.

### Parametri costruttore
```
_bfToken:   0x03935c240E52e5624dD95401d9ec67700ca2D138   (BF token)
_vault:     0xFd144C774582a450a3F578ae742502ff11Ff92Df   (PRIZE_WALLET / 0x...92Df)
_potWallet: 0x468d066995A4C09209c9c165F30Bd76A4FDB88e0   (POT_WALLET  / 0x...88e0)
_signer:    <indirizzo pubblico di PAYOUT_SIGNER_KEY>    (chiave server)
```

### Setup post-deploy (ONE TIME)
Dal PRIZE_WALLET (0x...92Df), chiama su BaseScan → Write Contract:
```
BF.approve(address(BFPayout), 115792089237316195423570985008687907853269984665640564039457584007913129639935)
```
Questo permette al contratto di fare transferFrom vault→player e vault→pot.

### Split automatico nel contratto
- 95% → player  (playerAmount = bfGross - potAmount)
-  5% → pot     (potAmount = bfGross × 500 / 10000)

Il server firma `bfGross` (importo lordo). Il contratto splitta da solo.
**Zero ETH necessario nel PRIZE_WALLET o nel POT_WALLET.**

---

## Variabili d'ambiente Vercel

```env
# Chiave privata del signer (server-side — NON il PRIZE_WALLET)
PAYOUT_SIGNER_PRIVATE_KEY=0x...

# Indirizzo del contratto deployato
NEXT_PUBLIC_BFPAYOUT_CONTRACT=0x...

# Vault (già esistente)
NEXT_PUBLIC_PRIZE_WALLET_ADDRESS=0xFd144C774582a450a3F578ae742502ff11Ff92Df
```

**Importante:** `PAYOUT_SIGNER_PRIVATE_KEY` è una chiave separata e nuova.
Può essere un wallet vuoto — serve solo per firmare messaggi off-chain, non manda mai tx.

---

## API Backend — `/api/payout` (POST)

Riceve da GameScreen:
```json
{
  "playerAddress": "0x...",
  "prizeUsdc": 0.032,
  "feeTxHash": "0x..."
}
```

Deve restituire:
```json
{
  "ok": true,
  "bfGross": "84210526315789473684210",
  "nonce": "0xabc...",
  "expiry": 1234567890,
  "signature": "0x...",
  "contractAddress": "0x..."
}
```

Nota: `bfGross` è l'importo LORDO (100%). Il contratto splitta 95/5 da solo.
Il frontend usa questi dati per chiamare `claimPrize()` on-chain.

---

## ABI minimo per il frontend

```typescript
export const BFPAYOUT_ABI = [
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
  {
    name: "isClaimValid",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "player",    type: "address" },
      { name: "bfGross",   type: "uint256" },
      { name: "nonce",     type: "bytes32" },
      { name: "expiry",    type: "uint256" },
      { name: "signature", type: "bytes"   },
    ],
    outputs: [
      { name: "valid",  type: "bool"   },
      { name: "reason", type: "string" },
    ],
  },
] as const;
```

---

## Firma server-side (viem)

```typescript
import { privateKeyToAccount } from "viem/accounts";
import { encodePacked, keccak256 } from "viem";
import { base } from "viem/chains";

const signerAccount = privateKeyToAccount(
  process.env.PAYOUT_SIGNER_PRIVATE_KEY as `0x${string}`
);
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BFPAYOUT_CONTRACT as `0x${string}`;

export async function signClaim(
  player: `0x${string}`,
  bfGross: bigint,
  nonce: `0x${string}`,  // bytes32
  expiry: bigint
) {
  // Deve matchare _buildHash() in Solidity esattamente
  const raw = keccak256(encodePacked(
    ["uint256", "address", "address", "uint256", "bytes32", "uint256"],
    [BigInt(base.id), CONTRACT_ADDRESS, player, bfGross, nonce, expiry]
  ));
  // signMessage aggiunge il prefisso EIP-191 automaticamente
  return await signerAccount.signMessage({ message: { raw } });
}
```

---

## Sicurezza

| Vettore | Protezione |
|---------|-----------|
| Replay attack | Nonce unico per claim, salvato on-chain |
| Claim scaduto | `expiry` timestamp (suggerito: now + 10 minuti) |
| Firma falsa | Solo `PAYOUT_SIGNER_KEY` può firmare |
| Doppio claim | `usedNonces[nonce] = true` prima dei transfer |
| Cross-chain replay | `block.chainid` incluso nell'hash |
| Cross-contract replay | `address(this)` incluso nell'hash |
| Drain vault | Solo `transferFrom` con importo esatto firmato |
| Split manipulation | Split hardcoded nel contratto (500 bps = 5%) |

---

## TODO deploy checklist

- [ ] Deploy BFPayout su Base (Remix) con i 4 parametri costruttore
- [ ] Salva l'indirizzo del contratto deployato
- [ ] Chiama `BF.approve(BFPayout, MaxUint256)` dal PRIZE_WALLET (0x...92Df)
- [ ] Genera nuova chiave `PAYOUT_SIGNER_PRIVATE_KEY` (wallet vuoto)
- [ ] Aggiungi env vars su Vercel: `PAYOUT_SIGNER_PRIVATE_KEY`, `NEXT_PUBLIC_BFPAYOUT_CONTRACT`
- [ ] Ricostruisci `/api/payout/route.ts` — solo firma, niente tx server-side
- [ ] Aggiorna `lib/payments.ts` → `claimPrize()` chiama il contratto on-chain
- [ ] Testa con una partita reale
