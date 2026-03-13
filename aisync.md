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

### 2026-03-10 18:35:00 +0100
- Local balancing pass only, not pushed yet:
  - set `medium` to `13` waves
  - set `hard` to `8` waves
  - increased hard butterfly durations by about `+1000ms` per wave to reward reaction skill instead of raw pressure
- Moved the Farcaster share CTA inside the payout summary grid in `components/GameScreen.tsx`, placing it under `Burn Share` to the right of `Tickets`.
- Validation:
  - `npm run lint -- lib/gameRules.ts components/GameScreen.tsx` ✅ with only the known gameplay sprite `<img>` warning
  - `npm run build` ✅
- Monte Carlo spot-check (`3000` runs/difficulty, live BF rate, with a modest hard-skill uplift to reflect the longer hard wave timing) landed at:
  - Easy `74.54%`
  - Medium `79.13%`
  - Hard `79.41%`

### 2026-03-10 19:10:00 +0100
- Visual redesign pass across the app shell:
  - introduced a softer shared visual language in `app/globals.css` with unified panel/chip/surface classes
  - reduced the old hard-box feeling by replacing many opaque card blocks with layered translucent surfaces
  - refreshed `components/UserPageHeader.tsx` spacing, halo treatment, and action styling
  - restyled `components/App.tsx`, `components/RulesScreen.tsx`, `components/LeaderboardScreen.tsx`, and `app/weekly/page.tsx` to the new shared system
  - aligned admin surfaces in `app/admin/page.tsx`, `app/admin/transactions/page.tsx`, `app/admin/wallets/page.tsx`, `app/admin/payouts/page.tsx`, `app/admin/tx-records/page.tsx`, and `app/admin/weekly/page.tsx`
  - improved in-game run type readability in `components/GameScreen.tsx` with a dedicated high-contrast run badge and clearer payout `Game Type` tone
- Verification:
  - `npm run build` ✅
  - targeted lint ✅ with only existing `<img>` warnings in `components/GameScreen.tsx` and `components/LeaderboardScreen.tsx`
  - local Playwright/browser smoke could not run in the current sandbox because headless Chromium launch is blocked by macOS permission restrictions
- Admin transaction wording pass:
  - clarified `game_pot_in` as `weekly pot in` and `game_prize_out` as `player payout out` in the admin transaction views
  - no payout flow logic changed; this was a visibility fix to make the weekly split readable from the tx log
- Visual refinement follow-up:
  - removed most filled panel backgrounds from the shared user/admin shell so the illustrated page background stays visible
  - shifted readability toward stronger overlay contrast plus text-shadow instead of dark card blocks
  - softened home difficulty selection so each difficulty reads as a highlighted line item instead of a boxed tile
- App share preview logic:
  - added a dedicated share landing route at `/share/app` with its own frame metadata and centered Farcaster preview image
  - app share from the home screen now embeds `/share/app` instead of the root app URL, so Farcaster uses the share-specific preview rather than the generic root OG layout
  - the new OG composition is center-weighted for mobile frame previews, avoiding the old too-wide layout that lost readability at the sides
- Payout share preview logic:
  - added a dedicated dynamic share route at `/share/payout`
  - payout share now embeds the share route instead of the raw `/api/share-image` URL
  - replaced the old dense payout preview usage with a dedicated, simpler payout share image route focused on `BF won`, `difficulty`, and `points`
  - the route generates metadata/frame tags from the run query params and points Farcaster to the payout-share-specific image renderer
- Reworked game type distribution in `lib/gameRules.ts`:
  - `Low` `0.9x` at `15%`
  - `Nice` `1.1x` at `20%`
  - `Average` `1.25x` at `35%`
  - `Big` `2x` at `15%`
  - `Mega` `3x` at `5%`
  - new `Jolly` at `10%`
- Added server-backed `Jolly` support:
  - each Jolly session now stores a wave-by-wave multiplier profile in the game record
  - client gameplay and server finish validation both use the same stored wave multipliers
  - payout summary still shows `Jolly` as the run type while live waves can reroll into Low/Nice/Average/Big/Mega
- Updated `components/GameScreen.tsx` so Jolly waves show their current rolled type during play.
- Updated `components/RulesScreen.tsx` with a new Game Types section so odds and multipliers are visible in the UI.
- Validation:
  - `npm run lint -- lib/gameRules.ts lib/gameSessions.ts lib/payments.ts components/GameScreen.tsx components/RulesScreen.tsx app/api/game/fee-verify/route.ts` ✅ with only the known gameplay sprite `<img>` warning
  - `npm run build` ✅

