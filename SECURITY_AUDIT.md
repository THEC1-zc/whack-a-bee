# Security Audit — whack-a-bee
> Data: 2026-03-09 | Analisi statica codebase

---

## RIEPILOGO RISCHI

| Severity | N° | Descrizione |
|---|---|---|
| 🔴 CRITICO | 2 | Vettori di drain attivi o riattivabili |
| 🟠 ALTO | 3 | Auth bypassabile o token in chiaro |
| 🟡 MEDIO | 4 | Amplificatori di attacco / info disclosure |
| 🟢 BASSO | 2 | Hardening aggiuntivo consigliato |

---

## 🔴 CRITICI

### C-1 — `weekly-payout` esegue transfer reali con solo `x-admin-token` (bearer secret)
**File**: `app/api/admin/weekly-payout/route.ts`

```ts
function isAuthorized(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  return Boolean(ADMIN_API_KEY && token === ADMIN_API_KEY);
}
```

L'endpoint `/api/admin/weekly-payout` (POST) esegue trasferimenti BF reali dal **pot wallet** verso indirizzi arbitrari del leaderboard. L'unica protezione è un singolo header `x-admin-token`.

**Vettore di attacco:**
- Se `ADMIN_API_KEY` è leakato (logs Vercel, env exposed, history browser, altro), un bot può chiamare direttamente POST con `force: true, mode: "manual"` e drenare il pot wallet in un singolo request.
- Non c'è firma wallet aggiuntiva (come invece richiede il reset leaderboard).
- Non c'è rate limiting.
- Non c'è verifica che i recipient siano indirizzi "legittimi" del leaderboard — il weekly payout usa `getAdminStats()` che legge il leaderboard Redis: se il leaderboard è stato manipolato, i destinatari dei fondi sono controllati dall'attaccante.

**Fix necessario:**
- Aggiungere firma wallet (come `reset_leaderboard`) per autorizzare il payout.
- Oppure richiedere un 2FA temporale (challenge + sign + ADMIN_API_KEY).

---

### C-2 — `cron/weekly-payout` protetto da `CRON_SECRET` opzionale
**File**: `app/api/cron/weekly-payout/route.ts`

```ts
const CRON_SECRET = process.env.CRON_SECRET;
// ...
if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
```

Se `CRON_SECRET` non è impostata nelle env vars, il check è **completamente skippato** — qualsiasi richiesta GET a `/api/cron/weekly-payout` esegue il payout.

**Vettore di attacco:**
- Bot chiama `GET /api/cron/weekly-payout` senza header → payout eseguito se `autoPayoutEnabled=true`.
- Vercel non autentica automaticamente i cron endpoint su piano Hobby.

