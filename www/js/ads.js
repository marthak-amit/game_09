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
  last: 0, ready: false, rewardReady: false, interReady: false, rewardLoading: false,
  async init() {
    if (!Native) return;
    try {
      const A = Capacitor.Plugins.AdMob;
      try { const info = await A.requestConsentInfo(); if (info.isConsentFormAvailable && info.status === 'REQUIRED') await A.showConsentForm(); } catch (e) { console.warn('consent', e); }
      await A.initialize({ initializeForTesting: CFG.ads.testing });
      this.ready = true;
      // keep one rewarded + one interstitial ad loaded in the background, so showing them is instant
      A.addListener('onRewardedVideoAdLoaded', () => { this.rewardReady = true; this.rewardLoading = false; });
      A.addListener('onRewardedVideoAdFailedToLoad', () => { this.rewardReady = false; this.rewardLoading = false; setTimeout(() => this.preloadRewarded(), 20000); });
      A.addListener('interstitialAdLoaded', () => { this.interReady = true; });
      A.addListener('interstitialAdFailedToLoad', () => { this.interReady = false; setTimeout(() => this.preloadInterstitial(), 30000); });
      this.preloadRewarded(); this.preloadInterstitial();
    } catch (e) { console.warn('AdMob init failed', e); }
  },
  async preloadRewarded() {
    if (!Native || !this.ready || this.rewardReady || this.rewardLoading) return;
    this.rewardLoading = true;
    try { await Capacitor.Plugins.AdMob.prepareRewardVideoAd({ adId: CFG.ads.rewarded, isTesting: CFG.ads.testing }); } catch (e) { this.rewardLoading = false; setTimeout(() => this.preloadRewarded(), 20000); }
  },
  async preloadInterstitial() {
    if (!Native || !this.ready || this.interReady) return;
    try { await Capacitor.Plugins.AdMob.prepareInterstitial({ adId: CFG.ads.interstitial, isTesting: CFG.ads.testing }); } catch (e) { setTimeout(() => this.preloadInterstitial(), 30000); }
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
  /** Rewarded video. Resolves true only if the user earned the reward. Shows instantly when pre-loaded. */
  async rewarded() {
    if (Native && this.ready) {
      try {
        const A = Capacitor.Plugins.AdMob; let earned = false;
        if (!this.rewardReady) {   // not loaded yet: say so once and wait (max 10 s) instead of freezing silently
          bus.toast('Loading ad…', 2500); this.preloadRewarded();
          for (let i = 0; i < 50 && !this.rewardReady; i++) await new Promise(r => setTimeout(r, 200));
          if (!this.rewardReady) { bus.toast('No ad available right now – try again in a minute'); return false; }
        }
        const h = await A.addListener('onRewardedVideoAdReward', () => { earned = true; });
        this.rewardReady = false;
        try { await A.showRewardVideoAd(); } finally { h.remove(); this.preloadRewarded(); }
        return earned;
      } catch (e) { this.rewardReady = false; this.preloadRewarded(); bus.toast('Ad not available, try again later'); return false; }
    }
    if (Native) { bus.toast('Ad not available'); return false; }
    return this.fake('Rewarded video', 3);
  },
  /** Interstitial after a finished game, frequency-capped, never for ad-free users. Never blocks: skipped if not loaded. */
  async interstitial() {
    if (Save.d.noAds || Save.d.gamesPlayed <= CFG.ads.freeGames) return;
    if (Date.now() - this.last < CFG.ads.minGapMs) return;
    if (Native && this.ready) {
      if (!this.interReady) { this.preloadInterstitial(); return; }
      this.last = Date.now(); this.interReady = false;
      try { await Capacitor.Plugins.AdMob.showInterstitial(); } catch (e) {} finally { this.preloadInterstitial(); }
      return;
    }
    if (!Native) { this.last = Date.now(); await this.fake('Interstitial', 2); }
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
