import { CFG } from './config.js';
export const Save = {
  d: null,
  defaults() {
    return {
      coins: 150, noAds: false, v: 3, board: 'bw', boards: ['bw', 'wood', 'tournament', 'walnut', 'slate', 'custom'], customBoard: { light: '#f0d9b5', dark: '#b58863', finish: 'wood' }, bg: 'wood', bgs: ['wood'], pcolor: 'ivory', pcolors: ['ivory'], set: 'royal',
      sound: true, music: true, vib: true, legal: true, cinema: true, labels: 'border', autoRotate: true, introNames: false, flatHigh: true, quality: 'auto', speed: 1,
      rating: 800, stats: { games: 0, wins: 0, draws: 0, losses: 0, best: 0 }, lastSetup: { level: 2, color: 'white', time: 'none' },
      daily: { last: '', streak: 0 }, puzzle: { next: 0, solved: {}, daily: '' }, adCoins: { date: '', n: 0 }, game: null, gamesPlayed: 0
    };
  },
  load() {
    const base = this.defaults(); let oldSave = false;
    try {
      const raw = JSON.parse(localStorage.getItem(CFG.saveKey) || 'null'); oldSave = !!raw && raw.v !== 3;
      this.d = raw ? Object.assign(base, raw) : base;
      for (const k of ['stats', 'daily', 'adCoins', 'lastSetup', 'puzzle', 'customBoard']) this.d[k] = Object.assign(base[k], this.d[k]);
    } catch (e) { this.d = base; }
    if (oldSave) { this.d.v = 3; this.d.board = 'bw'; this.d.labels = 'border'; if (!this.d.boards.includes('bw')) this.d.boards.unshift('bw'); }   // one-time: new default look
    if (oldSave) this.save();
    return this.d;
  },
  save() { try { localStorage.setItem(CFG.saveKey, JSON.stringify(this.d)); } catch (e) {} }
};