**Fix necessario:**
```ts
// Bloccare se CRON_SECRET non è configurato
if (!CRON_SECRET) {
  return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
}
if (authHeader !== `Bearer ${CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

---

## 🟠 ALTI

### A-1 — `ADMIN_API_KEY` è usata come unico fattore per operazioni distruttive
**File**: tutti i route `/api/admin/*`

`ADMIN_API_KEY` è un segreto statico che:
- Non ruota mai
- Non ha scadenza
- Se leakato dà accesso a: weekly payout, bf-diagnostics, wallets, leaderboard reset config

**Fix**: Separare i secret per endpoint sensibili, o introdurre un token rotante a breve durata.

---

### A-2 — `bf-diagnostics` espone dati sensibili sul wallet
**File**: `app/api/admin/bf-diagnostics/route.ts`

L'endpoint restituisce:
- Saldo esatto del prize wallet in BF
- Saldo pot wallet e recipient wallet
- Risultati di `simulateContract` (se il trasferimento passerebbe)
- Indirizzi di tutti i wallet

Con solo `x-admin-token` un attaccante può fare reconnaissance prima del drain: sa esattamente quanti BF ci sono e se il transfer funziona.

**Fix**: Limitare i dati restituiti, o considerare se questo endpoint è ancora necessario post-redesign.

---

### A-3 — `admin/leaderboard` POST `weekly_reset` non richiede firma wallet
**File**: `app/api/admin/leaderboard/route.ts`

```ts
if (body?.action === "weekly_reset") {
  await resetWeeklyState();
  return NextResponse.json({ ok: true });
}
```

Il reset weekly (che azzera tickets/pot) richiede solo `x-admin-token`, senza la firma wallet che invece è richiesta per `reset_leaderboard`. Un attaccante con il token può azzerare il pot prima del payout legittimo.

---

## 🟡 MEDI

### M-1 — Leaderboard Redis scrivibile indirettamente tramite game flow
Il payout weekly usa `getAdminStats()` per determinare i top3. Se il leaderboard è manipolabile (score injection), l'attaccante controlla i destinatari del 60% del pot. Leaderboard POST è disabilitato, ma verificare che non ci siano path alternativi.

### M-2 — `addWeeklyPot` non ha autenticazione
**File**: `lib/weekly.ts` — `addWeeklyPot()` è chiamata dal flusso game. Se c'è un path non autenticato che chiama questa funzione, un bot può gonfiare il pot senza pagare fee reali.
Da verificare: tutti i caller di `addWeeklyPot`.

### M-3 — `price` endpoint pubblico e non rate-limited
**File**: `app/api/price/route.ts` — Espone il tasso BF/USDC senza auth. Non è un rischio diretto ma può essere usato per calcolare importi ottimali di drain.

### M-4 — Memory fallback in produzione
`lib/weekly.ts` fa fallback a `memoryStore` se Redis non è disponibile. In produzione Vercel (serverless), la memoria non è persistente — un crash può causare perdita di stato (pot, tickets). Questo non è un vettore di drain ma può causare perdita di fondi se il pot viene resettato.

---

## 🟢 BASSI

### B-1 — `ADMIN_SIGNING_SECRET` con fallback a `ADMIN_API_KEY`
**File**: `lib/adminAuth.ts`

```ts
function getSecret() {
  return process.env.ADMIN_SIGNING_SECRET || process.env.ADMIN_API_KEY || "";
}
```

Se `ADMIN_SIGNING_SECRET` non è settato, la firma challenge usa la stessa chiave dell'auth header. Se uno dei due è compromesso, entrambi i meccanismi sono compromessi.

### B-2 — Nessun IP allowlist o rate limiting sugli endpoint admin
Gli endpoint `/api/admin/*` sono raggiungibili da qualsiasi IP senza throttling. Un attacco brute force su `ADMIN_API_KEY` è possibile anche se il token è lungo.

---

## PRIORITÀ DI FIX (ordine consigliato)

1. **C-2**: Bloccare il cron endpoint se `CRON_SECRET` non è configurato (10 minuti)
2. **C-1**: Aggiungere firma wallet obbligatoria al weekly-payout (come già fatto per reset_leaderboard)
3. **A-3**: Richiedere firma wallet anche per `weekly_reset`
4. **A-1**: Verificare che `ADMIN_API_KEY` non sia leakato in logs Vercel — rotare il secret
5. **A-2**: Valutare se bf-diagnostics può essere rimosso o ridotto nel payload

---

## NOTE SUL DRAIN AVVENUTO

Il drain dei BF dal prize wallet (non dal pot wallet) suggerisce che il vettore era **il vecchio POST /api/payout** (firma claim) che è ora disabilitato. Il prize wallet era il signer delle claim — un bot potrebbe aver:
1. Chiamato POST /api/payout con un indirizzo di destinazione controllato
2. Ricevuto una firma valida
3. Chiamato `claimPrize()` on-chain per prelevare BF dal contratto

Con il POST disabilitato questo vettore è chiuso. I rischi residui sopra riguardano principalmente il **pot wallet** (weekly payout).
