/* Blast Bloom – game controller, UI and meta-game (daily rewards, quests, shop). */
const cv = $('#c'), R = new Renderer(cv);
const A = { mode: 'home', s: null, def: null, tapsLeft: 0, tapsUsed: 0, extraTaps: 0, mega: false, score: 0, coinsRun: 0, bestChain: 0,
  outcome: null, timer: 0, slowUntil: 0, paused: false, continued: false, dailyKey: null, home: null, homeT: 0 };

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 1800); }
const skin = () => SKINS[Save.d.skin] || SKINS.candy;
const world = () => (A.def ? A.def.world : (A.mode === 'home' ? worldFor(Save.d.level) : WORLDS[0]));
function yesterdayStr() { const d = new Date(Date.now() - 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

/* ---------- daily reward / quests ---------- */
const DR = [{ c: 50 }, { p: 'freeze', n: 1 }, { c: 100 }, { p: 'mega', n: 1 }, { c: 150 }, { p: 'tap', n: 2 }, { c: 300, p: 'mega', n: 2 }];
const PW_ICON = { mega: '💥', freeze: '❄️', tap: '➕' }, PW_NAME = { mega: 'Mega Blast', freeze: 'Freeze', tap: '+1 Tap' };
const drLabel = r => (r.c ? r.c + '🪙' : '') + (r.c && r.p ? ' + ' : '') + (r.p ? r.n + PW_ICON[r.p] : '');
function dailyState() {
  const d = Save.d.daily, t = todayStr();
  if (d.last === t) return { claimed: true, idx: (d.streak - 1) % 7 };
  return { claimed: false, idx: (d.last === yesterdayStr() ? d.streak : 0) % 7 };
}
const QDEF = [
  { id: 'pop', t: n => `Pop ${n} orbs`, targets: [60, 90, 130], reward: 40 },
  { id: 'win', t: n => `Clear ${n} levels`, targets: [2, 3, 4], reward: 50 },
  { id: 'chain', t: n => `Make a ${n}-orb chain`, targets: [6, 8, 10], reward: 60 }
];
function quests() {
  const q = Save.d.quest, t = todayStr();
  if (q.date !== t) { q.date = t; q.p = { pop: 0, win: 0, chain: 0 }; q.claimed = {}; Save.save(); }
  const r = mulberry(hashStr(t));
  return QDEF.map(d => ({ ...d, target: d.targets[Math.floor(r() * 3)] }));
}
function questProg(id, v, max) { quests(); const p = Save.d.quest.p; p[id] = max ? Math.max(p[id], v) : p[id] + v; }

/* ---------- screens ---------- */
function refreshHome() {
  const d = Save.d;
  $('#homeCoins').textContent = '🪙 ' + d.coins; $('#hudCoins').textContent = '🪙 ' + d.coins;
  $('#homeLevel').textContent = d.level; $('#homeWorld').textContent = worldFor(d.level).name;
  $('#homeStars').textContent = '★ ' + Save.totalStars();
  $('#dotDaily').classList.toggle('hidden', dailyState().claimed);
  $('#dotChal').classList.toggle('hidden', d.dailyChallenge.done === todayStr());
  $('#dotQuest').classList.toggle('hidden', !quests().some(q => d.quest.p[q.id] >= q.target && !d.quest.claimed[q.id]));
}
function showHome() {
  A.mode = 'home'; A.def = null; A.s = null; A.outcome = null; closeModal();
  $('#home').classList.remove('hidden'); $('#hud').classList.add('hidden'); resetAttract(); refreshHome();
}
function resetAttract() {
  const def = genRaw(7, 1234 + Math.floor(Math.random() * 999), false); def.world = worldFor(Save.d.level);
  A.home = makeState(def); A.homeT = 1.2;
}

function startLevel(n, dailyKey) {
  closeModal(); Sfx.init();
  const def = genLevel(n, dailyKey);
  A.def = def; A.dailyKey = dailyKey || null; A.s = makeState(def); A.mode = 'play';
  A.tapsLeft = def.taps; A.tapsUsed = 0; A.extraTaps = 0; A.mega = false; A.score = 0; A.coinsRun = 0; A.bestChain = 0;
  A.outcome = null; A.timer = 0; A.continued = false; A.paused = false; R.parts = []; R.pops = [];
  $('#home').classList.add('hidden'); $('#hud').classList.remove('hidden');
  $('#hudLevel').textContent = dailyKey ? '🏆 Daily Challenge' : 'Level ' + n;
  $('#hint').classList.toggle('hidden', !(!dailyKey && n <= 3));
  $('#hint').textContent = n === 1 ? '👆 Tap anywhere to blast!' : n === 2 ? 'Pop orbs to make chain reactions!' : 'Fewer taps = more ⭐';
  Save.d.stats.played++; Save.save(); refreshHud(); R.text(CFG.W / 2, 70, def.daily ? 'DAILY CHALLENGE' : 'LEVEL ' + n, '#fff', 26);
}
function refreshHud() {
  $('#hudScore').textContent = A.score; $('#hudCoins').textContent = '🪙 ' + Save.d.coins;
  const total = A.def ? A.def.taps + A.extraTaps : 0;
  $('#pips').innerHTML = Array.from({ length: total }, (_, i) => `<div class="pip${i >= A.tapsLeft ? ' off' : ''}"></div>`).join('');
  for (const k of ['mega', 'freeze', 'tap']) { const n = Save.d.inv[k]; const b = $('#n-' + k); b.textContent = n > 0 ? n : '+'; b.classList.toggle('zero', n <= 0); }
  $('[data-pw=mega]').classList.toggle('armed', A.mega);
}

/* ---------- input ---------- */
cv.addEventListener('pointerdown', e => {
  Sfx.init();
  if (A.mode !== 'play' || A.paused || A.outcome === 'win') return;
  const p = R.toLogical(e.clientX, e.clientY);
  if (p.x < 0 || p.y < 0 || p.x > CFG.W || p.y > CFG.H) return;
  if (A.tapsLeft <= 0) return;
  if (A.s.pillars.some(q => Math.hypot(q.x - p.x, q.y - p.y) < q.r)) { Sfx.bad(); R.text(p.x, p.y, '✖', '#ff8a8a', 22); return; }
  A.tapsLeft--; A.tapsUsed++;
  let rad = CFG.tapRadius;
  if (A.mega) { rad *= CFG.megaMul; A.mega = false; Save.d.inv.mega--; Save.save(); }
  A.s.roots[A.tapsUsed] = 0; addExplosion(A.s, p.x, p.y, rad, 0, A.tapsUsed, 0);
  if (A.s.frozen) A.s.freezeUntilSettled = true;
  R.rings.push({ x: p.x, y: p.y, r: 8, life: 0.4, max: 0.4, color: world().accent }); Sfx.tap(); Sfx.buzz(12);
  $('#hint').classList.add('hidden'); refreshHud();
});
$('#powerbar').addEventListener('click', e => {
  const b = e.target.closest('.pw'); if (!b || A.mode !== 'play' || A.outcome === 'win') return;
  Sfx.click(); const k = b.dataset.pw, inv = Save.d.inv;
  if (inv[k] <= 0) return offerPower(k);
  if (k === 'mega') { A.mega = !A.mega; toast(A.mega ? '💥 Next blast is MEGA' : 'Mega cancelled'); }
  else if (k === 'freeze') { if (A.s.frozen) return; inv.freeze--; A.s.frozen = true; toast('❄️ Frozen – aim carefully, then tap!'); }
  else if (k === 'tap') { inv.tap--; A.tapsLeft++; A.extraTaps++; if (A.outcome === 'lose') { A.outcome = null; A.timer = 0; } toast('+1 tap'); }
  Save.save(); refreshHud();
});
$('#btnPause').onclick = () => { if (A.mode !== 'play') return; Sfx.click(); A.paused = true; modal(`<h2>Paused</h2><div class="col">
  <button class="btn primary" data-act="resume">Resume</button><button class="btn" data-act="restart">Restart</button>
  <button class="btn ghost" data-act="home">Home</button></div>`); };
$('#btnPlay').onclick = () => { Sfx.init(); Sfx.click(); startLevel(Save.d.level); };
$('#btnDaily').onclick = () => { Sfx.init(); Sfx.click(); showDaily(); };
$('#btnChallenge').onclick = () => { Sfx.init(); Sfx.click(); showChallenge(); };
$('#btnQuests').onclick = () => { Sfx.init(); Sfx.click(); showQuests(); };
$('#btnShop').onclick = () => { Sfx.init(); Sfx.click(); showShop(); };
$('#btnSettings').onclick = () => { Sfx.init(); Sfx.click(); showSettings(); };
$('#hudCoins').onclick = () => showShop(); $('#homeCoins').onclick = () => showShop();

/* ---------- modal plumbing ---------- */
function modal(html) { $('#card').innerHTML = html; $('#modal').classList.remove('hidden'); if (A.mode === 'play') A.paused = true; }
function closeModal() { $('#modal').classList.add('hidden'); A.paused = false; }
$('#card').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; Sfx.click(); ACT[b.dataset.act] && ACT[b.dataset.act](b.dataset.a, b); });

