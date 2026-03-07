# BFPayout Contract — Deploy & Integration Guide

## Panoramica

Contratto per il claim dei premi BF in Whack-a-Butterfly.

**Pattern:** Server firma → Player clama on-chain e paga il gas → Contratto splitta 94.5 / 4.5 / 1

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
Contratto verifica firma →
  transferFrom(vault → player,     94.5%)
  transferFrom(vault → potWallet,   4.5%)
  transferFrom(vault → burnWallet,  1.0%)
```

**Wallets:**
- `player`     (`0x...1cDe`) — riceve 94.5%
- `prize/vault` (`0x...92Df`) — vault con i BF, zero ETH necessario
- `pot`        (`0x...88e0`) — riceve 4.5%, paga weekly
- `burn`       (`0x5c29...530F`) — riceve 1%, in futuro sarà dead address

---

## Deploy su Base

### Prerequisiti
Usa Remix IDE (remix.ethereum.org) — nessuna installazione locale necessaria.

### Parametri costruttore (5 parametri)
```
_bfToken:    0x03935c240E52e5624dD95401d9ec67700ca2D138   (BF token)
_vault:      0xFd144C774582a450a3F578ae742502ff11Ff92Df   (PRIZE_WALLET / 0x...92Df)
_potWallet:  0x468d066995A4C09209c9c165F30Bd76A4FDB88e0   (POT_WALLET   / 0x...88e0)
_burnWallet: 0x5c29b12A731789182012D769B734D77eE15e530F   (BURN_WALLET  — temp, cambierà)
_signer:     <indirizzo pubblico di PAYOUT_SIGNER_KEY>    (chiave server, no funds needed)
```

### Setup post-deploy (ONE TIME)
Dal PRIZE_WALLET (0x...92Df), chiama su BaseScan → Write Contract:
```
BF.approve(
  address(BFPayout),
  115792089237316195423570985008687907853269984665640564039457584007913129639935
)
```
Questo permette al contratto di fare transferFrom vault→player, vault→pot, vault→burn.

### Split automatico nel contratto (basis points)
| Destinatario | BPS  | %     |
|-------------|------|-------|
| player      | 9450 | 94.5% |
| potWallet   |  450 |  4.5% |
| burnWallet  |  100 |  1.0% |
| **Totale**  | **10000** | **100%** |

Il server firma `bfGross` (importo lordo). Il contratto splitta da solo in una tx atomica.
**Zero ETH necessario nel PRIZE_WALLET, POT_WALLET o BURN_WALLET.**

Per aggiornare il burn address in futuro: `setBurnWallet(newAddress)` dal owner.

---

## Variabili d'ambiente Vercel

```env
# Chiave privata del signer (server-side — NON il PRIZE_WALLET, wallet vuoto)
PAYOUT_SIGNER_PRIVATE_KEY=0x...

# Indirizzo del contratto deployato
NEXT_PUBLIC_BFPAYOUT_CONTRACT=0x...

# Vault (già esistente)
NEXT_PUBLIC_PRIZE_WALLET_ADDRESS=0xFd144C774582a450a3F578ae742502ff11Ff92Df
```

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

Il frontend usa questi dati per chiamare `claimPrize()` on-chain.
Il contratto splitta 94.5 / 4.5 / 1 da solo — il backend non fa nessuna tx.

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
  {
    name: "previewSplit",
    type: "function",
    stateMutability: "pure",
    inputs: [{ name: "bfGross", type: "uint256" }],
    outputs: [
      { name: "playerAmount", type: "uint256" },
      { name: "potAmount",    type: "uint256" },
      { name: "burnAmount",   type: "uint256" },
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
  return await signerAccount.signMessage({ message: { raw } });
}
```

---

## Sicurezza

| Vettore | Protezione |
|---------|-----------|
| Replay attack | Nonce unico per claim, salvato on-chain |
| Claim scaduto | `expiry` timestamp (suggerito: now + 10 min) |
| Firma falsa | Solo `PAYOUT_SIGNER_KEY` può firmare |
| Doppio claim | `usedNonces[nonce] = true` prima dei transfer |
| Cross-chain replay | `block.chainid` incluso nell'hash |
| Cross-contract replay | `address(this)` incluso nell'hash |
| Drain vault | Solo `transferFrom` con importo esatto firmato |
| Split manipulation | Split hardcoded nel contratto (BPS costanti) |

---

## TODO deploy checklist

- [ ] Deploy BFPayout su Base (Remix) con i 5 parametri costruttore
- [ ] Salva l'indirizzo del contratto deployato
- [ ] Chiama `BF.approve(BFPayout, MaxUint256)` dal PRIZE_WALLET (0x...92Df)
- [ ] Genera nuova chiave `PAYOUT_SIGNER_PRIVATE_KEY` (wallet vuoto, zero fondi)
- [ ] Aggiungi env vars su Vercel: `PAYOUT_SIGNER_PRIVATE_KEY`, `NEXT_PUBLIC_BFPAYOUT_CONTRACT`
- [ ] Ricostruisci `/api/payout/route.ts` — solo firma, niente tx server-side
- [ ] Aggiorna `lib/payments.ts` → `claimPrize()` chiama il contratto on-chain
- [ ] Testa con una partita reale
- [ ] Quando pronto: `setBurnWallet(0x000...dead)` per attivare il burn reale
