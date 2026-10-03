# Online play – setup guide

Everything in the game is already built (rooms with share codes, quick match with the profile reel, realtime moves, guest accounts,
Google / Facebook sign-in). It switches on as soon as the Firebase project below exists and its details are added.
Until then a phone build shows "Online play coming soon", and a desktop browser runs a **local demo** (open the game in two tabs).

## Why Firebase
Auth (anonymous guests + Google + Facebook, with guest→account upgrade keeping the same player id), Firestore real-time listeners (moves arrive instantly)
and security rules (turn order is enforced on the server) – all on the free Spark plan, no server to run. Matchmaking is done with a small
queue collection, so no Cloud Functions (and no paid plan) are needed. If you grow, add Functions for ELO + anti-abuse.

## What to create / send me (all free)
1. **Firebase project** (console.firebase.google.com) → *Add app → Android* with package name `com.marthak.royalchess3d`
   - add your **debug SHA-1** (and later the release SHA-1 / Play App Signing SHA-1): `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`
   - download **google-services.json**
   - also *Add app → Web* and copy the **web config** object (`apiKey`, `authDomain`, `projectId`, `appId` …)
2. **Authentication → Sign-in method**: enable **Anonymous**, **Google**, **Facebook**.
3. **Firestore Database → Create** (production mode, region near India e.g. `asia-south1`), then publish the rules in `firestore.rules`
   (console → Rules, paste the file; or `firebase deploy --only firestore:rules`).
4. **Facebook login**: developers.facebook.com → Create app (Consumer) → add *Facebook Login* → Android platform:
   package `com.marthak.royalchess3d`, class `com.marthak.royalchess3d.MainActivity`, add the **key hash** of your signing key;
   copy **App ID**, **App Secret** (paste the secret into Firebase's Facebook provider; copy the OAuth redirect URI Firebase shows into the Facebook app) and **Client Token** (Settings → Advanced).
5. Send me / add as GitHub repository **secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `FIREBASE_CONFIG_JSON` | the web config object as JSON, e.g. `{"apiKey":"…","authDomain":"…","projectId":"…","storageBucket":"…","messagingSenderId":"…","appId":"…"}` |
| `GOOGLE_SERVICES_JSON` | full contents of google-services.json |
| `FACEBOOK_APP_ID` | Facebook app id |
| `FACEBOOK_CLIENT_TOKEN` | Facebook client token |

(or just send me the values and I add them to `www/js/firebase-config.js` / the workflow for you). The web config is not secret, but keep the Facebook secret out of the repo.

## How it works
- `www/js/online.js` – helpers (6-letter codes without 0/O/1/I), the demo backend and backend loader
- `src/online-firebase.js` → bundled to `www/vendor/online-firebase.js` by `npm run build:online` (done automatically in the Android build)
- `firestore.rules` – users (own profile), queue (claim-once), rooms (join once, one move per turn by the player whose turn it is, result by a player)
- Game flow in `www/js/app.js` ("online play" section): hub → create / join / quick match → `beginOnline()` → moves via `pushMove`, received through a Firestore listener and played with the normal move animation.
- Disconnects: a player who closes the app simply stops moving; use Resign. (Next step: presence + auto-forfeit via a heartbeat field.)