function addCoins(n) { Save.d.coins += n; Save.save(); refreshHome(); if (A.mode === 'play') $('#hudCoins').textContent = '🪙 ' + Save.d.coins; }
function spend(n) { if (Save.d.coins < n) { toast('Not enough coins'); return false; } Save.d.coins -= n; Save.save(); refreshHome(); return true; }
function grantReward(r) { if (r.c) addCoins(r.c); if (r.p) { Save.d.inv[r.p] += r.n; Save.save(); } Sfx.coin(); }

/* ---------- result / flow ---------- */
function finishWin() {
  const d = Save.d, def = A.def, par = def.par;
  const stars = A.tapsUsed <= par ? 3 : A.tapsUsed <= par + 1 ? 2 : 1;
  let coins = 10 + stars * 5 + Math.floor(def.orbs.length / 3) + A.coinsRun, first = false;
  if (def.daily) { first = d.dailyChallenge.done !== todayStr(); if (first) { coins += 100 + stars * 40; d.dailyChallenge.done = todayStr(); } }
  else { const key = def.n; if ((d.stars[key] || 0) < stars) d.stars[key] = stars; if (d.level === def.n) d.level++; }
  d.stats.wins++; d.stats.bestChain = Math.max(d.stats.bestChain, A.bestChain); d.finished++;
  questProg('win', 1); questProg('chain', A.bestChain, true);
  A.reward = coins; addCoins(coins); Save.save(); Sfx.win(); Sfx.buzz(40);
  modal(`<h2>${def.daily ? 'Challenge Complete!' : 'Level Cleared!'}</h2>
    <div class="stars">${[1, 2, 3].map(i => `<span class="s ${i <= stars ? 'on' : ''}" style="animation-delay:${i * 0.25}s">★</span>`).join('')}</div>
    <div class="stat"><span>Taps used</span><span>${A.tapsUsed} / par ${par}</span></div>
    <div class="stat"><span>Best chain</span><span>${A.bestChain} 🔥</span></div>
    <div class="stat"><span>Score</span><span>${A.score}</span></div>
    <div class="stat"><span>Coins</span><span>+${coins} 🪙</span></div>
    <div class="col"><button class="btn primary" data-act="next">${def.daily ? 'Home' : 'Next Level ▶'}</button>
    <button class="btn ad" data-act="double" id="dbl">▶ Double coins (+${coins})</button>
    <div class="row"><button class="btn ghost" data-act="restart">Replay</button><button class="btn ghost" data-act="share">Share</button></div></div>`);
}
function finishLose() {
  Sfx.lose(); const left = aliveCount(A.s);
  modal(`<h2>Out of taps!</h2><p>${left} orb${left > 1 ? 's' : ''} left. So close!</p>
    <div class="col">${A.continued ? '' : `<button class="btn ad" data-act="cont">▶ Watch ad: +2 taps</button>
    <button class="btn" data-act="contCoin">+2 taps · 🪙 ${CFG.powerCost.tap * 2}</button>`}
    <button class="btn primary" data-act="restart">Try again</button><button class="btn ghost" data-act="home">Home</button></div>`);
}
function continueRun() { closeModal(); A.continued = true; A.tapsLeft += 2; A.extraTaps += 2; A.outcome = null; A.timer = 0; refreshHud(); }

