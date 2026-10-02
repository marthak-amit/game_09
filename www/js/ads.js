/* Monetisation adapter. In a browser it uses a fake "test ad" overlay; inside the Capacitor
   Android app it calls the AdMob plugin (@capacitor-community/admob). */
const Native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
/* Native app lifecycle: pause when backgrounded, handle Android back button. */
function nativeLifecycle(onPause, onBack) {
  const App = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App;
  if (!App) return;
  App.addListener('appStateChange', st => { if (!st.isActive) onPause(); });
  App.addListener('backButton', () => onBack(() => App.exitApp()));
}
const Ads = {
  last: 0, count: 0, ready: false,
  async init() {
    if (!Native) return;
    try {
      const A = Capacitor.Plugins.AdMob;
      // GDPR/UMP consent (required for EU/UK users before personalised ads)
      try {
        const info = await A.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === 'REQUIRED') await A.showConsentForm();
      } catch (e) { console.warn('consent', e); }
      await A.initialize({ initializeForTesting: CFG.ads.testing });
      this.ready = true;
    } catch (e) { console.warn('AdMob init failed', e); }
  },
  fake(label, secs) {
    return new Promise(res => {
      const el = document.createElement('div'); el.className = 'fakead';
      el.innerHTML = `<div class="fa-box"><div class="fa-tag">TEST AD</div><div class="fa-title">${label}</div><div class="fa-t"></div><button class="btn ghost fa-x" disabled>Close</button></div>`;
      document.body.appendChild(el);
      let n = secs; const t = $('.fa-t', el), b = $('.fa-x', el);
      const iv = setInterval(() => { n--; t.textContent = n > 0 ? n + 's' : ''; if (n <= 0) { clearInterval(iv); b.disabled = false; b.textContent = label.includes('Reward') ? 'Claim reward' : 'Close'; } }, 1000);
      t.textContent = n + 's';
      b.onclick = () => { el.remove(); res(n <= 0); };
    });
  },
  /** Rewarded video. Resolves true only if the user earned the reward. */
  async rewarded() {
    if (Native && this.ready) {
      try {
        const A = Capacitor.Plugins.AdMob; let earned = false;
        const h = await A.addListener('onRewardedVideoAdReward', () => { earned = true; });
        await A.prepareRewardVideoAd({ adId: CFG.ads.rewarded, isTesting: CFG.ads.testing });
        await A.showRewardVideoAd();
        h.remove(); return earned;
      } catch (e) { toast('Ad not available, try again later'); return false; }
    }
    if (Native) { toast('Ad not available'); return false; }
    return this.fake('Rewarded video', 3);
  },
  /** Interstitial between levels, frequency-capped. Never shown to ad-free users. */
  async interstitial(levelNum) {
    if (Save.d.noAds || levelNum <= CFG.ads.freeLevels) return;
    this.count++;
    if (this.count % CFG.ads.interstitialEvery !== 0 || Date.now() - this.last < CFG.ads.minGapMs) return;
    this.last = Date.now();
    if (Native && this.ready) {
      try { const A = Capacitor.Plugins.AdMob; await A.prepareInterstitial({ adId: CFG.ads.interstitial, isTesting: CFG.ads.testing }); await A.showInterstitial(); } catch (e) {}
      return;
    }
    if (!Native) await this.fake('Interstitial', 2);
  }
};

const IAP = {
  /** Resolves true when the purchase succeeded. Wire a real store plugin (e.g. cordova-plugin-purchase) here. */
  async buy(id) {
    if (Native) {
      const store = window.CdvPurchase && window.CdvPurchase.store;
      if (!store) { toast('Store not configured yet'); return false; }
      toast('Store hook-up pending'); return false; // TODO: store.order(...) once Play Console products exist
    }
    return confirm('TEST PURCHASE: ' + CFG.iap[id].name + ' (' + CFG.iap[id].price + ')?\n(Browser preview only – no real payment.)');
  }
};
