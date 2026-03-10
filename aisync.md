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
PRIZE_PER_POINT base:
  easy   0.00025 USDC
  medium 0.00040 USDC
  hard   0.00060 USDC

DIFFICULTY_CONFIG:
  easy:   fee=0.015 USDC | maxPts=40 | waves=10
  medium: fee=0.025 USDC | maxPts=60 | waves=9
  hard:   fee=0.035 USDC | maxPts=80 | waves=8

Payout bands:
  easy   0-20 @100% | 21-35 @70% | 36+ @40%
  medium 0-30 @100% | 31-50 @70% | 51+ @40%
  hard   0-40 @100% | 41-65 @70% | 66+ @40%
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
| Butterfly   | +1 | base |
| Triplefly ⚡ | +2 / +3 / +4 | easy 22% / med 25% / hard 30%, doubled in Mega |
| Quickfly 💖 | +3 / +5 / +7 | 15%, doubled in Mega (max 3/run) |
| Bombfly 🔴 | −1 / −2 / −3 | 1 forced per wave |
| Prizefly 💜 | +1 +100K BF | 2.5% (7.5% in Mega round) |

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

### 2026-03-09 16:42:45 +0100
- Added .devcontainer/devcontainer.json for standardized Codex/Claude remote development.
- Ensured aisync.md is ignored in .gitignore.
- Commit target: chore: add devcontainer for Codex remote development

### 2026-03-09 17:25:00 +0100
- Fixed Mega/live payout validation drift by deriving server hit bounds from the same cap-based spawn rules used by the client, instead of static per-difficulty limits.
- Fixed BF prize conversion in `lib/gameSessions.ts`: signed claim amounts now convert `prizeUsdc` to BF using the live BF/USDC rate, instead of accidentally signing raw USDC-sized values.
- Moved shared gameplay spawn helpers into `lib/gameRules.ts` (`getFastChance`, `getFastLimit`, `getFuchsiaChance`, `getSuperChance`, `getHitBounds`, shared durations/spawn config).
- Updated `components/GameScreen.tsx` Mega gameplay to match the coordination balance notes more closely:
  - Mega doubles Triplefly/Quickfly spawn pressure via shared helpers.
  - Fast per-wave limit is now 1 normally, 2 in Mega.
  - Bomb pressure is one forced Bomb per wave, removing the stale double-bomb branch.
- Updated `components/RulesScreen.tsx` copy so the visible rules match the actual gameplay loop again.
- End-game share text now uses the actual `ticketCount` returned by the server, instead of a hardcoded `1 ticket` estimate.

### 2026-03-09 18:05:00 +0100
- Promoted the old test-game balance into the live ruleset:
  - live point values are now difficulty-based (`easy 1/2/3/-1`, `medium 1/3/5/-2`, `hard 1/4/7/-3`)
  - live payout now uses soft bands instead of linear `score * PRIZE_PER_POINT`
  - gameplay is wave-based instead of countdown-based (`easy 10`, `medium 9`, `hard 8`)
- Updated `components/GameScreen.tsx`, `lib/gameRules.ts`, `lib/gameSessions.ts`, `components/App.tsx`, `components/RulesScreen.tsx`, `app/api/share-image/route.tsx`, `app/weekly/page.tsx`, and `README.md` to use the promoted live balance and terminology.
- Weekly ticket copy + calculation now match the actual post-promote rules: `1 base + 1 full-value run + 1 profitable run + 1 every 10th claimed win`.

### 2026-03-09 18:58:00 +0100
- Hardened payout claim confirmation in `lib/payments.ts` by retrying `claim-confirm` on transient "transaction not found" RPC lag after the on-chain receipt is already mined.
- Updated `app/admin/transactions/page.tsx` to load and display recent transaction records directly, instead of only showing leaderboard stats plus a link out.
- Fixed admin tx loading UX in `app/admin/tx-records/page.tsx` by surfacing non-OK API responses as visible errors.
- Rebalanced the mobile payout summary layout in `components/GameScreen.tsx`:
  - `Game ID` is now full-width to avoid broken wrapping.
  - label tracking and card typography are tighter for small screens.
  - payment/error copy uses cleaner spacing and line-height so failed payouts remain readable.

### 2026-03-10 15:50:00 +0100
- Added shared non-game header component `components/UserPageHeader.tsx` and reused it across home, rules, leaderboard, weekly, and payout summary.
- Header now follows the requested structure:
  - left: player pfp, display name, tag, abbreviated wallet
  - center: scaled game icon from `public/icon.png`
  - right: back button plus Rulebook / Leaderboard / Admin actions
- Added `/?screen=rules` and `/?screen=leaderboard` routing support in `components/App.tsx` so header links work from route-driven pages like `/weekly`.
- Reworked payout summary visual structure in `components/GameScreen.tsx`:
  - darkened image background via `.payout-page-bg`
  - simplified summary copy to `BF won`, `points made`, `waves cleared`
  - removed effective payout points and the redundant `Win` tile
  - retained only `Game ID`, `Game Difficulty`, `Game Type`, `Weekly Pot Share`, `Burn Share`, `Tickets`, split card, hit counter, and larger Farcaster share CTA
- Verification:
  - `npm run build` ✅
  - targeted lint ✅ with only existing `@next/next/no-img-element` warnings on current avatar/sprite images
  - local `npm run dev` + Playwright smoke screenshot saved to `output/web-game/shot-0.png` (still shows fallback outside Farcaster, as expected)

### 2026-03-10 16:05:00 +0100
- Updated `components/UserPageHeader.tsx`:
  - `Back` is now a compact icon button on the far right.
  - removed the separate `Admin` text button from the action row.
  - the centered game icon now links to `/admin` only for the configured admin wallet.
- Updated `lib/gameRules.ts` wave counts:
  - Easy `15`
  - Medium `12`
  - Hard `9`
- Re-verified with `npm run build` ✅ and targeted lint ✅, keeping only the existing `<img>` warnings on current avatar/sprite rendering.

### 2026-03-10 16:40:00 +0100
- Rebalanced live payout in `lib/gameRules.ts`:
  - removed `PAYOUT_BANDS` from live calculation
  - payout is now linear: `score * PRIZE_PER_POINT + bonus`
  - updated caps to `45 / 65 / 85`
  - updated PPP to `0.00032 / 0.0005 / 0.0007`
- Updated UI copy in `components/App.tsx`, `components/GameScreen.tsx`, `components/RulesScreen.tsx`, and `app/weekly/page.tsx` to remove references to payout bands and "full-value" scoring.
- Added new share asset `public/farcaster-share.svg` and switched share buttons to use it.
- Added new worksheet `Live Tuning Matrix` to `local-balance/LTM.xml` as the manual balancing source for future syncs.
- Verification:
  - `npm run build` ✅
  - targeted lint ✅ with only the existing gameplay sprite `<img>` warning remaining

### 2026-03-10 17:05:00 +0100
- Calibrated `PRIZE_PER_POINT` for approximately 75% net RTP using Monte Carlo:
  - Easy `0.00041061`
  - Medium `0.00099418`
  - Hard `0.00088064`
- Mirrored the same PPP values into `local-balance/LTM.xml`.
- Monte Carlo validation (`1000` runs/difficulty, current BF rate fetch, fixed skill assumptions) landed at:
  - Easy `73.2%`
  - Medium `73.9%`
  - Hard `75.9%`