### 2026-03-10 19:30:00 +0100
- Rolled back the mistaken hard butterfly duration change.
- Tightened hard wave timing instead:
  - restored hard butterfly durations to `1800 / 1600 / 1500 / 1800 / 1800`
  - added a hard-only wave timeout of `1050ms`, so each hard board closes `750ms` earlier without redefining the butterfly type timings themselves

### 2026-03-11 10:40:00 +0100
- Completed the interrupted audit follow-up:
  - weekly GitHub Action fix is already present in `.github/workflows/weekly-payout.yml` (`mode=auto` + `--fail-with-body`)
  - confirmed `/api/admin/leaderboard` already requires wallet signature for `weekly_reset`
  - weekly payout top3 now uses `getWeeklyAdminStats(meta.weekId)` instead of lifetime leaderboard stats
  - finished the shared weekly BF transfer refactor by moving the helper into `lib/weekly.ts` and wiring both `app/api/admin/weekly-payout/route.ts` and `app/api/cron/weekly-payout/route.ts` to it
  - updated `SESSION_CONTEXT.md` to match the live session-based game flow, current fee/wave values, and active game types
- Validation:
  - `npm run build` ✅
  - targeted lint ✅ (markdown file ignored by ESLint as expected)

### 2026-03-11 11:05:00 +0100
- Second audit found and fixed a weekly boundary bug:
  - weekly payout/reset runs on Sunday CET, but game/weekly state was still keyed by ISO week
  - added shared `lib/weekWindow.ts` and switched `lib/weekly.ts` + `lib/gameSessions.ts` to a Sunday-based CET week id
  - this aligns claimed games, weekly tickets, pot accounting, snapshot, and payout to the same Sunday boundary
- Also updated `SESSION_CONTEXT.md` to document the Sunday-based weekly window.

### 2026-03-11 11:35:00 +0100
- Fixed home-shell navigation in `components/UserPageHeader.tsx`:
  - when both `href` and `onClick` are provided, header actions now prefer the local click handler
  - this restores `Rules` and `Leaderboard` opening correctly from the main page without forcing a route transition
- Validation:
  - targeted lint ✅ with only the known leaderboard avatar `<img>` warning
  - `npm run build` ✅

### 2026-03-11 12:05:00 +0100
- Rebalanced `PRIZE_PER_POINT` in `lib/gameRules.ts` to bring RTP back into target bands:
  - easy `0.000276`
  - medium `0.000786`
  - hard `0.001898`
- Synced the same live values into `local-balance/LTM.xml`, including the current wave counts (`15 / 13 / 8`).
- Monte Carlo validation (`10000` runs/difficulty, BF rate fallback `5,100,000 BF / USDC`) landed at:
  - easy `85.55%`
  - medium `79.87%`
  - hard `75.26%`

### 2026-03-12 16:45:00 +0100
- Reworked the payout flow to remove the extra finish signature and make the on-chain claim explicit:
  - `/api/game/finish` no longer requires a separate wallet-signed finish payload
  - `components/GameScreen.tsx` now finishes the run server-side, then shows a manual `Claim Prize` button instead of auto-submitting the tx
  - payout summary state distinguishes `claimable`, `claiming`, `paid`, and `failed`
- Moved the pregame countdown onto the gameplay screen as an overlay and added a short `GO` hold so the run start feels less abrupt.
- Added an admin rescue path for unclaimed game payouts:
  - new signed admin action `rescue_payout`
  - `POST /api/admin/games` can now complete a finished/claim-signed payout from the prize wallet, including player, weekly pot, and burn legs
  - admin transactions UI now lists open unclaimed payouts with a `Complete Payout` action
  - added `game_burn_out` tx ledger entries and labels in admin logs
- Slightly nerfed hard live payout by lowering `PRIZE_PER_POINT.hard` from `0.001898` to `0.00168` and synced `local-balance/LTM.xml`.
- Validation:
  - `npm run build` ✅
  - targeted lint ✅ with only the known sprite `<img>` warning in `components/GameScreen.tsx`

