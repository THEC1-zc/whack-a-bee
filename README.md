# 🐝 Whack-a-Bee — Farcaster Mini App

Gioco tipo acchiappa la talpa con le api. Built con Next.js per Farcaster Mini App.

## Stack
- **Next.js 15** + TypeScript + Tailwind
- **@farcaster/frame-sdk** — context utente + wallet
- Leaderboard in-memory (→ sostituire con Upstash Redis in produzione)

## Setup locale
```bash
npm install
npm run dev
# apri http://localhost:3000
```

## Deploy su Vercel
```bash
# 1. Push su GitHub
git init && git add . && git commit -m "feat: whack-a-bee mini app"
gh repo create whack-a-bee --public --push

# 2. Vai su vercel.com → New Project → importa repo
# Framework: Next.js (auto-rilevato)
# Aggiungi env var: NEXT_PUBLIC_APP_URL = https://tuo-dominio.vercel.app
```

## Registra come Mini App Farcaster
1. Deploya su Vercel, copia l'URL
2. Aggiorna tutti gli URL in `public/.well-known/farcaster.json` e in `app/layout.tsx`
3. Vai su https://warpcast.com/~/developers/frames
4. Inserisci il dominio → firma il manifest → copia i valori in `farcaster.json`
5. Rideploya

## Game Design
- 🐝 Ape normale → +1 punto
- ⚡ Ape veloce (blu) → +3 punti  
- 💣 Ape bomba (rossa) → -2 punti
- ⏱ 30 secondi per partita
- 🏆 50 punti → vinci il prize pool

## TODO
- [ ] Game fee (0.001 ETH per partita) via wallet
- [ ] Prize pool su smart contract Base
- [ ] Leaderboard persistente (Upstash Redis)
- [ ] Share su Farcaster al termine partita
