# Security Audit Report

## Executive Summary

Critical trust-boundary failures were present in the public payout signing flow and several API routes trusted spoofable headers as authorization. The most severe issue allowed arbitrary server-side signing of on-chain payout claims. Additional high-severity issues allowed header spoofing to access admin data/actions and to mutate weekly ticket / leaderboard state.

## Critical Findings

### SEC-001 — Public arbitrary payout claim signing
- Severity: Critical
- Location: `/Users/fabio/workspace/whack-a-bee/app/api/payout/route.ts:121-239`
- Evidence: the route accepts `{ recipient, amount }` from the client, validates only that `amount > 0` and pool balance is sufficient, then signs and returns `bfGross`, `nonce`, `expiry`, and `signature`.
- Impact: any caller could mint valid claim payloads and drain the BF vault through `BFPayout.claimPrize()`.
- Emergency Fix: disable `POST /api/payout` until claims are bound to server-stored game sessions and verified fee/game result state.

### SEC-002 — Wildcard CORS on payout signing endpoint
- Severity: Critical
- Location: `/Users/fabio/workspace/whack-a-bee/app/api/payout/route.ts:41-52`
- Evidence: `Access-Control-Allow-Origin: *` on a signing endpoint.
- Impact: third-party sites/bots can invoke the signing route directly from browsers.
- Emergency Fix: remove public signing access; do not expose wildcard CORS on privileged endpoints.

## High Findings

### SEC-003 — Admin endpoints trust spoofable `x-admin-wallet`
- Severity: High
- Locations:
  - `/Users/fabio/workspace/whack-a-bee/app/api/admin/wallets/route.ts:16-20`
  - `/Users/fabio/workspace/whack-a-bee/app/api/admin/weekly-config/route.ts:7-12`
  - `/Users/fabio/workspace/whack-a-bee/app/api/admin/weekly-payout/route.ts:51-56`
  - `/Users/fabio/workspace/whack-a-bee/app/api/admin/tx-records/route.ts:8-13`
  - `/Users/fabio/workspace/whack-a-bee/app/api/admin/bf-diagnostics/route.ts:30-35`
  - `/Users/fabio/workspace/whack-a-bee/app/api/admin/leaderboard/route.ts:9-12` (GET and entry guard)
- Evidence: requests are authorized if header `x-admin-wallet` equals the configured admin address.
- Impact: anyone can forge the header and access admin data or trigger admin actions.
- Emergency Fix: require a server-held admin API token for these routes until a signed admin session flow is implemented.

### SEC-004 — Weekly ticket endpoints trust spoofable `x-wallet-address`
- Severity: High
- Locations:
  - `/Users/fabio/workspace/whack-a-bee/app/api/weekly/claim/route.ts:4-7`
  - `/Users/fabio/workspace/whack-a-bee/app/api/weekly/my/route.ts:4-7`
- Evidence: wallet ownership is inferred only from a request header.
- Impact: any caller can read or claim another wallet's weekly ticket state.
- Emergency Fix: disable these endpoints until wallet-authenticated sessions exist.

### SEC-005 — Leaderboard write endpoint trusts client-supplied game outcome
- Severity: High
- Location: `/Users/fabio/workspace/whack-a-bee/app/api/leaderboard/route.ts:11-45`
- Evidence: POST accepts `score`, `prize`, `fee`, `address`, `feeTxHash` from the client and persists them without server-side verification.
- Impact: attackers can forge results, pollute rankings, and forge fee logs.
- Emergency Fix: disable public writes until results are tied to verified game sessions / fee transactions.

## Medium Findings

### SEC-006 — Weekly reset action lacks per-action signature enforcement
- Severity: Medium
- Location: `/Users/fabio/workspace/whack-a-bee/app/api/admin/leaderboard/route.ts:52-55`
- Evidence: `weekly_reset` executes after only header-based admin check and does not require the wallet-signed challenge used for `reset`.
- Impact: if header auth is bypassed, weekly state can be reset.
- Emergency Fix: close header spoof path now; later require signed authorization for every destructive admin action.

## Immediate Operational Actions
1. Rotate `PAYOUT_SIGNER_PRIVATE_KEY`.
2. Pause `BFPayout` on-chain if still possible.
3. Revoke vault allowance from the BF vault to `BFPayout` until the redesigned claim flow is deployed.
4. Set a strong `ADMIN_API_KEY` and keep it server-side only.
5. Redesign payout signing around server-created game sessions, verified fee txs, one-time claim records, and server-computed payout amounts.