### 2026-03-12 17:10:00 +0100
- Added a new proposal worksheet to `local-balance/LTM.xml`:
  - `PPP Fixed Wave Model`
  - documents a fixed-PPP design (`0.0002 USDC/pt`) where game type changes only the number of waves
  - includes editable assumptions for extra waves by type, per-wave perfect score assumptions, breakeven PPP, and derived perfect-run net payouts for each difficulty
  - explicitly excludes `Jolly` from the proposal sheet for now

### 2026-03-12 18:05:00 +0100
- Reworked the `PPP Fixed Wave Model` sheet in `local-balance/LTM.xml` into a full `difficulty x game type` tuning matrix.
- Replaced the old fallback-rate preview with a live BF price snapshot:
  - `1 USDC = 4,775,549.188156637 BF`
- Added columns for the inputs and outputs needed to reason about score and payout end-to-end:
  - waves, fee, max points, perfect points per wave, perfect score per game
  - estimated spawn mix per wave and per-butterfly timing/chance values
  - point values by butterfly type
  - gross/player/weekly/burn payout in USDC and BF
  - net income vs fee
- Left `Jolly` out of this sheet intentionally so the fixed-PPP + extra-wave model stays easy to tune manually first.

### 2026-03-12 18:22:00 +0100
- Filled the user-created `new balance` worksheet in `local-balance/LTM.xml` with two compact tuning tables:
  - `easy low`
  - `easy average`
- Both tables now include the requested gameplay parameters plus derived payout metrics at the live BF snapshot:
  - perfect-score theoretical cap
  - perfect-score with average second-bomb pressure
  - net player payout in USDC and BF
  - RTP for both views
- Kept `bomb = -2` in both tables and explicitly documented the key design consequence:
  - it increases the penalty for mistakes and the perfect-wave skill challenge
  - it does not lower the perfect-score cap, because the cap assumes bombs are avoided

### 2026-03-12 18:34:00 +0100
- Simplified the hand-tuning sheet back to the user’s preferred structure:
  - removed the second table from the same worksheet
  - renamed the worksheet to `easy low`
  - kept only the compact `easy low` grid with the derived payout/RTP rows
- Fixed the worksheet row count so Excel can open it cleanly.

### 2026-03-12 18:41:00 +0100
- Added a second worksheet `easylow sync` to `local-balance/LTM.xml`.
- This sheet is intentionally normalized for two-person tuning work:
  - one row per numeric parameter
  - columns `parameter / value / unit / note`
  - no free-text parsing needed for the core gameplay inputs
- Seeded it from the current `easy low` sheet values, including the current PPP input shown there.

### 2026-03-12 18:55:00 +0100
- Updated `easylow sync` in `local-balance/LTM.xml` to the selected `PPP = 0.000275 USDC/point`.
- This is the current target baseline for building the remaining difficulty/type sheets around a net RTP band of roughly `101%` to `106%`.

### 2026-03-12 19:08:00 +0100
- Added `local-balance/ltm2sync.xml` as the new sync-only workbook for manual tuning.
- Created one worksheet per difficulty/type combination:
  - `easy low/nice/average/big/mega/jolly sync`
  - `medium low/nice/average/big/mega/jolly sync`
  - `hard low/nice/average/big/mega/jolly sync`
- Kept the normalized `parameter / value / unit / note` layout across all sheets.
- Fully seeded `easy low sync` from the current agreed baseline and left the other sheets mostly blank where tuning inputs are not decided yet.
- Seeded all sheets with:
  - `ppp_input_usdc_per_point = 0.000275`
  - `bf_per_usdc_live_snapshot = 4,775,549.188156637`
- Fixed worksheet row-count metadata in `ltm2sync.xml` so SpreadsheetML stays compatible with Excel.

### 2026-03-12 19:14:00 +0100
- Added a dedicated `data` worksheet to `local-balance/ltm2sync.xml`.
- Centralized the shared tuning reference values there:
  - `ppp_shared_usdc_per_point`
  - `bf_per_usdc_live_snapshot`
  - `bf_usdc_snapshot_utc`
  - explicit snapshot timezone
- This sheet is now the intended fixed reference when the shared PPP or live BF/USDC snapshot is refreshed.

### 2026-03-12 19:20:00 +0100
- Filled `easy average sync` in `local-balance/ltm2sync.xml`.
- Current assumption is intentionally conservative and traceable:
  - same `easy` fee and butterfly profile as `easy low`
  - `Average` currently means `+2` waves over the `easy low` base
  - all unchanged values are explicitly copied from `easy low` until this sheet is retuned separately