const ACT = {
  resume() { closeModal(); A.paused = false; },
  restart() { A.def ? startLevel(A.def.n, A.dailyKey) : startLevel(Save.d.level); },
  home() { showHome(); },
  async next() {
    if (A.def && A.def.daily) return showHome();
    const n = A.def.n; closeModal(); await Ads.interstitial(n); startLevel(Save.d.level);
  },
  async double(a, b) { b.disabled = true; if (await Ads.rewarded()) { addCoins(A.reward); toast('+' + A.reward + ' 🪙 bonus!'); b.textContent = 'Doubled ✓'; } else b.disabled = false; },
  async cont() { if (await Ads.rewarded()) continueRun(); },
  contCoin() { if (spend(CFG.powerCost.tap * 2)) continueRun(); },
  async share() {
    const txt = `I just cleared Level ${A.def.n} in Blast Bloom with a ${A.bestChain}-orb chain! 💥 Can you beat it?`;
    try { if (navigator.share) await navigator.share({ text: txt }); else { await navigator.clipboard.writeText(txt); toast('Copied to clipboard'); } } catch (e) {}
  },
  close() { closeModal(); },
  // daily reward
  async claim(a) {
    const st = dailyState(); if (st.claimed) return;
    const d = Save.d.daily, mult = a === 'x2' ? 2 : 1;
    if (mult === 2 && !(await Ads.rewarded())) return;
    const r = DR[st.idx]; d.streak = (d.last === yesterdayStr() ? d.streak : 0) + 1; d.last = todayStr();
    for (let i = 0; i < mult; i++) grantReward(r);
    Save.save(); refreshHome(); showDaily();
  },
  playChallenge() { const n = 20 + (dayNum() % 30); startLevel(n, todayStr()); },
  // quests
  qclaim(id) { const q = quests().find(x => x.id === id); Save.d.quest.claimed[id] = true; addCoins(q.reward); Sfx.coin(); Save.save(); showQuests(); },
  // shop
  async buy(id) { if (await IAP.buy(id)) { const p = CFG.iap[id];
      if (id === 'remove_ads') Save.d.noAds = true;
      else if (id === 'starter_pack') { Save.d.starter = true; Save.d.coins += 1200; for (const k in Save.d.inv) Save.d.inv[k] += 3; Save.d.noAds = Save.d.noAds; }
      else Save.d.coins += p.coins;
      Save.save(); refreshHome(); toast('Thank you! 💖'); Sfx.coin(); showShop(); } },
  async freecoins() {
    const a = Save.d.adCoins, t = todayStr(); if (a.date !== t) { a.date = t; a.n = 0; }
    if (a.n >= 5) return toast('Come back tomorrow for more!');
    if (await Ads.rewarded()) { a.n++; addCoins(60); toast('+60 🪙'); showShop(); }
  },
  pbuy(k) { if (spend(CFG.powerCost[k])) { Save.d.inv[k]++; Save.save(); toast('Got ' + PW_NAME[k]); Sfx.coin(); refreshHud(); if (A.mode === 'play') closeModal(); else showShop(); } },
  async pad(k) { if (await Ads.rewarded()) { Save.d.inv[k]++; Save.save(); refreshHud(); closeModal(); toast('Got ' + PW_NAME[k]); } },
  skin(k) {
    if (!Save.d.skins.includes(k)) { if (!spend(SKINS[k].cost)) return; Save.d.skins.push(k); }
    Save.d.skin = k; Save.save(); showShop();
  },
  tsound() { Save.d.sound = !Save.d.sound; Save.save(); showSettings(); }, tvib() { Save.d.vib = !Save.d.vib; Save.save(); showSettings(); },
  restore() { toast('Purchases restored (if any)'); },
  reset() { if (confirm('Erase ALL progress?')) { localStorage.removeItem(CFG.saveKey); Save.load(); showHome(); } }
};
function offerPower(k) {
  modal(`<h2>${PW_ICON[k]} ${PW_NAME[k]}</h2><p>${{ mega: 'Your next blast is almost 2× bigger.', freeze: 'Orbs stand still so you can aim perfectly.', tap: 'One extra tap.' }[k]}</p>
   <div class="col"><button class="btn ad" data-act="pad" data-a="${k}">▶ Watch ad – free</button>
   <button class="btn" data-act="pbuy" data-a="${k}">Buy · 🪙 ${CFG.powerCost[k]}</button><button class="btn ghost" data-act="${A.mode === 'play' ? 'resume' : 'close'}">Cancel</button></div>`);
  if (A.mode === 'play') A.paused = true;
}

