/* Analytics + crash reporting (Firebase Analytics / Crashlytics through Capacitor plugins). No-ops in a browser. */
const plug = n => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[n];
const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const safe = fn => { try { const r = fn(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } };
const clean = p => { const o = {}; for (const [k, v] of Object.entries(p || {})) o[k] = typeof v === 'number' || typeof v === 'string' ? v : String(v); return o; };

export const Track = {
  event(name, params) { if (!native) return; const A = plug('FirebaseAnalytics'); if (A) safe(() => A.logEvent({ name, params: clean(params) })); },
  screen(name) { if (!native) return; const A = plug('FirebaseAnalytics'); if (A) safe(() => A.setCurrentScreen({ screenName: name, screenClassOverride: 'MainActivity' })); },
  user(uid, props) {
    if (!native) return; const A = plug('FirebaseAnalytics'), C = plug('FirebaseCrashlytics');
    if (A) { safe(() => A.setUserId({ userId: uid })); for (const [k, v] of Object.entries(props || {})) safe(() => A.setUserProperty({ key: k, value: String(v) })); }
    if (C) safe(() => C.setUserId({ userId: uid }));
  },
  log(msg) { const C = plug('FirebaseCrashlytics'); if (native && C) safe(() => C.log({ message: String(msg).slice(0, 500) })); },
  /** report a handled/JS error to Crashlytics (native crashes are captured automatically) */
  error(err, ctx) {
    const C = plug('FirebaseCrashlytics'); const msg = (ctx ? ctx + ': ' : '') + (err && err.message || err);
    if (!native || !C) { console.warn('[error]', msg); return; }
    safe(() => C.recordException({ message: String(msg).slice(0, 500), stacktrace: err && err.stack ? String(err.stack).split('\n').slice(0, 20).map(l => ({ fileName: l.trim(), lineNumber: 0, className: '', methodName: '' })) : undefined }));
  },
  init() {
    window.addEventListener('error', e => Track.error(e.error || e.message, 'js'));
    window.addEventListener('unhandledrejection', e => Track.error(e.reason, 'promise'));
    if (!native) return;
    const A = plug('FirebaseAnalytics'), C = plug('FirebaseCrashlytics');
    if (A) safe(() => A.setEnabled({ enabled: true })); if (C) safe(() => C.setEnabled({ enabled: true }));
    Track.event('app_boot');
  }
};
