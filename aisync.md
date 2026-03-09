# aisync.md — Whack-a-Butterfly (whack-a-bee)
> Aggiornato automaticamente da Claude ad ogni sessione. Non modificare manualmente.

## Repo
- GitHub: `THEC1-zc/whack-a-bee`
- Deploy: Vercel (auto-deploy su push a main)
- Stack: Next.js, TypeScript, Solidity (viem), Superfluid, Supabase/Redis

## Wallets
- `PRIZE_WALLET` (pool BF): `0xFd144C774582a450a3F578ae742502ff11Ff92Df`
- `POT_WALLET` (weekly pot): `0x468d066995A4C09209c9c165F30Bd76A4FDB88e0`
- `ADMIN_WALLET`: `0xd29c790466675153A50DF7860B9EFDb689A21cDe`

## Token BF
- Indirizzo: `0x03935c240E52e5624dD95401d9ec67700ca2D138`
- Tipo: Superfluid SuperToken (UUPSProxy) su stream.fun — Base chain
- ABI rilevante: `SUPERTOKEN_ABI` in `lib/contracts.ts` con `realtimeBalanceOf`

## Economia di gioco (versione attuale)
```
PRIZE_PER_POINT = 0.0008 USDC

DIFFICULTY_CONFIG:
  easy:   fee=0.015 USDC | maxPts=40 | time=30s | break-even=20pt (50% del cap)
  medium: fee=0.025 USDC | maxPts=60 | time=25s | break-even=33pt (55% del cap)
  hard:   fee=0.035 USDC | maxPts=80 | time=20s | break-even=47pt (59% del cap)
```

### Cap moltiplicatore (scelto a inizio partita, ora visibile prima del gioco)
| Livello | Mult | Probabilità |
|---------|------|-------------|
| 🪫 Low   | 0.95× | 21% |
| ✅ Nice  | 1.2×  | 29% |
| 🔥 Average | 1.5× | 30% |
| 🌟 Big   | 2.0×  | 17% |
| 💥 Mega  | 3.0×  | 6%  |

### Tipi farfalla
| Tipo     | Punti | Chance spawn |
|----------|-------|-------------|
| Normal   | +1    | base        |
| Fast ⚡  | +3    | easy 22% / med 25% / hard 30% |
| Fuchsia 💖 | +4  | 15% (max 3/game) |
| Bomb 💥  | −2    | easy 7% / med 10% / hard 18% |
| Super 💜 | +1 +100K BF | 2.5% (7.5% in Mega round) |

### Weekly pot
- 5% di ogni prize lordo va al weekly pot (trattenuto dal prize del giocatore)
- Tickets assegnati in base a score e fee

## File principali
| File | Ruolo |
|------|-------|
| `components/App.tsx` | Config difficoltà, PRIZE_PER_POINT, schermata home |
| `components/GameScreen.tsx` | Logica gioco, spawn, cap, payout flow |
| `app/api/payout/route.ts` | Payout BF al vincitore + 5% al pot |
| `lib/contracts.ts` | ABI contratti (SUPERTOKEN_ABI con realtimeBalanceOf) |
| `lib/pricing.ts` | Rate BF/USDC via DexScreener |
| `lib/txLedger.ts` | Log transazioni (Redis/memory) |
| `app/api/weekly/` | Weekly pot: my tickets, claim, payout |

## Contratto BFPayout
- Indirizzo: `0xCdfdbB8B93d8a02319434abA5CC69b31a746ef1D`
- Split: 94.5% player / 4.5% pot / 1% burn
- Signer pubblico: `0xFD3e2D8a185FA610F81b737F57c2fb547E73d2F8`
- `BF.approve(contratto, MaxUint256)` ✅ fatto dal PRIZE_WALLET
- `setSigner(0xFD3e...2F8)` ✅ fatto
- Env var `PAYOUT_SIGNER_PRIVATE_KEY` ✅ su Vercel
- Env var `NEXT_PUBLIC_BFPAYOUT_CONTRACT` ✅ su Vercel

## Flusso payout (nuovo)
1. Fine partita → GameScreen chiama `claimPrize(address, prizeUsdc)`
2. `lib/payments.ts` → POST `/api/payout` con `{recipient, amount}`
3. Backend firma `(player, bfGross, nonce, expiry)` con `PAYOUT_SIGNER_PRIVATE_KEY`
4. Frontend riceve firma → chiama `BFPayout.claimPrize()` on-chain
5. Player paga gas (~0.0001 ETH) → contratto splitta 94.5/4.5/1 in una tx atomica
6. Zero ETH necessario nel PRIZE_WALLET o POT_WALLET

## Bug noti / In lavorazione
- Nessun bug noto al momento
- Banner "fixing txs issues" rimosso dalla home ✅

## Ultimi cambiamenti (sessione corrente)
- Ribilanciamento economia: fee medium 0.03→0.025, fee hard 0.045→0.035, maxPts easy 48→40, maxPts medium 64→60, PRIZE_PER_POINT 0.001→0.0008
- Cap moltiplicatore ora visibile nella schermata di conferma pagamento (prima che il giocatore approvi la fee)
- Hardening follow-up post session redesign:
  - `finishGameSession` ora richiede una firma wallet del player sul payload di fine partita, e il server verifica che il signer coincida con il wallet che ha pagato la fee.
  - `createGameSession` frontend passa il wallet address, quindi il rate-limit server-side sulle sessioni unpaid ora e' realmente attivo.
  - Admin challenge system separato per azioni: `admin_login`, `reset_leaderboard`, `weekly_reset`, `weekly_payout`.
  - Le route admin che richiedono firma ora validano anche che il `message` firmato coincida esattamente con il challenge token emesso, evitando riuso di firme/challenge su azioni diverse.
  - Le pagine admin ora usano sessione cookie tramite `lib/adminClient.ts` invece di chiamare le API admin senza bootstrap di sessione.
  - `weekly_reset` ora richiede anch'esso firma wallet admin.
  - `ADMIN_SESSION_SECRET` mancante ora produce errore esplicito in login admin invece di fallire in modo silenzioso.
  - Rimosso il check locale su `claimExpiry` in `confirmClaimForGame`, per non rifiutare una tx on-chain gia' valida ma confermata dal server dopo la scadenza wall-clock.

## Verifiche recenti
- `npm run build` ✅
- `npm run lint -- <file toccati>` ✅, resta solo la warning nota `@next/next/no-img-element` su `components/GameScreen.tsx`
- Smoke runtime locale sulla build:
  - Home fuori Farcaster renderizza correttamente la fallback screen
  - `POST /api/game/create` ✅
  - `POST /api/admin/auth/challenge` con wallet non autorizzato → `401 Unauthorized wallet` ✅
  - Rate limit unpaid sessions attivo: 11a creazione consecutiva per lo stesso wallet → errore `Too many open sessions...` ✅

## TODO prossima sessione
- [ ] Confermare causa root del revert payout (analizzare txHash fallita su BaseScan)
- [ ] Verificare se `realtimeBalanceOf` risolve il check saldo disponibile
- [ ] Rimuovere banner "fixing txs issues" quando payout funziona
- [ ] Valutare se rendere Super Bee bonus fisso in USDC invece che in BF (per stabilità con variazioni di prezzo)
- [ ] Valutare se sostituire gli `<img>` principali con `next/image` dove non rompe il rendering miniapp
- [ ] Valutare cleanup/expiry dei game record `created` abbandonati oltre al rate-limit per wallet
