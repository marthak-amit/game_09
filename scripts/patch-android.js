// Adds the AdMob application ID to the generated Android project (required by the AdMob plugin).
// Uses Google's TEST app id unless ADMOB_APP_ID is set (set it in CI secrets for the release build).
const fs = require('fs'), p = 'android/app/src/main/AndroidManifest.xml';
if (!fs.existsSync(p)) { console.log('No android project yet – run "npx cap add android" first'); process.exit(0); }
let x = fs.readFileSync(p, 'utf8');
const id = process.env.ADMOB_APP_ID || 'ca-app-pub-3940256099942544~3347511713';
if (!x.includes('com.google.android.gms.ads.APPLICATION_ID')) {
  x = x.replace('</application>', `    <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${id}"/>\n    </application>`);
  fs.writeFileSync(p, x); console.log('Patched AdMob app id:', id);
}