/* ---------- menus ---------- */
function showDaily() {
  const st = dailyState();
  modal(`<h2>Daily Reward</h2><p>Come back every day – day 7 is the big one!</p><div class="days">
   ${DR.map((r, i) => `<div class="day ${i === st.idx && !st.claimed ? 'cur' : ''} ${(i < st.idx || (st.claimed && i <= st.idx)) ? 'done' : ''}">Day ${i + 1}<i>${r.c && r.p ? '🎁' : r.c ? '🪙' : PW_ICON[r.p]}</i>${drLabel(r)}</div>`).join('')}</div>
   <div class="col">${st.claimed ? '<button class="btn" disabled>Claimed ✓ – see you tomorrow</button>' :
    `<button class="btn primary" data-act="claim">Claim ${drLabel(DR[st.idx])}</button><button class="btn ad" data-act="claim" data-a="x2">▶ Claim 2×</button>`}
   <button class="btn ghost" data-act="close">Close</button></div>`);
}
function showChallenge() {
  const done = Save.d.dailyChallenge.done === todayStr(), n = 20 + (dayNum() % 30);
  modal(`<h2>🏆 Daily Challenge</h2><p>One fresh, hard puzzle every day – the same for every player. ${done ? 'You already earned today\'s bonus, but you can replay for fun.' : 'Clear it for a <b>big coin bonus</b>!'}</p>
   <div class="stat"><span>Today's difficulty</span><span>Lv ${n}</span></div>
   <div class="col"><button class="btn primary" data-act="playChallenge">Play now</button><button class="btn ghost" data-act="close">Close</button></div>`);
}
function showQuests() {
  const q = quests(), p = Save.d.quest.p;
  modal(`<h2>Daily Quests</h2><p>Refresh every day.</p><div class="list">${q.map(x => { const v = Math.min(p[x.id], x.target), ok = p[x.id] >= x.target, cl = Save.d.quest.claimed[x.id];
    return `<div class="item"><div class="grow">${x.t(x.target)}<small>${v}/${x.target}</small><div class="bar"><i style="width:${v / x.target * 100}%"></i></div></div>
     ${cl ? '<span>✓</span>' : ok ? `<button class="btn primary" data-act="qclaim" data-a="${x.id}">+${x.reward}🪙</button>` : `<span>${x.reward}🪙</span>`}</div>`; }).join('')}</div>
   <div class="col"><button class="btn ghost" data-act="close">Close</button></div>`); refreshHome();
}
function showShop() {
  const d = Save.d, I = CFG.iap;
  const ad = d.adCoins.date === todayStr() ? d.adCoins.n : 0;
  modal(`<h2>Shop</h2><p>🪙 ${d.coins} coins</p><div class="list">
   <div class="item"><div class="grow">▶ Free coins<small>${5 - ad} left today · +60 each</small></div><button class="btn ad" data-act="freecoins">Watch</button></div>
   ${d.noAds ? '' : `<div class="item"><div class="grow">${I.remove_ads.name}<small>${I.remove_ads.desc}</small></div><button class="btn primary" data-act="buy" data-a="remove_ads">${I.remove_ads.price}</button></div>`}
   ${d.starter ? '' : `<div class="item"><div class="grow">⭐ ${I.starter_pack.name}<small>${I.starter_pack.desc}</small></div><button class="btn primary" data-act="buy" data-a="starter_pack">${I.starter_pack.price}</button></div>`}
   ${['coins_500', 'coins_1500', 'coins_4000'].map(k => `<div class="item"><div class="grow">🪙 ${I[k].name}</div><button class="btn primary" data-act="buy" data-a="${k}">${I[k].price}</button></div>`).join('')}
   ${['mega', 'freeze', 'tap'].map(k => `<div class="item"><div class="grow">${PW_ICON[k]} ${PW_NAME[k]}<small>You own ${d.inv[k]}</small></div><button class="btn" data-act="pbuy" data-a="${k}">🪙 ${CFG.powerCost[k]}</button></div>`).join('')}
   ${Object.entries(SKINS).map(([k, s]) => `<div class="item"><div class="swatches">${s.colors.slice(0, 4).map(c => `<i style="background:${c}"></i>`).join('')}</div><div class="grow">${s.name} orbs</div>
     <button class="btn ${d.skin === k ? 'ghost' : d.skins.includes(k) ? 'primary' : ''}" data-act="skin" data-a="${k}">${d.skin === k ? 'Equipped' : d.skins.includes(k) ? 'Equip' : '🪙 ' + s.cost}</button></div>`).join('')}
   </div><div class="col"><button class="btn ghost" data-act="close">Close</button></div>`);
}
function showSettings() {
  const d = Save.d;
  modal(`<h2>Settings</h2><div class="list">
   <div class="switch">Sound<button class="btn ${d.sound ? 'primary' : 'ghost'}" data-act="tsound">${d.sound ? 'ON' : 'OFF'}</button></div>
   <div class="switch">Vibration<button class="btn ${d.vib ? 'primary' : 'ghost'}" data-act="tvib">${d.vib ? 'ON' : 'OFF'}</button></div>
   <div class="switch">Restore purchases<button class="btn ghost" data-act="restore">Restore</button></div>
   <div class="switch">Reset progress<button class="btn ghost" data-act="reset">Reset</button></div></div>
   <p>Levels: ${d.level - 1} cleared · Best chain: ${d.stats.bestChain} · Orbs popped: ${d.stats.popped}</p>
   <div class="col"><button class="btn primary" data-act="close">Done</button></div>`);
}

