const Save = {
  d: null,
  defaults() {
    return {
      level: 1, stars: {}, coins: 100, inv: { mega: 1, freeze: 1, tap: 1 },
      skin: 'candy', skins: ['candy'], noAds: false, starter: false,
      sound: true, music: true, vib: true, spin: { date: '', free: false, ads: 0 }, chests: [],
      daily: { last: '', streak: 0 }, dailyChallenge: { done: '' },
      quest: { date: '', p: { pop: 0, win: 0, chain: 0 }, claimed: {} },
      adCoins: { date: '', n: 0 },
      stats: { popped: 0, bestChain: 0, played: 0, wins: 0 }, finished: 0, tutorial: true
    };
  },
  load() {
    const base = this.defaults();
    try {
      const raw = JSON.parse(localStorage.getItem(CFG.saveKey) || 'null');
      this.d = raw ? Object.assign(base, raw) : base;
      for (const k of ['inv', 'daily', 'dailyChallenge', 'quest', 'adCoins', 'stats', 'spin']) this.d[k] = Object.assign(base[k], this.d[k]);
    } catch (e) { this.d = base; }
    return this.d;
  },
  save() { try { localStorage.setItem(CFG.saveKey, JSON.stringify(this.d)); } catch (e) {} },
  totalStars() { let t = 0; for (const k in this.d.stars) t += this.d.stars[k]; return t; }
};
