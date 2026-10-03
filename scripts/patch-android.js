// Adds the AdMob application ID to the generated Android project (required by the AdMob plugin).
// Uses Google's TEST app id unless ADMOB_APP_ID is set (set it in CI secrets for the release build).
const fs = require('fs'), p = 'android/app/src/main/AndroidManifest.xml';
if (!fs.existsSync(p)) { console.log('No android project yet – run "npx cap add android" first'); process.exit(0); }
let x = fs.readFileSync(p, 'utf8');
const id = process.env.ADMOB_APP_ID || 'ca-app-pub-3940256099942544~3347511713';
if (!x.includes('android.permission.VIBRATE')) x = x.replace('</manifest>', '    <uses-permission android:name="android.permission.VIBRATE"/>\n</manifest>');
if (!x.includes('com.google.android.gms.ads.APPLICATION_ID')) {
  x = x.replace('</application>', `    <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${id}"/>\n    </application>`);
  console.log('Patched AdMob app id:', id);
}
if (!x.includes('screenOrientation')) x = x.replace('<activity', '<activity android:screenOrientation="portrait"');
fs.writeFileSync(p, x);
console.log('Manifest patched (portrait, vibrate, AdMob id)');

/* ---- Online play: Firebase Google / Facebook sign-in (only wired when the project provides the files/ids) ---- */
const vg = 'android/variables.gradle';
if (fs.existsSync(vg)) {
  let v = fs.readFileSync(vg, 'utf8');
  if (!v.includes('rgcfaIncludeGoogle')) { v = v.replace(/ext\s*\{/, `ext {\n    rgcfaIncludeGoogle = true\n    rgcfaIncludeFacebook = ${process.env.FACEBOOK_APP_ID ? 'true' : 'false'}`); fs.writeFileSync(vg, v); console.log('variables.gradle: Google sign-in on, Facebook', process.env.FACEBOOK_APP_ID ? 'on' : 'off'); }
}
if (process.env.FACEBOOK_APP_ID) {
  const sp = 'android/app/src/main/res/values/strings.xml';
  let s = fs.readFileSync(sp, 'utf8');
  if (!s.includes('facebook_app_id')) {
    s = s.replace('</resources>', `    <string name="facebook_app_id">${process.env.FACEBOOK_APP_ID}</string>\n    <string name="fb_login_protocol_scheme">fb${process.env.FACEBOOK_APP_ID}</string>\n    <string name="facebook_client_token">${process.env.FACEBOOK_CLIENT_TOKEN || ''}</string>\n</resources>`);
    fs.writeFileSync(sp, s);
  }
  let m = fs.readFileSync(p, 'utf8');
  if (!m.includes('com.facebook.sdk.ApplicationId')) {
    m = m.replace('</application>', `    <meta-data android:name="com.facebook.sdk.ApplicationId" android:value="@string/facebook_app_id"/>
    <meta-data android:name="com.facebook.sdk.ClientToken" android:value="@string/facebook_client_token"/>
    <activity android:name="com.facebook.FacebookActivity" android:configChanges="keyboard|keyboardHidden|screenLayout|screenSize|orientation" android:label="@string/app_name"/>
    <activity android:name="com.facebook.CustomTabActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.VIEW"/><category android:name="android.intent.category.DEFAULT"/><category android:name="android.intent.category.BROWSABLE"/><data android:scheme="@string/fb_login_protocol_scheme"/></intent-filter></activity>
    </application>`);
    fs.writeFileSync(p, m); console.log('Manifest: Facebook login configured');
  }
}

/* ---- Fixed debug keystore, so the SHA-1 registered in Firebase / Facebook stays the same on every CI build ---- */
const gp = 'android/app/build.gradle';
if (fs.existsSync(gp) && fs.existsSync('keystore/royalchess-debug.keystore')) {
  let g = fs.readFileSync(gp, 'utf8');
  if (!g.includes('royalchess-debug.keystore')) {
    const ks = require('path').resolve('keystore/royalchess-debug.keystore').replace(/\\/g, '/');
    g = g.replace(/android\s*\{/, `android {\n    signingConfigs {\n        debug {\n            storeFile file('${ks}')\n            storePassword 'android'\n            keyAlias 'androiddebugkey'\n            keyPassword 'android'\n        }\n    }`);
    fs.writeFileSync(gp, g); console.log('Debug signing: fixed keystore');
  }
}

/* ---- Version code/name from the CI run number (needed for the force-update check) + Crashlytics gradle plugin ---- */
if (fs.existsSync(gp)) {
  let g = fs.readFileSync(gp, 'utf8'); const n = parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10) || 1;
  g = g.replace(/versionCode\s+\d+/, `versionCode ${n}`).replace(/versionName\s+"[^"]*"/, `versionName "1.0.${n}"`);
  if (fs.existsSync('firebase/google-services.json') && !g.includes('firebase.crashlytics')) g = g.replace(/apply plugin: 'com.android.application'/, "apply plugin: 'com.android.application'\napply plugin: 'com.google.firebase.crashlytics'");
  fs.writeFileSync(gp, g); console.log('versionCode', n);
}
const rg = 'android/build.gradle';
if (fs.existsSync(rg) && fs.existsSync('firebase/google-services.json')) {
  let r = fs.readFileSync(rg, 'utf8');
  if (!r.includes('firebase-crashlytics-gradle')) { r = r.replace(/classpath 'com.google.gms:google-services:[^']*'/, m => m + "\n        classpath 'com.google.firebase:firebase-crashlytics-gradle:3.0.2'"); fs.writeFileSync(rg, r); console.log('Crashlytics gradle plugin added'); }
}
