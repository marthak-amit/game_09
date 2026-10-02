/* Monetisation adapter. Browser: fake "TEST AD" overlay. Capacitor Android: AdMob plugin (@capacitor-community/admob). */
import { CFG } from './config.js';
import { Save } from './storage.js';
export const Native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
export const bus = { toast: () => {} };

export function nativeLifecycle(onPause, onBack) {
  const App = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App;
  if (!App) return;
  App.addListener('appStateChange', st => { if (!st.isActive) onPause(); });
  App.addListener('backButton', () => onBack(() => App.exitApp()));
}

export const Ads = {
  last: 0, ready: false,
  async init() {
    if (!Native) return;
    try {
      const A = Capacitor.Plugins.AdMob;
      try { const info = await A.requestConsentInfo(); if (info.isConsentFormAvailable && info.status === 'REQUIRED') await A.showConsentForm(); } catch (e) { console.warn('consent', e); }
      await A.initialize({ initializeForTesting: CFG.ads.testing });
      this.ready = true;
    } catch (e) { console.warn('AdMob init failed', e); }
  },
  fake(label, secs) {
    return new Promise(res => {
      const el = document.createElement('div'); el.className = 'fakead';
      el.innerHTML = `<div class="fa-box"><div class="fa-tag">TEST AD</div><div class="fa-title">${label}</div><div class="fa-t"></div><button class="btn ghost fa-x" disabled>Close</button></div>`;
      document.body.appendChild(el);
      let n = secs; const t = el.querySelector('.fa-t'), b = el.querySelector('.fa-x');
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
        await A.showRewardVideoAd(); h.remove(); return earned;
      } catch (e) { bus.toast('Ad not available, try again later'); return false; }
    }
    if (Native) { bus.toast('Ad not available'); return false; }
    return this.fake('Rewarded video', 3);
  },
  /** Interstitial after a finished game, frequency-capped, never for ad-free users. */
  async interstitial() {
    if (Save.d.noAds || Save.d.gamesPlayed <= CFG.ads.freeGames) return;
    if (Date.now() - this.last < CFG.ads.minGapMs) return;
    this.last = Date.now();
    if (Native && this.ready) {
      try { const A = Capacitor.Plugins.AdMob; await A.prepareInterstitial({ adId: CFG.ads.interstitial, isTesting: CFG.ads.testing }); await A.showInterstitial(); } catch (e) {}
      return;
    }
    if (!Native) await this.fake('Interstitial', 2);
  }
};

export const IAP = {
  /** Resolves true when purchase succeeded. Wire a real store plugin (e.g. cordova-plugin-purchase) here. */
  async buy(id) {
    if (Native) {
      const store = window.CdvPurchase && window.CdvPurchase.store;
      if (!store) { bus.toast('Store not configured yet'); return false; }
      bus.toast('Store hook-up pending'); return false; // TODO: store.order(...) once Play Console products exist
    }
    return confirm('TEST PURCHASE: ' + CFG.iap[id].name + ' (' + CFG.iap[id].price + ')?\n(Browser preview only – no real payment.)');
  }
};
