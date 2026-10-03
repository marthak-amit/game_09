/* Royal Chess 3D – config. Replace ad unit IDs / product IDs before release. */
export const CFG = {
  saveKey: 'royalchess3d_v1',
  ads: {
    testing: true,           // set false for production
    androidAppId: 'ca-app-pub-3940256099942544~3347511713',   // Google TEST ids
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    minGapMs: 120000,        // interstitials never closer than this
    freeGames: 2             // no interstitials in the first N games
  },
  iap: {
    remove_ads:  { name: 'Remove Ads',  price: '₹149', desc: 'No more pop-up ads. Rewarded ads stay optional.' },
    coins_500:   { name: '500 Coins',   price: '₹49',  coins: 500 },
    coins_1500:  { name: '1500 Coins',  price: '₹129', coins: 1500 },
    coins_4000:  { name: '4000 Coins',  price: '₹299', coins: 4000 }
  },
  daily: [50, 60, 70, 80, 100, 120, 250],
  hintsPerGame: 3, undosPerGame: 3
};
export const BOARDS = {
  bw:         { name: 'Black & White',  cost: 0,   light: '#f2f1ec', dark: '#25252a' },
  wood:       { name: 'Classic Wood',   cost: 0,   light: '#eed3a4', dark: '#7c4a2a' },
  tournament: { name: 'Tournament',     cost: 0,   light: '#eeeed2', dark: '#6f9a52' },
  walnut:     { name: 'Dark Walnut',    cost: 0,   light: '#d9b88a', dark: '#4e3020' },
  slate:      { name: 'Slate',          cost: 0,   light: '#d4dae1', dark: '#5b6b80' },
  custom:     { name: 'Custom colours', cost: 0,   light: '#f0d9b5', dark: '#b58863' },
  marble:     { name: 'Black Marble',   cost: 400, light: '#eeeae3', dark: '#2a2a2e' },
  emerald:    { name: 'Emerald Club',   cost: 500, light: '#e8dfc2', dark: '#2f6e52' },
  ruby:       { name: 'Ruby Velvet',    cost: 400, light: '#f4e4d6', dark: '#9b2335' },
  ocean:      { name: 'Ocean Reef',     cost: 400, light: '#f1e5c8', dark: '#1f8a9c' },
  royal:      { name: 'Royal Purple',   cost: 500, light: '#e9def6', dark: '#6a46a3' },
  candy:      { name: 'Candy Pink',     cost: 300, light: '#fdeaf1', dark: '#e58ab4' },
  sapphire:   { name: 'Royal Sapphire', cost: 700, light: '#c9d7ec', dark: '#27487d' }
};
export const BGS = {
  wood:   { name: 'Wooden Table',  icon: '🪵', cost: 0 },
  palace: { name: 'Royal Palace',  icon: '🏰', cost: 250 },
  garden: { name: 'Sunset Garden', icon: '🌅', cost: 250 },
  night:  { name: 'Starry Night',  icon: '🌙', cost: 350 },
  snow:   { name: 'Snowy Peak',    icon: '❄️', cost: 250 }
};
export const PIECE_COLORS = {
  ivory:    { name: 'Ivory & Ebony',    cost: 0 },
  rosewood: { name: 'Maple & Rosewood', cost: 300 },
  gold:     { name: 'Gold & Silver',    cost: 500 }
};
export const TIMES = [
  { id: 'none', name: 'No clock', base: 0, inc: 0 },
  { id: '5', name: '5 min', base: 300, inc: 0 },
  { id: '10', name: '10 min', base: 600, inc: 0 },
  { id: '15+10', name: '15 | 10', base: 900, inc: 10 }
];

/* Online locations (like 8-ball pool tables): bigger entry fee = bigger prize; higher ones unlock with rating, online wins/games and puzzles solved */
export const VENUES = [
  { id: 'lounge',   name: 'Open Lounge',        icon: '🛋️', fee: 0,    art: ['#3d5a4a', '#8fbf9f'], blurb: 'Play for fun – no stake', req: {} },
  { id: 'street',   name: 'Street Corner',      icon: '🛣️', fee: 50,   art: ['#5b4636', '#d1a76c'], blurb: 'Quick games with the locals', req: {} },
  { id: 'cafe',     name: 'Chai Café',          icon: '☕',  fee: 100,  art: ['#6b3f2a', '#e0a46a'], blurb: 'Where the regulars play', req: { games: 3 } },
  { id: 'club',     name: 'City Chess Club',    icon: '🏙️', fee: 250,  art: ['#2c4a78', '#7fb0ee'], blurb: 'Serious players, serious stakes', req: { wins: 2, rating: 850 } },
  { id: 'palace',   name: 'Royal Palace',       icon: '🏰', fee: 500,  art: ['#5a2f7a', '#cfa2f0'], blurb: 'Play under the chandeliers', req: { wins: 5, rating: 950 } },
  { id: 'maharaja', name: 'Maharaja Hall',      icon: '👑', fee: 1500, art: ['#7a4a10', '#f2cf72'], blurb: 'High stakes for kings', req: { wins: 12, rating: 1100 } },
  { id: 'grand',    name: 'Grandmaster Arena',  icon: '🏆', fee: 5000, art: ['#7a1f2a', '#f08a8a'], blurb: 'The ultimate table', req: { wins: 30, rating: 1300, puzzles: 30 } }
];