- Kept the shared references aligned with the `data` worksheet:
  - `ppp_input_usdc_per_point = 0.000275`
  - `bf_per_usdc_live_snapshot = 4,775,549.188156637`

### 2026-03-12 19:31:00 +0100
- Applied the new timing-tuning rule to the `easy` sync branch in `local-balance/ltm2sync.xml`:
  - `easy nice sync`
  - `easy average sync`
  - `easy big sync`
  - `easy mega sync`
- Rule used:
  - each game type is `10%` faster than the previous type for `wave_duration_ms` and all butterfly duration rows
  - `easy low` remains the timing baseline
- Extra wave progression in the same branch is now explicit:
  - `low +0`
  - `nice +1`
  - `average +2`
  - `big +3`
  - `mega +4`
- Added `duration_progression_rule = -10%` to the `data` worksheet so the reference is visible in one place.

### 2026-03-13 09:45:00 +0100
- Rebuilt `local-balance/ltm2sync.xml` from scratch to restore a clean sync-only workbook after a malformed intermediate edit.
- All `difficulty x type` worksheets are now populated, not just scaffolded:
  - `easy low/nice/average/big/mega/jolly sync`
  - `medium low/nice/average/big/mega/jolly sync`
  - `hard low/nice/average/big/mega/jolly sync`
- The workbook now follows one consistent model:
  - one row per parameter
  - columns `parameter / value / unit / note`
  - `low` is the per-difficulty timing baseline
  - `nice/average/big/mega` apply `-10%` to wave and butterfly durations from the previous type
  - `jolly` is temporarily filled as a neutral placeholder using the same timing/extra-wave profile as `average`
- Current populated baselines:
  - `easy`: fee `0.015`, base waves `15`, max butterflies/wave `4`, triple/quick points `3/4`, bombs `1 + 25% second chance`
  - `medium`: fee `0.025`, base waves `13`, max butterflies/wave `5`, triple/quick points `4/6`, bombs `1 + 40% second chance`
  - `hard`: fee `0.035`, base waves `8`, max butterflies/wave `6`, triple/quick points `5/8`, bombs `2 + 50% second chance`
- Shared references remain:
  - `ppp_shared_usdc_per_point = 0.000275`
  - `bf_per_usdc_live_snapshot = 4,775,549.188156637`
- Validation after rebuild:
  - `19` worksheets
  - SpreadsheetML parse OK
  - row-count metadata mismatch `0`

### 2026-03-13 10:02:00 +0100
- Updated `local-balance/ltm2sync.xml` for the next manual tuning pass before Monte Carlo:
  - `average` is no longer treated as a distinct active rung in the type ladder
  - `average` now mirrors `nice` as a compatibility placeholder
  - `jolly` currently mirrors `nice` as a neutral placeholder until per-wave type mixing is designed
- Applied the first variance-shift adjustment to the `easy` branch:
  - `triple_points: 3 -> 4`
  - `quick_points: 4 -> 5`
  - `bombs_second_chance: 0.25 -> 0.35`
- Kept the rest of the current branch structure stable so the next manual edits can focus on a few numeric levers at a time.

### 2026-03-13 10:08:00 +0100
- Removed the `average` worksheets entirely from `local-balance/ltm2sync.xml`:
  - `easy average sync`
  - `medium average sync`
  - `hard average sync`
- The active type ladder in `ltm2sync.xml` is now explicitly:
  - `low`
  - `nice`
  - `big`
  - `mega`
  - `jolly`
- Updated the `data` worksheet note so it no longer references `average` as a compatibility placeholder.

### 2026-03-13 10:18:00 +0100
- Added three aggregate entry worksheets to `local-balance/ltm2sync.xml`:
  - `all easy`
  - `all medium`
  - `all hard`
- Each aggregate sheet now presents one row per parameter and one column per active type:
  - `low`
  - `nice`
  - `big`
  - `mega`
  - `jolly`
- Purpose:
  - give a single per-difficulty entry point for manual tuning and cross-type comparison
  - make it easier to set up spreadsheet formulas between type columns without jumping across many sync worksheets
- The underlying sync sheets are still the canonical per-type definitions; the new `all *` sheets are comparison/entry views built from those current values.

