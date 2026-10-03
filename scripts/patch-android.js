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
