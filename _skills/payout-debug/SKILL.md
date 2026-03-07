# payout-debug

## Scopo
Diagnosi e stabilizzazione payout game (winner + pot) su Base.

## Workflow rapido
1. Controlla ultimi errori in `admin/tx-records` (stage, reason).
2. Verifica on-chain tx hash su BaseScan.
3. Distingui:
   - RPC issue (429/network)
   - Token revert runtime
   - Nonce/concurrency
4. Esegui smoke check:
   - fee in ok
   - winner transfer ok
   - pot transfer ok
5. Aggiorna `LOCAL_WORKING_MEMORY.md` quando una fix passa test reali.

## File chiave
- `app/api/payout/route.ts`
- `app/admin/tx-records/page.tsx`
- `app/api/admin/tx-records/route.ts`
- `lib/txLedger.ts`

## Regole
- Non introdurre fallback USDC senza esplicita richiesta.
- Mantenere output `prizeStatus` + `potStatus`.
- Evitare credit offchain del pot.
