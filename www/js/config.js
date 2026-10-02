/* Blast Bloom – global config. Replace ad unit IDs / product IDs before release. */
const CFG = {
  W: 400, H: 600,            // logical arena size
  tapRadius: 60, megaMul: 1.9,
  saveKey: 'blastbloom_v1',
  ads: {
    testing: true,           // set false for production
    androidAppId: 'ca-app-pub-3940256099942544~3347511713',          // Google test ID
    interstitial: 'ca-app-pub-3940256099942544/1033173712',          // Google test ID
    rewarded: 'ca-app-pub-3940256099942544/5224354917',              // Google test ID
    interstitialEvery: 3,    // show after every Nth finished level
    minGapMs: 90000,         // never closer than this
    freeLevels: 4            // no interstitials in the first N levels
  },
  iap: {
    remove_ads:   { name: 'Remove Ads',   price: '₹149', desc: 'No more pop-up ads. Rewarded ads stay optional.' },
    starter_pack: { name: 'Starter Pack', price: '₹99',  desc: '1200 coins + 3 of every power-up' },
    coins_500:    { name: '500 Coins',    price: '₹49',  coins: 500 },
    coins_1500:   { name: '1500 Coins',   price: '₹129', coins: 1500 },
    coins_4000:   { name: '4000 Coins',   price: '₹299', coins: 4000 }
  },
  powerCost: { mega: 60, freeze: 40, tap: 50 }
};

const TYPES = {
  basic:  { r: 13, blast: 52 },
  big:    { r: 19, blast: 80 },
  bomb:   { r: 15, blast: 112 },
  armor:  { r: 16, blast: 58, hp: 2 },
  anchor: { r: 14, blast: 58, static: true },
  gold:   { r: 14, blast: 56 }
};

const WORLDS = [
  { name: 'Candy Meadow',  bg1: '#2b1055', bg2: '#7597de', accent: '#ffd166' },
  { name: 'Ocean Drift',   bg1: '#021b3a', bg2: '#1b8aa6', accent: '#7ff5e0' },
  { name: 'Sunset Mesa',   bg1: '#3d0b37', bg2: '#ff6b6b', accent: '#ffe66d' },
  { name: 'Mint Glacier',  bg1: '#0b3d3a', bg2: '#8ee3c8', accent: '#ffffff' },
  { name: 'Neon Alley',    bg1: '#0d0221', bg2: '#541388', accent: '#ff2e97' },
  { name: 'Lava Lamp',     bg1: '#1d0b0b', bg2: '#d1495b', accent: '#ffb347' },
  { name: 'Star Garden',   bg1: '#050a30', bg2: '#3a2c8f', accent: '#b8f2e6' }
];

const SKINS = {
  candy:  { name: 'Candy',  cost: 0,    colors: ['#ff6b9d', '#ffb347', '#ffe66d', '#7bed9f', '#70a1ff', '#c56cf0'] },
  neon:   { name: 'Neon',   cost: 300,  colors: ['#ff2e97', '#00f5d4', '#fee440', '#9b5de5', '#00bbf9', '#f15bb5'] },
  ocean:  { name: 'Ocean',  cost: 600,  colors: ['#48cae4', '#90e0ef', '#00b4d8', '#ade8f4', '#0096c7', '#caf0f8'] },
  sunset: { name: 'Sunset', cost: 900,  colors: ['#ff595e', '#ff924c', '#ffca3a', '#c77dff', '#ff7096', '#ffd6a5'] },
  gold:   { name: 'Royal',  cost: 1500, colors: ['#ffd700', '#f7b32b', '#fff3b0', '#e0a458', '#ffe066', '#ffc857'] },
  galaxy: { name: 'Galaxy', cost: 2500, colors: ['#7400b8', '#6930c3', '#5390d9', '#48bfe3', '#64dfdf', '#80ffdb'] }
};
