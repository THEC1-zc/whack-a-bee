# Session Context — whack-a-bee
> Aggiornato: 2026-03-09

## Stato repo
- **Repo locale**: `/Users/fabio/workspace/whack-a-bee`
- **Branch**: `main`
- **HEAD commit**: (verifica con `git log --oneline -5`)
- **Deploy**: Vercel (auto da main)

## Stack
- Next.js 16 + React 19 + TypeScript
- viem 2.x per interazioni on-chain
- Tailwind CSS 4
- Redis (ioredis) per persistenza ledger / weekly
- Farcaster miniapp SDK

## Architettura payout attuale (BASELINE STABILE)
Il vecchio flusso diretto `writeContract(transfer)` è stato sostituito da:
1. Player paga fee in USDC → prize wallet
2. Backend `/api/payout` (GET) legge pool BF via `realtimeBalanceOf` (SuperToken) con fallback `balanceOf`
3. **POST /api/payout è DISABILITATO** — in attesa di redesign session autenticata
4. Frontend chiama `claimPrize()` sul contratto `BFPayout`
5. Il contratto esegue split automatico: **94.5% player / 4.5% pot / 1% burn**

### Indirizzi chiave
| Cosa | Indirizzo |
|---|---|
| BF Token (SuperToken) | `0x03935c240E52e5624dD95401d9ec67700ca2D138` |
| BFPayout Contract | `0xCdfdbB8B93d8a02319434abA5CC69b31a746ef1D` |
| Prize Wallet | `0xFd144C774582a450a3F578ae742502ff11Ff92Df` |

## File critici
| File | Scopo |
|---|---|
| `app/api/payout/route.ts` | GET pool balance + POST signing (disabilitato) |
| `lib/contracts.ts` | ABI: USDC, BF SuperToken (`SUPERTOKEN_ABI`), ERC20 |
| `lib/txLedger.ts` | Persistenza tx records |
| `lib/weekly.ts` | Logica weekly pot + payout |
| `lib/pricing.ts` | Conversione USDC↔BF |
| `components/App.tsx` | Home principale |

## Env vars necessarie
```
PRIZE_WALLET_PRIVATE_KEY
PRIZE_WALLET_ADDRESS (o NEXT_PUBLIC_PRIZE_WALLET_ADDRESS)
POT_WALLET_ADDRESS
PAYOUT_SIGNER_PRIVATE_KEY
NEXT_PUBLIC_BFPAYOUT_CONTRACT
NEXT_PUBLIC_ADMIN_WALLET
ADMIN_SIGNING_SECRET / ADMIN_API_KEY
BASE_RPC_URLS (comma separated, opzionale)
REDIS_URL
NEXT_PUBLIC_BUILD_STAMP
```

## TODO noti (da sessioni precedenti)
- [ ] POST `/api/payout` disabilitato — redesign con session autenticata lato server
- [ ] Verificare `realtimeBalanceOf` in produzione vs pool gate POOL_EMPTY
- [ ] Contratto BFPayout: eventuali upgrade/fix dopo split 94.5/4.5/1

## Comandi utili
```bash
cd /Users/fabio/workspace/whack-a-bee
npm run dev          # dev server locale
npm run build        # verifica build
git log --oneline -10
git diff HEAD~1
```

## Note tecniche BF SuperToken
- BF è un Superfluid SuperToken (UUPSProxy) creato via stream.fun
- `balanceOf` può restituire valore diverso dal saldo realmente trasferibile (deposit buffer locked da active streams)
- Usare sempre `realtimeBalanceOf(account, timestamp)` → `availableBalance` (int256)
- `availableBalance` può essere negativo se tutti i fondi sono locked
