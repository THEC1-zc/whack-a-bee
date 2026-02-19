Original prompt: end game: aggiungiamo pulsante share to farcaster, che pubblicherà un post con testo preimpostato: I just ended a game on Whack-a-bee by @Thec1, I entered a [GAME_FEE] game, had a [END_GAME_%] and won [BF_prize] and [ticket] tickets for the weekly pot! can you do better? allega endgamepagescreenshot e framecon link alla app

- Added share image endpoint `/api/share-image` (next/og) and wired share button to use it and app URL embeds.
- Fixed OG rendering constraints (display: flex requirement).
- Moved Play button above butterfly types.
- Playwright smoke run completed (home screen render).