### 2026-03-13 10:27:00 +0100
- Flipped the intended editing workflow in `local-balance/ltm2sync.xml`:
  - `all easy`
  - `all medium`
  - `all hard`
  are now the declared primary manual edit surfaces.
- Added explicit guidance inside the workbook:
  - `data.primary_edit_surface`
  - `data.sync_generation_rule`
  - stronger note-column copy in all `all *` sheets
  - sync sheets now warn on key baseline rows that edits should start from the corresponding aggregate sheet
- Operational rule from now on:
  - edit the `all *` sheets first
  - then let Codex resync the per-type `... sync` sheets from those values when needed

### 2026-03-13 10:32:00 +0100
- Added an `editing rules` worksheet to `local-balance/ltm2sync.xml`.
- This sheet records the manual tuning workflow inside the workbook itself so the aggregate-edit rules are not lost:
  - which sheets are primary
  - which columns should not be touched
  - how to use `data`
  - how to think about waves, bombs, specials, and resync workflow

### 2026-03-13 11:12:00 +0100
- Updated `easy jolly` in `local-balance/ltm2sync.xml` so it is no longer a disguised `nice` placeholder.
- New working rule:
  - `easy jolly` keeps a stable nice-length run
  - uses standard easy timings instead of a hidden global speed-up
  - derives its variance from a weighted expected mix of `low`, `nice`, `big`, and `mega` sub-wave profiles
- Synced both:
  - `all easy`
  - `easy jolly sync`
  so the aggregate sheet remains the primary editing surface and the per-type sync sheet mirrors the same intent.

### 2026-03-13 12:05:00 +0100
- Refactored live wave generation in `lib/gameRules.ts` and `components/GameScreen.tsx` so `easy` no longer derives spawns purely from `round(baseCount * capMultiplier)`.
- Added explicit easy wave-plan profiles:
  - wave logic can now produce more than 2 spawns per wave on `easy`
  - bomb count is now part of the runtime plan instead of always forcing exactly one bomb
- Updated server-side hit bounds in `lib/gameRules.ts` to use the same per-type max-wave logic, keeping client and anti-cheat validation aligned.

### 2026-03-13 12:24:00 +0100
- Replaced the old fixed Prizefly bonus (`100000 BF`) with a `difficulty x type` matrix anchored at `hard big = 2.5x fee`.
- Prizefly is now priced in USDC first and then converted into BF through the live BF/USDC rate used during game finish.
- Updated both server and client preview paths:
  - `lib/gameSessions.ts`
  - `components/GameScreen.tsx`
  - `components/RulesScreen.tsx`
- Removed stale UI copy that still advertised Prizefly as a fixed `+100000 BF`.

### 2026-03-13 13:05:00 +0100
- Resynced `local-balance/ltm2sync.xml` against the current live runtime.
- The `easy` branch now mirrors live code on the main economic/gameplay rows:
  - PPP
  - points per butterfly type
  - easy per-type spawn caps/chances
  - bomb penalty and second-bomb chance
  - Prizefly gross bonus by type
- Added/filled `prize_bonus_usdc_gross` in `all easy` and the `easy ... sync` sheets.
- Kept the existing workbook structure, but clarified one mismatch in-place:
  - `wave_duration_ms` is currently used as a practical pacing reference for easy, not a true fixed runtime wave timeout.

### 2026-03-13 13:42:00 +0100
- Added `local-balance/ltm3.xml` as the next-step tuning workbook intended to replace the older multi-sheet sync layout for gameplay balancing work.
- `ltm3.xml` contains only four worksheets:
  - `all easy`
  - `all medium`
  - `all hard`
  - `jolly`
- `jolly` is explicitly separated so the main difficulty sheets can be tuned without treating jolly as a normal fifth type.
- Verified the new workbook parses as SpreadsheetML and exposes the expected four worksheet names.
- Added current runtime jolly per-wave type percentages to the `jolly` worksheet, normalized from live `CAP_TYPES` excluding `jolly` itself:
  - `low 16.666667%`
  - `nice 22.222222%`
  - `average 38.888889%`
  - `big 16.666667%`
  - `mega 5.555556%`

### 2026-03-13 13:56:00 +0100
- Aligned runtime jolly wave selection with the new tuning model used in `local-balance/ltm3.xml`.
- Jolly waves no longer sample `average`; they now reroll only into:
  - `low 27.272727%`
  - `nice 36.363636%`
  - `big 27.272727%`
  - `mega 9.090909%`
