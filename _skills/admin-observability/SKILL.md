# admin-observability

## Scopo
Rendere Admin utile per troubleshooting operativo senza screenshot manuali.

## Checklist
1. Errori recenti leggibili (stage + reason).
2. Mobile-friendly cards/tables.
3. Copy all / copy row.
4. Link BaseScan su tx hash.
5. Build stamp visibile.

## File chiave
- `app/admin/page.tsx`
- `app/admin/tx-records/page.tsx`
- `app/admin/payouts/page.tsx`
- `app/api/admin/bf-diagnostics/route.ts`

## Regole
- Ogni nuovo errore tecnico deve avere stage univoco.
- Messaggi corti in UI, dettagli in tx-records.
