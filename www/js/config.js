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
  wood:     { name: 'Classic Wood',  cost: 0 },
  marble:   { name: 'Black Marble',  cost: 400 },
  emerald:  { name: 'Emerald Club',  cost: 600 },
  sapphire: { name: 'Royal Sapphire', cost: 800 }
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