- Updated the `jolly` worksheet in `ltm3.xml` to match the new runtime percentages.

### 2026-03-13 14:18:00 +0100
- Monte Carlo hard rules for local tuning work:
  - always read the current values from `local-balance/ltm3.xml` before running a simulation
  - always use an updated BF/USDC rate snapshot, never a stale fixed fallback when reporting Monte Carlo results
  - always simulate with Prizefly excluded from the score/payout model:
    - treat Prizefly as an external jackpot event
    - use `prize_max_per_game = 0` for Monte Carlo purposes on every type unless explicitly requested otherwise
- These rules apply to future balancing runs by default unless the user overrides them.

### 2026-03-13 15:02:00 +0100
- Tightened live Prizefly rarity across the app:
  - flat `1%` chance per run
  - max `1` Prizefly per run
  - no Mega multiplier on spawn chance
- Synced the same `1%` rule into `local-balance/ltm3.xml` for easy, medium, and hard tuning sheets so the workbook stays aligned with runtime.

### 2026-03-13 15:18:00 +0100
- Aligned live easy run wave counts with the current tuning ladder:
  - `low 14`
  - `nice 15`
  - `big 16`
  - `mega 17`
  - `jolly 14`
- Updated runtime session creation to build `waveMultipliers` from the actual per-type wave count instead of always using `DIFFICULTY_CONFIG.easy.waves`.
- Updated `GameScreen` to derive progress, share text, and payout wave totals from `session.waveMultipliers.length`.
- Updated minimum-duration validation in `finishGameSession` to use the actual run wave count, preventing short jolly runs from being rejected as “finished too early”.

### 2026-03-13 17:05:00 +0100
- Added a real `ltm3.xml` sync/codegen pipeline:
  - new script `scripts/sync-ltm3.mjs`
  - generated runtime config `lib/gameConfig.generated.ts`
  - `npm run sync:ltm3`
- `local-balance/ltm3.xml` is now the primary tuning workbook for the live game model, and medium/hard sheets are autocompiled from the easy structure as a starting point.
- Refactored live game/runtime/server logic to consume the generated config instead of scattered hardcoded tables:
  - `lib/gameRules.ts`
  - `lib/gameSessions.ts`
  - `components/GameScreen.tsx`
  - `components/App.tsx`
  - `components/RulesScreen.tsx`
- Removed live `average` from the active run ladder; the standard types are now `low / nice / big / mega`, with `jolly` handled separately.
- Prizefly is now enforced as a per-run event in session state:
  - `prizeEligible`
  - `prizeWaveIndex`
- Runtime smoke checks completed:
  - `npm run build` passed
  - targeted lint passed with only the existing `<img>` warning in `components/GameScreen.tsx`
  - local `/api/game/create` returned the new session shape with `waveTypes`, `prizeEligible`, and `prizeWaveIndex`
  - local browser smoke screenshot captured in `output/web-game/shot-0.png`

### 2026-03-13 17:34:00 +0100
- Verified that live gameplay for easy/medium/hard is now driven through `lib/gameConfig.generated.ts`, which is generated from `local-balance/ltm3.xml`.
- Cleaned remaining stale UI references after the `ltm3` migration:
  - `components/RulesScreen.tsx` now shows live bomb penalties and per-difficulty BF-per-point estimates instead of the old shared medium fallback card.
  - `components/RulesScreen.tsx` prize examples now use `calculatePrizeUsdc(...)` instead of the older cap-proportion approximation.
  - `app/opengraph-image.tsx` now renders current wave ranges from the game rules instead of the stale `15 / 12 / 9 waves` text.
- Validation completed:
  - targeted lint passed
  - `npm run build` passed

### 2026-03-13 18:12:00 +0100
- Repaired `local-balance/ltm3.xml` after the `all easy / all medium / all hard` worksheets had collapsed rows and were breaking both `sync:ltm3` and local Monte Carlo tooling.
- Updated PPP test values in `ltm3.xml` and regenerated `lib/gameConfig.generated.ts`:
  - easy `0.000295`
  - medium `0.00036`
  - hard `0.0005`
- Narrowed git tracking for local balance workbooks:
  - keep `local-balance/ltm3.xml`
  - ignore legacy `local-balance/LTM.xml`
  - ignore legacy `local-balance/ltm2sync.xml`
- Validation completed:
  - `npm run sync:ltm3` passed
  - `npm run build` passed