/* ---------- main loop ---------- */
const CHEER = { 5: ['NICE!', '#fff'], 8: ['GREAT!', '#7bed9f'], 12: ['AMAZING!', '#ffd166'], 18: ['INSANE!!', '#ff6b9d'], 25: ['LEGENDARY!!!', '#c56cf0'] };
function handle(ev, play) {
  for (const e of ev) {
    if (e.k === 'crack') { Sfx.crack(); continue; }
    const o = e.o, col = o.type === 'gold' ? '#ffd700' : o.type === 'bomb' ? '#ff7043' : skin().colors[o.c % 6];
    R.popFx(o, col, e.n); Sfx.pop(e.n);
    if (!play) continue;
    A.score += 10 * e.n; A.bestChain = Math.max(A.bestChain, e.n);
    Save.d.stats.popped++; questProg('pop', 1);
    if (o.type === 'gold') { A.coinsRun += 5; R.text(o.x, o.y - 14, '+5🪙', '#ffd700', 14); Sfx.coin(); }
    if (CHEER[e.n]) { R.text(CFG.W / 2, CFG.H / 2 - 30, CHEER[e.n][0], CHEER[e.n][1], 30 + Math.min(14, e.n / 2)); Sfx.buzz(30); if (e.n >= 12) A.slowUntil = performance.now() + 650; }
  }
  if (play && ev.length) $('#hudScore').textContent = A.score;
}
function simulate(dt) {
  const ev = [];
  if (A.mode === 'home') {
    A.homeT -= dt; if (A.homeT < 0) {
      const alive = A.home.orbs.filter(o => o.alive);
      if (alive.length < 3) resetAttract(); else { const o = alive[Math.floor(Math.random() * alive.length)]; addExplosion(A.home, o.x + (Math.random() - 0.5) * 30, o.y, CFG.tapRadius, 0, 0, 0); }
      A.homeT = 2.5;
    }
    step(A.home, dt, ev); handle(ev, false); return;
  }
  if (A.mode !== 'play' || A.paused) return;
  step(A.s, dt, ev); handle(ev, true);
  if (A.outcome) { A.timer -= dt; if (A.timer <= 0 && (A.outcome === 'win' || A.outcome === 'lose')) { const w = A.outcome; A.outcome = w + '-shown'; w === 'win' ? finishWin() : finishLose(); } return; }
  const alive = aliveCount(A.s);
  if (alive === 0) { A.outcome = 'win'; A.timer = 0.9; $('#hint').classList.add('hidden'); }
  else if (A.tapsLeft <= 0 && A.s.expl.length === 0) { A.outcome = 'lose'; A.timer = 0.5; }
}
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const ts = now < A.slowUntil ? 0.35 : 1; acc += dt * ts;
  while (acc >= 1 / 60) { simulate(1 / 60); acc -= 1 / 60; }
  R.update(dt);
  R.draw(A.mode === 'home' ? A.home : A.s, A.mode === 'home' ? worldFor(Save.d.level) : A.def.world, skin());
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => R.resize());
window.addEventListener('orientationchange', () => setTimeout(() => R.resize(), 200));
document.addEventListener('visibilitychange', () => { if (document.hidden && A.mode === 'play' && !A.paused && !A.outcome) $('#btnPause').click(); });

Save.load(); Ads.init();
R.resize(); resetAttract(); refreshHome(); requestAnimationFrame(frame);
if (!dailyState().claimed && Save.d.finished >= 1) setTimeout(showDaily, 500);
window.__A = A; // debug hook
