# weekly-payout-ops

## Scopo
Gestione payout settimanale robusta e auditabile.

## Workflow
1. Verifica config weekly (`auto`, `forceBypass`, `autoClaim`).
2. Esegui payout manuale/auto da admin.
3. Controlla report payout e tx records.
4. Se partial/fail, non fare reset cieco: isolare prima il motivo.

## File chiave
- `app/api/admin/weekly-payout/route.ts`
- `app/api/admin/weekly-config/route.ts`
- `app/api/admin/weekly-payouts/route.ts`
- `app/admin/payouts/page.tsx`
- `lib/weekly.ts`

## Regole
- Audit trail completo (wallet, amount, tx hash, status).
- Reset weekly solo dopo conferma stato payout.
