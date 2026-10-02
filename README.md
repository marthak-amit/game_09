# 💥 Blast Bloom

A chain-reaction puzzle game for mobile. **Tap to set off a blast → every orb it touches pops and blasts too.**
Clear each board in as few taps as possible. Cute orbs with faces, juicy pops, pentatonic sound that climbs with your chain.

## Why it should retain & earn
| Hook | What it does |
|---|---|
| Infinite levels | Seeded + solver-verified procedural levels (same level on every phone). Par is computed, so 3★ is always achievable. |
| "Just one more tap" | Short sessions (30–60 s), near-misses ("2 orbs left!") → rewarded-ad **Continue** |
| New mechanics over time | Big, Bomb, Armor, Anchor, Gold orbs, Pillars (Lv 3 → 12+) |
| Daily loop | 7-day login reward, 3 daily quests, **Daily Challenge** (same puzzle for everyone) |
| Collection | 6 orb skins, 7 worlds |
| Power-ups | 💥 Mega, ❄️ Freeze, ➕ Tap – earned, bought with coins, or via rewarded ad |

### Monetisation (all hooks already in code – `www/js/ads.js`, `config.js`)
* **Rewarded video** – continue (+2 taps), double level coins, free power-ups, free coins (5/day), double daily reward
* **Interstitial** – every 3rd finished level, ≥90 s apart, never in the first 4 levels, never for ad-free buyers
* **IAP** – Remove Ads ₹149, Starter Pack ₹99, coin packs ₹49 / ₹129 / ₹299, skins & power-ups via coins

> ⚠️ **Honest note on the ₹10 lakh/month goal:** the game is built to maximise retention and ad/IAP hooks, but revenue is
> `DAU × ARPDAU`. Hyper-casual puzzle ARPDAU in India is typically ₹1–4, so ₹10L/month needs roughly **10k–30k+ daily
> active users**, which in practice means marketing / UA spend, store-listing optimisation and live-ops (new skins, events).
> No game can guarantee that figure – this gives you a strong product to start from.

## Run in a browser
```bash
npm run serve        # http://localhost:8080  (ads/IAP are fake "TEST" overlays in the browser)
npm run test:levels  # verifies 150 levels generate & are solvable
```

## Build the Android app (free)
Option A – **GitHub Actions** (no local setup): Actions → *Build Android APK* → Run workflow → download the `blast-bloom-debug-apk` artifact.

Option B – local (needs Node 20, JDK 21, Android SDK):
```bash
npm install
npm run android:add      # generates android/ and patches AdMob app id
npm run android:apk      # android/app/build/outputs/apk/debug/app-debug.apk
```

## Before release (things you said you'd provide later)
1. **AdMob**: create app + ad units → put IDs in `www/js/config.js` (`ads.*`), set `ads.testing=false`, and pass `ADMOB_APP_ID` to `scripts/patch-android.js`.
2. **IAP**: create the 5 products in Play Console (IDs in `config.js → iap`) and implement the purchase call in `IAP.buy()` (`ads.js`, marked `TODO`; e.g. `cordova-plugin-purchase`). Until then, purchases in the native app show "Store not configured yet"; in the browser they are simulated.
3. App icon / splash (`@capacitor/assets`), signing key, privacy policy URL (required by Play + AdMob), Data-safety form, consent (UMP) for EU users.

## Structure
```
www/index.html, css/style.css
www/js/sim.js      deterministic simulation (also used by the level solver)
www/js/levels.js   seeded generator + Monte-Carlo solver → par/taps
www/js/render.js   canvas renderer (faces, particles, shake)
www/js/audio.js    procedural WebAudio (no asset files)
www/js/ads.js      AdMob + IAP adapter (fake in browser)
www/js/app.js      game flow, menus, daily/quests/shop
```
