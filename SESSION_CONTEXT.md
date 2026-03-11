# Session Context — whack-a-bee
> Aggiornato: 2026-03-11

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

## Architettura payout attuale
Il gioco usa sessioni server-side e claim firmate:
1. `POST /api/game/create` crea una game session con `gameId` + `gameSecret`
2. Player paga la fee in USDC → prize wallet
3. `POST /api/game/fee-verify` verifica la fee on-chain e attiva la run
4. `POST /api/game/finish` valida score/hit stats e calcola il premio
5. `POST /api/game/claim-issue` firma la claim BF lato server
6. Frontend chiama `BFPayout.claimPrize()` on-chain
7. `POST /api/game/claim-confirm` conferma la tx e finalizza la partita

Split contratto: **94.5% player / 4.5% weekly pot / 1% burn**

### Indirizzi chiave
| Cosa | Indirizzo |
|---|---|
| BF Token (SuperToken) | `0x03935c240E52e5624dD95401d9ec67700ca2D138` |
| BFPayout Contract | `0xCdfdbB8B93d8a02319434abA5CC69b31a746ef1D` |
| Prize Wallet | `0xFd144C774582a450a3F578ae742502ff11Ff92Df` |

## File critici
| File | Scopo |
|---|---|
| `app/api/game/create/route.ts` | Crea game session server-side |
| `app/api/game/fee-verify/route.ts` | Verifica fee e attiva la run |
| `app/api/game/finish/route.ts` | Valida score e payout |
| `app/api/game/claim-issue/route.ts` | Firma la claim payout |
| `app/api/game/claim-confirm/route.ts` | Conferma la tx payout |
| `app/api/payout/route.ts` | GET pool balance BF |
| `lib/contracts.ts` | ABI: USDC, BF SuperToken (`SUPERTOKEN_ABI`), ERC20 |
| `lib/txLedger.ts` | Persistenza tx records |
| `lib/weekly.ts` | Logica weekly pot + payout |
| `lib/pricing.ts` | Conversione USDC↔BF |
| `lib/gameRules.ts` | Difficoltà, game types, timing, punti |
| `lib/gameSessions.ts` | Session storage + validazione server |
| `components/App.tsx` | Home principale |

## Env vars necessarie
```
PRIZE_WALLET_ADDRESS (o NEXT_PUBLIC_PRIZE_WALLET_ADDRESS)
POT_WALLET_ADDRESS
POT_WALLET_PRIVATE_KEY
PAYOUT_SIGNER_PRIVATE_KEY
NEXT_PUBLIC_BFPAYOUT_CONTRACT
NEXT_PUBLIC_ADMIN_WALLET
ADMIN_SESSION_SECRET
ADMIN_SIGNING_SECRET
ADMIN_API_KEY
CRON_SECRET
BASE_RPC_URLS (comma separated, opzionale)
REDIS_URL
NEXT_PUBLIC_BUILD_STAMP
```

## Economia live
- Fee:
  - easy `0.015`
  - medium `0.025`
  - hard `0.035`
- Waves:
  - easy `15`
  - medium `13`
  - hard `8`
- Max points:
  - easy `45`
  - medium `65`
  - hard `85`
- PPP:
  - easy `0.00041061`
  - medium `0.00099418`
  - hard `0.00088064`
- Game types:
  - Low `0.9x` `15%`
  - Nice `1.1x` `20%`
  - Average `1.25x` `35%`
  - Big `2x` `15%`
  - Mega `3x` `5%`
  - Jolly `10%` (wave-by-wave reroll)
- Weekly window:
  - Sunday-based CET week id
  - snapshot Sunday `00:00` CET
  - payout Sunday `00:05` CET

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
