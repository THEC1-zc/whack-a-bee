# BFPayout Contract — Deploy & Integration Guide

## Panoramica

Contratto per il claim dei premi BF in Whack-a-Butterfly.

**Pattern:** Server firma → Player clama on-chain e paga il gas

```
Fine partita
    │
    ▼
Backend genera: (player, bfAmount, nonce, expiry) + firma con PAYOUT_SIGNER_KEY
    │
    ▼
Frontend chiama claimPrize() — il player paga il gas (~0.0001 ETH su Base)
    │
    ▼
Contratto verifica firma → transferFrom(vault, player, bfAmount)
```

---

## Deploy su Base

### Prerequisiti
```bash
cd /Users/fabio/workspace/whack-a-bee
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
# oppure usa Remix IDE direttamente
```

### Parametri costruttore
```
_bfToken:  0x03935c240E52e5624dD95401d9ec67700ca2D138   (BF token)
_vault:    0xFd144C774582a450a3F578ae742502ff11Ff92Df   (PRIZE_WALLET)
_signer:   <indirizzo pubblico di PAYOUT_SIGNER_KEY>    (chiave server)
```

### Setup post-deploy (ONE TIME)
Dal PRIZE_WALLET, chiama:
```
BF.approve(address(BFPayout), type(uint256).max)
```
Questo permette al contratto di prelevare BF dal vault.

---

## Variabili d'ambiente Vercel

```env
# Chiave privata del signer (server-side, NON il PRIZE_WALLET)
PAYOUT_SIGNER_PRIVATE_KEY=0x...

# Indirizzo del contratto deployato
NEXT_PUBLIC_BFPAYOUT_CONTRACT=0x...

# Indirizzo vault (già esistente)
NEXT_PUBLIC_PRIZE_WALLET_ADDRESS=0xFd144C774582a450a3F578ae742502ff11Ff92Df
```

**Importante:** `PAYOUT_SIGNER_KEY` è una chiave separata dal PRIZE_WALLET.
Può essere un wallet nuovo con zero fondi — serve solo per firmare messaggi off-chain.

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
  "bfAmount": "80000000000000000000000",
  "nonce": "0xabc...",
  "expiry": 1234567890,
  "signature": "0x...",
  "contractAddress": "0x..."
}
```

Il frontend usa questi dati per chiamare `claimPrize()` direttamente on-chain.

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
      { name: "bfAmount",  type: "uint256" },
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
      { name: "bfAmount",  type: "uint256" },
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
import { encodePacked, keccak256, toHex } from "viem";

const signerAccount = privateKeyToAccount(process.env.PAYOUT_SIGNER_PRIVATE_KEY as `0x${string}`);

export async function signClaim(
  player: `0x${string}`,
  bfAmount: bigint,
  nonce: `0x${string}`,
  expiry: bigint,
  contractAddress: `0x${string}`,
  chainId: bigint
) {
  // Deve matchare _buildHash() in Solidity
  const raw = keccak256(encodePacked(
    ["uint256", "address", "address", "uint256", "bytes32", "uint256"],
    [chainId, contractAddress, player, bfAmount, nonce, expiry]
  ));
  const signature = await signerAccount.signMessage({ message: { raw } });
  return signature;
}
```

---

## Sicurezza

| Vettore | Protezione |
|---------|-----------|
| Replay attack | Nonce unico per claim, salvato on-chain |
| Claim scaduto | `expiry` timestamp (suggerito: now + 10 minuti) |
| Firma falsa | Solo `PAYOUT_SIGNER_KEY` può firmare |
| Doppio claim | `usedNonces[nonce] = true` prima del transfer |
| Cross-chain replay | `block.chainid` incluso nell'hash |
| Cross-contract replay | `address(this)` incluso nell'hash |
| Drain vault | Solo `transferFrom` con importo esatto firmato |

---

## TODO deploy checklist

- [ ] Deploy BFPayout su Base con i parametri sopra
- [ ] Salva l'indirizzo del contratto deployato
- [ ] Chiama `BF.approve(BFPayout, MaxUint256)` dal PRIZE_WALLET
- [ ] Aggiungi `PAYOUT_SIGNER_PRIVATE_KEY` e `NEXT_PUBLIC_BFPAYOUT_CONTRACT` su Vercel
- [ ] Ricostruisci `/api/payout/route.ts` con la firma server-side
- [ ] Aggiorna `lib/payments.ts` → `claimPrize()` chiama il contratto on-chain
- [ ] Testa con una partita reale su testnet prima del mainnet
