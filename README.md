# ♞ Royal Chess 3D

A realistic **3D chess game** for Android (HTML5 + Three.js, packaged with Capacitor).
Every piece looks like what it is — and **moves like it**:

| Piece | Royal Animals set | How it moves |
|---|---|---|
| ♞ Knight | **Horse** (mane, tail, four legs) | rears up, gallops through the air in an arc, lands with hoof-clops |
| ♜ Rook | **Elephant** (trunk, tusks, ears, howdah tower) | heavy stomping walk, camera shakes on every footstep, trumpets when it captures |
| ♝ Bishop | **Camel** (hump, saddle blanket) | swaying, rhythmic stride |
| ♛ Queen / ♚ King / ♟ Pawn | crowned Queen & King, soldier pawn | queen glides with a lean, king steps with dignity, pawns hop |

Prefer tournament pieces? Settings → *Piece style* → **Classic Staunton** (carved horse-head knight, crenellated rook, mitre bishop).

## Always know who is who
- **Piece badges** float above every piece (🐴 🐘 🐪 ♛ ♚ ♟) – ivory with a gold border for White, dark with a red border for Black. Switch to letters (K Q R B N P) or turn them off in Settings
- **Team rings** on every base: gold = White, red = Black
- **Turn banner** under the top bar: *"Your move · White"*, *"Computer's move · Black"*, *"⚠ CHECK"*
- **Name card** when you tap a piece: *"🐴 Horse (Knight) · White – leaps in an L-shape…"*
- Player bars show your colour; **Help → Meet the pieces** explains every piece

## Board colours & pawn promotion
- **12 board colour themes** (4 free + Custom, the rest unlocked with coins) – Classic Wood, Tournament green, Dark Walnut, Slate, Black Marble, Emerald, Ruby, Ocean, Royal Purple, Candy Pink, Sapphire – and a **Custom** board where you pick any two square colours and a finish (wood / matte / glossy). Change them any time in Settings
- **Pawn promotion** always asks: Queen, Rook, Bishop or Knight (Elephant / Camel / Horse in the animal set), in your team's colours, with a Cancel option. The dialog can't be dismissed by a stray tap

## Backgrounds
Wooden Table · Royal Palace (marble tiles, candle glow, floating gold dust) · Sunset Garden (lawn, fireflies) · Starry Night (reflective deck, stars, moon) · Snowy Peak (falling snow). Preview any background for free in the Shop, unlock with coins.

## Features
- **True 3D** – drag to rotate the board, pinch to zoom, procedural wood / black marble / emerald felt / sapphire boards, real shadows & reflections
- **Complete chess rules** – castling, en passant, promotion, check / checkmate / stalemate, 50-move, threefold repetition, insufficient material. The move generator is verified with **perft** against the published reference counts
- **Computer opponent**, 6 levels (Beginner → Master) running in a Web Worker (no stutter)
- **Pass & Play** with an auto-turning board, optional clocks (5 / 10 / 15+10)
- **Mate-in-1/2/3 puzzles** (105 engine-verified, unique solutions) + a **daily puzzle**
- Undo, hints, move list, captured pieces, last-move & check highlights, legal-move dots, save & resume
- Rating that changes with every game, coins, daily rewards, shop (boards, piece colours)
- Procedural sound: wooden clacks, hoof-clops, elephant footsteps & trumpet, camel pads, ambient music, haptics

## Monetisation (hooks in `www/js/ads.js`, `config.js`)
- **Rewarded video** – extra hints/undos, double coins, free coins (5/day), double daily reward
- **Interstitial** – only after a finished game, ≥2 min apart, never in the first 2 games, never for ad-free buyers
- **IAP** – Remove Ads ₹149, coin packs ₹49 / ₹129 / ₹299; boards & piece colours unlocked with coins

> ⚠️ The ₹10 lakh/month goal depends on daily players × revenue per player (hyper-casual/board games in India are
> roughly ₹1–4 per daily user), i.e. ~10k–30k+ daily users. That needs marketing and live-ops on top of the game.

## Run / test
```bash
npm run serve   # http://localhost:8080 (ads & purchases are fake "TEST" overlays in a browser)
npm test        # perft (6 reference positions) + hashing + SAN + mate-finding + all AI levels
node scripts/gen-puzzles.js 30 50 25 > www/js/puzzles.json   # regenerate puzzles
```

## Build the Android APK (free)
**GitHub Actions** (no local setup): push → the *Build Android APK* workflow builds a debug APK, uploads it as an
artifact **and** publishes it to the `apk` branch (`RoyalChess3D-debug.apk`).

Local build (Node 20, JDK 21, Android SDK):
```bash
npm ci && npm run android:add && npm run android:apk
```

## Before release
1. **AdMob** – put your app/ad-unit IDs in `www/js/config.js` (`ads.*`), set `ads.testing=false`, pass `ADMOB_APP_ID` to `scripts/patch-android.js`. Everything uses Google's **test ads** right now.
2. **IAP** – create the products in Play Console (IDs in `config.js → iap`) and implement `IAP.buy()` in `ads.js` (marked `TODO`, e.g. `cordova-plugin-purchase`).
3. Signing key, privacy-policy URL, Play data-safety form, UMP consent message in the AdMob console.

## Structure
```
www/index.html, css/style.css
www/js/chess-engine.js   rules + AI (UMD, used by the page, the worker and Node tests)
www/js/ai-worker.js      AI in a Web Worker
www/js/pieces.js         procedural 3D pieces (horse, elephant, camel, Staunton set)
www/js/scene.js          3D board, camera, picking, move animations
www/js/textures.js       procedural wood / marble / felt textures
www/js/audio.js          procedural sound + music
www/js/app.js            game flow, menus, puzzles, shop, settings
www/js/puzzles.json      generated puzzles
scripts/                 engine tests, puzzle generator, icon generator
```
