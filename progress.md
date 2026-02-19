Original prompt: end game: aggiungiamo pulsante share to farcaster, che pubblicherà un post con testo preimpostato: I just ended a game on Whack-a-bee by @Thec1, I entered a [GAME_FEE] game, had a [END_GAME_%] and won [BF_prize] and [ticket] tickets for the weekly pot! can you do better? allega endgamepagescreenshot e framecon link alla app

- Added share image endpoint `/api/share-image` (next/og) and wired share button to use it and app URL embeds.
- Fixed OG rendering constraints (display: flex requirement).
- Moved Play button above butterfly types.
- End game now requires manual Back to exit; added Farcaster icon on Share button.
- Share image layout scaled down for mobile view.
- Payment error text shortened to avoid huge blocks.
- Playwright smoke run completed (home screen render).
