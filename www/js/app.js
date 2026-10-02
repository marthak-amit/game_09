/* Royal Chess 3D – game controller, UI and meta-game. */
import { ChessScene } from './scene.js';
import { Sfx } from './audio.js';
import { Save } from './storage.js';
import { CFG, BOARDS, PIECE_COLORS, TIMES } from './config.js';
import { Ads, IAP, Native, bus, nativeLifecycle } from './ads.js';

const E = window.ChessEngine;
const $ = (s, r) => (r || document).querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GL = {
  royal: { p: '♟︎', n: '🐴', b: '🐪', r: '🐘', q: '♛︎', k: '♚︎' },
  staunton: { p: '♟︎', n: '♞︎', b: '♝︎', r: '♜︎', q: '♛︎', k: '♚︎' }
};
const NAMES = { royal: { p: 'Soldier', n: 'Horse', b: 'Camel', r: 'Elephant', q: 'Queen', k: 'King' }, staunton: { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' } };
const TCH = ' pnbrqk';
const glyph = t => GL[Save.d.set][t];

/* ---------- boot ---------- */
Save.load();
bus.toast = toast;
const scene = new ChessScene($('#c'));
const G = { mode: null, human: 0, level: 2, board: null, moves: [], sans: [], legal: [], over: false, busy: false, thinking: false, sel: -1, targets: [], clocks: [0, 0], tc: TIMES[0], hints: 0, undos: 0, paused: false, startFen: E.START_FEN, id: 0, tick: null, captured: [[], []], lastMove: null };

function applyStyle() { scene.setStyle({ board: Save.d.board, pcolor: Save.d.pcolor, set: Save.d.set, quality: Save.d.quality, speed: Save.d.speed, cinema: Save.d.cinema }); }
applyStyle();
scene.onQuality = q => toast('Graphics set to ' + q + ' for smooth play', 2600);

let toastT;
function toast(msg, ms = 1900) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
function modal(html) { $('#card').innerHTML = html; $('#modal').classList.remove('hidden'); G.paused = G.mode && !G.over ? true : G.paused; }
function closeModal() { $('#modal').classList.add('hidden'); if (G.mode && !G.over) G.paused = false; }
const modalOpen = () => !$('#modal').classList.contains('hidden');
$('#card').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; Sfx.click();
  const fn = ACT[b.dataset.act]; if (fn) fn(b.dataset.a, b);
});
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && !G.over && ($('#card').dataset.dismiss === '1')) closeModal(); });

/* ---------- puzzles (mate in N, unique solution; generated + verified by the engine) ---------- */
let PUZ = null;
async function loadPuzzles() { if (PUZ) return PUZ; try { PUZ = await (await fetch('js/puzzles.json')).json(); } catch (e) { PUZ = []; } return PUZ; }
function forcedMates(b, n) {
  const res = [];
  for (const m of b.legal()) {
    b.make(m); let ok = b.inCheck() && b.legal().length === 0;
    if (!ok && n > 1 && !b.insufficient()) { const rep = b.legal(); ok = rep.length > 0 && rep.every(r => { b.make(r); const good = forcedMates(b, n - 1).length > 0; b.unmake(); return good; }); }
    b.unmake(); if (ok) res.push(m);
  }
  return res;
}
const dayHash = () => { let h = 0; for (const c of todayStr()) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/* ---------- AI worker ---------- */
let worker = null, reqId = 0; const pending = new Map();
function startWorker() {
  try {
    worker = new Worker('js/ai-worker.js');
    worker.onmessage = ev => { const p = pending.get(ev.data.id); if (p) { pending.delete(ev.data.id); p(ev.data); } };
    worker.onerror = () => { worker = null; };
  } catch (e) { worker = null; }
}
startWorker();
function askAI(payload) {
  return new Promise(resolve => {
    const id = ++reqId, data = { id, startFen: G.startFen, moves: G.moves.slice(), ...payload };
    if (worker) { pending.set(id, resolve); worker.postMessage(data); return; }
    setTimeout(() => { // fallback: run on the main thread
      const b = new E.Board(data.startFen); for (const m of data.moves) b.make(m);
      const res = data.hint ? new E.Searcher().search(b, 4, 1200) : E.chooseMove(b, data.level); resolve({ id, move: res.move, score: res.score || 0 });
    }, 30);
  });
}

/* ---------- screens ---------- */
function showHome() {
  closeModal(); clearInterval(G.tick); G.mode = null; G.id++; G.thinking = false;
  $('#hud').classList.add('hidden'); $('#home').classList.remove('hidden');
  const d = Save.d; $('#homeCoins b').textContent = d.coins; $('#homeRating b').textContent = d.rating;
  $('#btnContinue').classList.toggle('hidden', !d.game);
  $('#dotGift').classList.toggle('hidden', dailyState().claimed);
  $('#dotPuz').classList.toggle('hidden', d.puzzle.daily === todayStr());
  scene.loadPosition(new E.Board().b); scene.setMenuSpin(true); scene.resetCamera('white', true); scene.setSph(0.6, 0.9, scene.fitDist * 0.82);
  scene.running = true;
}
function dailyState() {
  const d = Save.d.daily, t = todayStr(); if (d.last === t) return { claimed: true, idx: (d.streak - 1) % 7 };
  return { claimed: false, idx: (d.last === yesterdayStr() ? d.streak : 0) % 7 };
}
function dstr(dt) { return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
const todayStr = () => dstr(new Date()), yesterdayStr = () => dstr(new Date(Date.now() - 864e5));

/* ---------- game start / resume ---------- */
function newGame(o, resume) {
  closeModal(); Sfx.init(); Sfx.music(); G.id++;
  G.mode = o.mode; G.level = o.level || 2; G.human = o.human || 0; G.tc = TIMES.find(t => t.id === o.time) || TIMES[0];
  G.board = new E.Board(); G.startFen = E.START_FEN; G.moves = []; G.sans = []; G.over = false; G.busy = false; G.thinking = false; G.paused = false; G.sel = -1; G.targets = []; G.captured = [[], []]; G.lastMove = null;
  G.hints = resume ? resume.hints : CFG.hintsPerGame; G.undos = resume ? resume.undos : CFG.undosPerGame;
  G.clocks = [G.tc.base, G.tc.base];
  if (resume) {
    G.clocks = resume.clocks;
    for (const m of resume.moves) { G.sans.push(G.board.san(m)); trackCapture(G.board, m); G.board.make(m); G.moves.push(m); }
    G.lastMove = G.moves.length ? [G.moves[G.moves.length - 1] & 63, (G.moves[G.moves.length - 1] >> 6) & 63] : null;
  }
  G.legal = G.board.legal();
  scene.setMenuSpin(false); scene.loadPosition(G.board.b); viewIdx = G.mode === 'ai' && G.human ? 1 : 0;
  if (G.lastMove) scene.markLast(...G.lastMove);
  const st = G.board.status(); if (st.check) scene.markCheck(G.board.kingSq[G.board.turn]);
  $('#home').classList.add('hidden'); $('#hud').classList.remove('hidden');
  const view = G.mode === 'ai' ? (G.human ? 'black' : 'white') : (G.board.turn ? 'black' : 'white');
  scene.resetCamera(G.mode === 'pvp' && !Save.d.autoRotate ? 'white' : view, !!resume ? false : false);
  setupBars(); updateHud(); startClock(); saveGame();
  if (G.mode === 'ai' && G.board.turn !== G.human) aiMove();
}
function trackCapture(b, m) {
  const flag = (m >> 16) & 15, to = (m >> 6) & 63, us = b.turn;
  if (flag & E.F_CAP) { const v = (flag & E.F_EP) ? E.P : (b.b[to] & 7); G.captured[us].push(TCH[v]); }
}
function setupBars() {
  if (G.mode === 'puzzle') {
    const pz = PUZ[G.puz.i]; G.bottomColor = G.human;
    $('#nameTop').textContent = `🧩 Puzzle ${pz.id}${G.puz.daily ? ' · Daily' : ''}`; $('#avTop').textContent = '🧩';
    $('#nameBot').textContent = `${G.human ? 'Black' : 'White'} to play · Mate in ${pz.n}`; $('#avBot').textContent = G.human ? '♚\uFE0E' : '♔\uFE0E';
    $('#btnHint').classList.remove('hidden'); $('#btnUndo').classList.add('hidden'); return;
  }
  $('#btnUndo').classList.remove('hidden');
  const ai = G.mode === 'ai', L = E.LEVELS[G.level];
  const bottomColor = ai ? G.human : 0, topColor = bottomColor ^ 1;
  G.bottomColor = bottomColor;
  $('#nameBot').textContent = ai ? 'You' : (bottomColor ? 'Black' : 'White') + ' · Player ' + (bottomColor + 1);
  $('#nameTop').textContent = ai ? `Computer · ${L.name}` : (topColor ? 'Black' : 'White') + ' · Player ' + (topColor + 1);
  $('#avBot').textContent = bottomColor ? '♚︎' : '♔︎'; $('#avTop').textContent = ai ? '🤖' : (topColor ? '♚︎' : '♔︎');
  $('#btnHint').classList.toggle('hidden', !ai); $('#btnUndo').classList.toggle('hidden', false);
}
function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function updateHud() {
  const b = G.board; if (!b) return;
  const bot = G.bottomColor, top = bot ^ 1;
  $('#capBot').textContent = G.captured[bot].map(glyph).join(''); $('#capTop').textContent = G.captured[top].map(glyph).join('');
  $('#barBot').classList.toggle('active', !G.over && b.turn === bot); $('#barTop').classList.toggle('active', !G.over && b.turn === top);
  if (G.tc.base) { $('#clockBot').textContent = fmt(G.clocks[bot]); $('#clockTop').textContent = fmt(G.clocks[top]); $('#clockBot').classList.toggle('low', G.clocks[bot] < 20); $('#clockTop').classList.toggle('low', G.clocks[top] < 20); }
  else { $('#clockBot').textContent = ''; $('#clockTop').textContent = ''; }
  const strip = $('#moves'); const n = G.sans.length, out = [];
  for (let i = Math.max(0, n - 6); i < n; i++) out.push(`<span class="${i === n - 1 ? 'last' : ''}">${(i % 2 === 0 ? (i / 2 + 1) + '. ' : '')}${G.sans[i]}</span>`);
  strip.innerHTML = out.reverse().join('');
  $('#nUndo').textContent = G.undos; $('#nHint').textContent = G.hints;
  $('#think').classList.toggle('hidden', !G.thinking);
  $('#btnUndo').disabled = G.moves.length === 0 || G.busy || G.thinking || G.over;
  $('#btnHint').disabled = G.busy || G.thinking || G.over || (G.mode === 'ai' && G.board.turn !== G.human);
}
function startClock() {
  clearInterval(G.tick); if (!G.tc.base) return; let last = performance.now();
  G.tick = setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1000; last = now;
    if (G.over || G.paused || G.moves.length < 1 || G.busy && false) return;
    const c = G.board.turn; G.clocks[c] -= dt; updateClocksOnly();
    if (G.clocks[c] <= 0) { G.clocks[c] = 0; updateClocksOnly(); endGame({ result: c ? '1-0' : '0-1', reason: 'time' }); }
  }, 250);
}
function updateClocksOnly() { const bot = G.bottomColor, top = bot ^ 1; $('#clockBot').textContent = fmt(G.clocks[bot]); $('#clockTop').textContent = fmt(G.clocks[top]); $('#clockBot').classList.toggle('low', G.clocks[bot] < 20); $('#clockTop').classList.toggle('low', G.clocks[top] < 20); }
function saveGame() {
  if (G.mode === 'puzzle') return;
  if (G.over || !G.mode) { Save.d.game = null; } else Save.d.game = { mode: G.mode, level: G.level, human: G.human, time: G.tc.id, moves: G.moves.slice(), clocks: G.clocks.slice(), hints: G.hints, undos: G.undos };
  Save.save();
}

/* ---------- input ---------- */
scene.onPick = sq => {
  Sfx.init(); Sfx.music();
  if (!G.mode || G.over || G.busy || G.thinking || G.paused || sq < 0) return;
  if (G.mode === 'ai' && G.board.turn !== G.human) return;
  const b = G.board, p = b.b[sq];
  if (G.sel >= 0 && G.targets.some(t => t.sq === sq)) { tryMove(G.sel, sq); return; }
  if (p && (p >> 3) === b.turn) selectSq(sq); else if (G.sel >= 0) { G.sel = -1; G.targets = []; scene.deselect(); }
};
function selectSq(sq) {
  const mv = G.legal.filter(m => (m & 63) === sq), seen = new Map();
  for (const m of mv) { const to = (m >> 6) & 63; seen.set(to, seen.get(to) || !!((m >> 16) & E.F_CAP)); }
  G.sel = sq; G.targets = [...seen].map(([s, c]) => ({ sq: s, capture: c }));
  Sfx.select(); Sfx.buzz(8);
  scene.select(sq, Save.d.legal ? G.targets : []);
  if (!mv.length) { toast('No legal moves for this piece'); }
}
function tryMove(from, to) {
  const mv = G.legal.filter(m => (m & 63) === from && ((m >> 6) & 63) === to);
  if (!mv.length) return;
  if (G.mode === 'puzzle' && mv.length === 1 && !puzzleAccept(mv[0])) return puzzleWrong();
  if (mv.length > 1) { // promotion
    const color = G.board.turn;
    modal(`<h2>Promote</h2><p>Choose your new piece</p><div class="promo">${['q', 'r', 'b', 'n'].map(t => `<button data-act="promo" data-a="${t}">${glyph(t)}<small>${NAMES[Save.d.set][t]}</small></button>`).join('')}</div>`);
    G._promo = mv; return;
  }
  commit(mv[0]);
}
const ACT = {};
ACT.promo = t => { const code = 'pnbrqk'.indexOf(t) + 1; const m = G._promo.find(x => ((x >> 12) & 7) === code); closeModal(); G._promo = null; if (m) { if (G.mode === 'puzzle' && !puzzleAccept(m)) return puzzleWrong(); commit(m); } };

/* ---------- making moves ---------- */
async function commit(m) {
  const b = G.board, gid = G.id; G.busy = true; G.sel = -1; G.targets = []; scene.deselect(false);
  const from = m & 63, to = (m >> 6) & 63, flag = (m >> 16) & 15, promo = (m >> 12) & 7, us = b.turn;
  const san = b.san(m, G.legal); let capture = null, castle = null;
  if (flag & E.F_CAP) capture = { sq: (flag & E.F_EP) ? (us ? to + 8 : to - 8) : to };
  if (flag & E.F_CASTLE) castle = { from: to > from ? from + 3 : from - 4, to: to > from ? from + 1 : from - 1 };
  trackCapture(b, m); b.make(m); G.moves.push(m); G.sans.push(san); G.lastMove = [from, to];
  if (G.tc.inc) G.clocks[us] += G.tc.inc;
  updateHud();
  await scene.animateMove({ from, to, capture, castle, promo: promo ? 'pnbrqk'[promo - 1] : null });
  if (gid !== G.id) return;
  scene.markLast(from, to);
  const st = b.status(); G.legal = b.legal(); G.busy = false;
  if (st.check) scene.markCheck(b.kingSq[b.turn]);
  if (G.mode === 'puzzle') { await puzzleAfter(st, us, gid); return; }
  if (st.over) { await endGame(st); return; }
  if (st.check) { Sfx.check(); Sfx.buzz(40); toast('Check!', 1300); }
  saveGame(); updateHud();
  if (G.mode === 'pvp' && Save.d.autoRotate) scene.resetCamera(b.turn ? 'black' : 'white');
  if (G.mode === 'ai' && b.turn !== G.human) aiMove();
}
async function aiMove() {
  const gid = G.id; G.thinking = true; updateHud(); const t0 = performance.now();
  const res = await askAI({ level: G.level });
  await sleep(Math.max(0, 700 + Math.random() * 700 - (performance.now() - t0)));
  if (gid !== G.id || G.over) return;
  G.thinking = false;
  let m = res.move; if (!m || !G.legal.includes(m)) m = G.legal[Math.floor(Math.random() * G.legal.length)];
  commit(m);
}

/* ---------- undo / hint / view / menu ---------- */
async function doUndo() {
  if (G.busy || G.thinking || G.over || !G.moves.length) return;
  if (G.undos <= 0) { offer('undo'); return; }
  const n = G.mode === 'ai' ? (G.board.turn === G.human ? Math.min(2, G.moves.length) : 1) : 1;
  for (let i = 0; i < n; i++) { G.board.unmake(); G.moves.pop(); G.sans.pop(); }
  G.undos--; G.captured = [[], []]; const b = new E.Board(G.startFen); for (const m of G.moves) { trackCapture(b, m); b.make(m); }
  G.legal = G.board.legal(); G.sel = -1; G.targets = []; scene.loadPosition(G.board.b);
  const lm = G.moves[G.moves.length - 1]; G.lastMove = lm ? [lm & 63, (lm >> 6) & 63] : null; if (lm) scene.markLast(...G.lastMove);
  if (G.board.inCheck()) scene.markCheck(G.board.kingSq[G.board.turn]);
  Sfx.place(); saveGame(); updateHud();
  if (G.mode === 'ai' && G.board.turn !== G.human) aiMove();
  else if (G.mode === 'pvp' && Save.d.autoRotate) scene.resetCamera(G.board.turn ? 'black' : 'white');
}
async function doHint() {
  if (G.busy || G.thinking || G.over) return;
  if (G.mode === 'puzzle') {
    const p = G.puz, rem = p.n - p.step; if (p.hints >= 1 && !(await Ads.rewarded())) return; p.hints++;
    const m = p.step === 0 ? G.board.parseUci(PUZ[p.i].m1, G.legal) : forcedMates(G.board, rem)[0];
    if (m) { scene.showHint(m & 63, (m >> 6) & 63); toast('Move the highlighted piece', 2400); Sfx.select(); } return;
  }
  if (G.hints <= 0) { offer('hint'); return; }
  G.hints--; updateHud(); G.thinking = true; $('#think').classList.remove('hidden'); const gid = G.id;
  const res = await askAI({ hint: true }); if (gid !== G.id) return; G.thinking = false; updateHud();
  if (res.move) { scene.showHint(res.move & 63, (res.move >> 6) & 63); toast('Try ' + G.board.san(res.move, G.legal), 2600); Sfx.select(); saveGame(); }
}
function offer(kind) {
  const nm = kind === 'hint' ? 'Hints' : 'Undos';
  modal(`<h2>Out of ${nm.toLowerCase()}</h2><p>Watch a short video to get 3 more ${nm.toLowerCase()} for this game.</p><div class="col"><button class="btn ad" data-act="offerAd" data-a="${kind}">▶ Watch ad · +3 ${nm}</button><button class="btn ghost" data-act="close">No thanks</button></div>`);
}
ACT.offerAd = async kind => { if (await Ads.rewarded()) { if (kind === 'hint') G.hints += 3; else G.undos += 3; closeModal(); updateHud(); saveGame(); toast('+3 ' + (kind === 'hint' ? 'hints' : 'undos')); } };
ACT.close = () => closeModal();
let viewIdx = 0;
const VIEWS = [['white', 'White view'], ['black', 'Black view'], ['top', 'Top-down view'], ['side', 'Side view']];
function cycleView() { viewIdx = (viewIdx + 1) % VIEWS.length; scene.resetCamera(VIEWS[viewIdx][0]); toast(VIEWS[viewIdx][1]); }
$('#btnUndo').onclick = () => { Sfx.click(); doUndo(); };
$('#btnHint').onclick = () => { Sfx.click(); doHint(); };
$('#btnView').onclick = () => { Sfx.click(); cycleView(); };
$('#btnMenu').onclick = () => { Sfx.click(); showPause(); };
function showPause() {
  if (!G.mode) return;
  modal(`<h2>Paused</h2><div class="col"><button class="btn gold" data-act="close">Resume</button><button class="btn dark" data-act="moveList">Move list</button><button class="btn dark" data-act="settings">Settings</button>
    ${G.mode === 'puzzle' ? '<button class="btn dark" data-act="restartPuzzle">Restart puzzle</button>' : G.over ? '' : '<button class="btn dark" data-act="resign">Resign</button>'}<button class="btn ghost" data-act="home">${G.mode === 'puzzle' ? 'Exit to menu' : 'Save &amp; exit to menu'}</button></div>`);
  $('#card').dataset.dismiss = '1';
}
ACT.moveList = () => {
  let rows = ''; for (let i = 0; i < G.sans.length; i += 2) rows += `<span class="n">${i / 2 + 1}.</span><span>${G.sans[i]}</span><span>${G.sans[i + 1] || ''}</span>`;
  modal(`<h2>Moves</h2><div class="movelist">${rows || '<span></span><span>No moves yet</span>'}</div><div class="col"><button class="btn ghost" data-act="close">Close</button></div>`);
};
ACT.home = () => { saveGame(); showHome(); };
ACT.resign = () => modal(`<h2>Resign?</h2><p>This counts as a loss.</p><div class="col"><button class="btn dark" data-act="resignYes">Yes, resign</button><button class="btn gold" data-act="close">Keep playing</button></div>`);
ACT.resignYes = () => { closeModal(); const loser = G.mode === 'ai' ? G.human : G.board.turn; endGame({ result: loser ? '1-0' : '0-1', reason: 'resignation' }); };

/* ---------- game over ---------- */
async function endGame(st) {
  if (G.over) return; G.over = true; G.busy = false; G.thinking = false; clearInterval(G.tick); updateHud();
  const ai = G.mode === 'ai', white = st.result === '1-0', black = st.result === '0-1';
  const outcome = st.result === '1/2-1/2' ? 'draw' : ((white && G.human === 0) || (black && G.human === 1)) ? (ai ? 'win' : 'win') : 'loss';
  let coins = 0, dr = 0, title = '', sub = '';
  const reason = st.reason[0].toUpperCase() + st.reason.slice(1);
  if (!ai) { title = st.result === '1/2-1/2' ? 'Draw' : (white ? 'White wins!' : 'Black wins!'); sub = reason; Sfx[st.result === '1/2-1/2' ? 'draw' : 'win'](); }
  else {
    const d = Save.d, L = E.LEVELS[G.level], score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0, exp = 1 / (1 + Math.pow(10, (L.elo - d.rating) / 400));
    dr = Math.round(32 * (score - exp)); d.rating = Math.max(100, d.rating + dr); d.stats.games++;
    if (outcome === 'win') { d.stats.wins++; coins = 30 + G.level * 15; d.stats.best = Math.max(d.stats.best, L.elo); } else if (outcome === 'draw') { d.stats.draws++; coins = 20; } else { d.stats.losses++; coins = 10; }
    d.coins += coins; d.gamesPlayed++;
    title = outcome === 'win' ? 'Victory!' : outcome === 'draw' ? 'Draw' : 'Defeat'; sub = reason; Sfx[outcome === 'win' ? 'win' : outcome === 'draw' ? 'draw' : 'lose']();
  }
  Save.d.game = null; Save.save();
  if (st.reason === 'checkmate') { const lk = G.board.kingSq[G.board.turn]; scene.kingFall(lk); }
  await sleep(st.reason === 'checkmate' ? 1500 : 700);
  G.lastOutcome = { coins, ai };
  modal(`<h2>${title}</h2><p>${sub}${ai ? ` · vs ${E.LEVELS[G.level].name}` : ''}</p>
    ${ai ? `<div class="stat"><span>Rating</span><span>${Save.d.rating} (${dr >= 0 ? '+' : ''}${dr})</span></div><div class="stat"><span>Coins earned</span><span>+${coins} 🪙</span></div>` : ''}
    <div class="col"><button class="btn gold" data-act="rematch">Rematch</button>
    ${coins ? `<button class="btn ad" data-act="doubleCoins" id="dblBtn">▶ Double coins (+${coins})</button>` : ''}
    <div class="row"><button class="btn dark" data-act="viewBoard">View board</button><button class="btn dark" data-act="newSetup">New game</button></div>
    <button class="btn ghost" data-act="homeAfter">Home</button></div>`);
  $('#card').dataset.dismiss = '0';
}
ACT.rematch = async () => { const o = { mode: G.mode, level: G.level, human: G.mode === 'ai' ? G.human ^ 1 : 0, time: G.tc.id }; await Ads.interstitial(); newGame(o); };
ACT.doubleCoins = async (a, b) => { b.disabled = true; if (await Ads.rewarded()) { Save.d.coins += G.lastOutcome.coins; Save.save(); toast(`+${G.lastOutcome.coins} 🪙 bonus!`); Sfx.coin(); b.textContent = 'Doubled ✓'; } else b.disabled = false; };
ACT.viewBoard = () => { closeModal(); G.paused = false; toast('Tap Menu to continue'); };
ACT.newSetup = async () => { await Ads.interstitial(); closeModal(); showHome(); showSetup(G.mode); };
ACT.homeAfter = async () => { await Ads.interstitial(); showHome(); };

/* ---------- setup ---------- */
const setup = { mode: 'ai', level: 2, color: 'white', time: 'none' };
function showSetup(mode) {
  const ls = Save.d.lastSetup; setup.mode = mode; setup.level = ls.level; setup.color = ls.color; setup.time = ls.time;
  renderSetup();
}
function renderSetup() {
  const opt = (g, v, label, small) => `<button class="opt ${setup[g] === v ? 'on' : ''}" data-act="set" data-a="${g}:${v}">${label}${small ? `<small>${small}</small>` : ''}</button>`;
  const ai = setup.mode === 'ai';
  modal(`<h2>${ai ? 'Play vs Computer' : 'Pass & Play'}</h2>
   ${ai ? `<h3>Opponent</h3><div class="lvl">${Object.entries(E.LEVELS).map(([k, L]) => opt('level', +k, L.name, '★'.repeat(Math.ceil(k / 1.2)))).join('')}</div>
   <h3>Your colour</h3><div class="chips">${opt('color', 'white', '♔ White')}${opt('color', 'random', '🎲 Random')}${opt('color', 'black', '♚ Black')}</div>` : '<p>Two players, one phone. The board turns to face whoever is to move.</p>'}
   <h3>Clock</h3><div class="chips">${TIMES.map(t => opt('time', t.id, t.name)).join('')}</div>
   <div class="col"><button class="btn gold" data-act="start">Start game</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
  $('#card').dataset.dismiss = '1';
}
ACT.set = a => { const [g, v] = a.split(':'); setup[g] = g === 'level' ? +v : v; renderSetup(); };
ACT.start = async () => {
  Save.d.lastSetup = { level: setup.level, color: setup.color, time: setup.time }; Save.save();
  const human = setup.color === 'black' ? 1 : setup.color === 'random' ? (Math.random() < 0.5 ? 0 : 1) : 0;
  newGame({ mode: setup.mode, level: setup.level, human: setup.mode === 'ai' ? human : 0, time: setup.time });
};
$('#btnAI').onclick = () => { Sfx.init(); Sfx.click(); showSetup('ai'); };
$('#btnPvP').onclick = () => { Sfx.init(); Sfx.click(); showSetup('pvp'); };
$('#btnContinue').onclick = () => { Sfx.init(); Sfx.click(); const g = Save.d.game; if (g) newGame({ mode: g.mode, level: g.level, human: g.human, time: g.time }, g); };

/* ---------- daily / shop / settings / stats / help ---------- */
function showDaily() {
  const st = dailyState();
  modal(`<h2>Daily Reward</h2><p>Come back every day – day 7 is the big one!</p><div class="days">${CFG.daily.map((c, i) => `<div class="day ${i === st.idx && !st.claimed ? 'cur' : ''} ${(i < st.idx || (st.claimed && i <= st.idx)) ? 'done' : ''}">Day ${i + 1}<i>${i === 6 ? '🎁' : '🪙'}</i>${c}</div>`).join('')}</div>
   <div class="col">${st.claimed ? '<button class="btn" disabled>Claimed ✓ – see you tomorrow</button>' : `<button class="btn gold" data-act="claim">Claim ${CFG.daily[st.idx]} 🪙</button><button class="btn ad" data-act="claim" data-a="x2">▶ Claim 2×</button>`}<button class="btn ghost" data-act="close">Close</button></div>`);
  $('#card').dataset.dismiss = '1';
}
ACT.claim = async a => {
  const st = dailyState(); if (st.claimed) return; const d = Save.d.daily;
  if (a === 'x2' && !(await Ads.rewarded())) return;
  d.streak = (d.last === yesterdayStr() ? d.streak : 0) + 1; d.last = todayStr();
  Save.d.coins += CFG.daily[st.idx] * (a === 'x2' ? 2 : 1); Save.save(); Sfx.coin(); showHome(); showDaily();
};
$('#btnGift').onclick = () => { Sfx.init(); Sfx.click(); showDaily(); };
function showShop() {
  const d = Save.d, I = CFG.iap, ad = d.adCoins.date === todayStr() ? d.adCoins.n : 0;
  const row = (kind, key, info, owned, cur, sw) => `<div class="item"><div class="sw" style="background:${sw}"></div><div class="grow">${info.name}<small>${owned ? 'Unlocked' : info.cost + ' coins'}</small></div><button class="btn ${cur ? 'ghost' : owned ? 'gold' : ''}" data-act="${kind}" data-a="${key}">${cur ? 'Equipped' : owned ? 'Equip' : '🪙 ' + info.cost}</button></div>`;
  const bsw = { wood: 'linear-gradient(135deg,#eed3a4 50%,#7c4a2a 50%)', marble: 'linear-gradient(135deg,#eeeae3 50%,#2a2a2e 50%)', emerald: 'linear-gradient(135deg,#e8dfc2 50%,#2f6e52 50%)', sapphire: 'linear-gradient(135deg,#c9d7ec 50%,#27487d 50%)' };
  const psw = { ivory: 'linear-gradient(135deg,#d8c7a1 50%,#23201f 50%)', rosewood: 'linear-gradient(135deg,#e6c99a 50%,#5a2a20 50%)', gold: 'linear-gradient(135deg,#dfe3ea 50%,#d0a233 50%)' };
  modal(`<h2>Shop</h2><p>🪙 ${d.coins} coins</p><div class="list">
   <div class="item"><div class="grow">▶ Free coins<small>${5 - ad} left today · +60 each</small></div><button class="btn ad" data-act="freeCoins">Watch</button></div>
   ${d.noAds ? '' : `<div class="item"><div class="grow">🚫 ${I.remove_ads.name}<small>${I.remove_ads.desc}</small></div><button class="btn gold" data-act="buy" data-a="remove_ads">${I.remove_ads.price}</button></div>`}
   ${['coins_500', 'coins_1500', 'coins_4000'].map(k => `<div class="item"><div class="grow">🪙 ${I[k].name}</div><button class="btn gold" data-act="buy" data-a="${k}">${I[k].price}</button></div>`).join('')}
   </div><h3>Boards</h3><div class="list">${Object.entries(BOARDS).map(([k, v]) => row('board', k, v, d.boards.includes(k), d.board === k, bsw[k])).join('')}</div>
   <h3>Piece colours</h3><div class="list">${Object.entries(PIECE_COLORS).map(([k, v]) => row('pcolor', k, v, d.pcolors.includes(k), d.pcolor === k, psw[k])).join('')}</div>
   <div class="col"><button class="btn ghost" data-act="close">Close</button></div>`);
  $('#card').dataset.dismiss = '1';
}
ACT.board = k => { if (!Save.d.boards.includes(k)) { if (Save.d.coins < BOARDS[k].cost) return toast('Not enough coins'); Save.d.coins -= BOARDS[k].cost; Save.d.boards.push(k); Sfx.coin(); } Save.d.board = k; Save.save(); applyStyle(); showShop(); };
ACT.pcolor = k => { if (!Save.d.pcolors.includes(k)) { if (Save.d.coins < PIECE_COLORS[k].cost) return toast('Not enough coins'); Save.d.coins -= PIECE_COLORS[k].cost; Save.d.pcolors.push(k); Sfx.coin(); } Save.d.pcolor = k; Save.save(); applyStyle(); showShop(); };
ACT.freeCoins = async () => { const a = Save.d.adCoins, t = todayStr(); if (a.date !== t) { a.date = t; a.n = 0; } if (a.n >= 5) return toast('Come back tomorrow!'); if (await Ads.rewarded()) { a.n++; Save.d.coins += 60; Save.save(); toast('+60 🪙'); Sfx.coin(); showShop(); } };
ACT.buy = async id => { if (await IAP.buy(id)) { const p = CFG.iap[id]; if (id === 'remove_ads') Save.d.noAds = true; else Save.d.coins += p.coins; Save.save(); toast('Thank you! 💖'); Sfx.coin(); showShop(); } };
$('#btnShop').onclick = () => { Sfx.init(); Sfx.click(); showShop(); };
$('#homeCoins').onclick = () => { showShop(); };
function showSettings() {
  const d = Save.d, sw = (k, label) => `<div class="switch"><div class="grow">${label}</div><button class="btn ${d[k] ? 'gold' : 'ghost'}" data-act="tog" data-a="${k}">${d[k] ? 'ON' : 'OFF'}</button></div>`;
  const opts = (k, vals) => vals.map(([v, l]) => `<button class="opt ${d[k] === v ? 'on' : ''}" data-act="pick" data-a="${k}:${v}">${l}</button>`).join('');
  modal(`<h2>Settings</h2><div class="list">${sw('sound', 'Sound effects')}${sw('music', 'Music')}${sw('vib', 'Vibration')}${sw('legal', 'Show legal moves')}${sw('cinema', 'Cinematic move camera')}${sw('autoRotate', 'Auto-turn board (Pass &amp; Play)')}</div>
   <h3>Piece style</h3><div class="chips">${opts('set', [['royal', '🐴 Royal Animals'], ['staunton', '♞ Classic']])}</div>
   <h3>Graphics</h3><div class="chips">${opts('quality', [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']])}</div>
   <h3>Animation speed</h3><div class="chips">${opts('speed', [[0.7, 'Slow'], [1, 'Normal'], [1.6, 'Fast']])}</div>
   <div class="col"><button class="btn dark" data-act="restore">Restore purchases</button><button class="btn gold" data-act="close">Done</button></div>`);
  $('#card').dataset.dismiss = '1';
}
ACT.settings = () => showSettings();
ACT.tog = k => { Save.d[k] = !Save.d[k]; Save.save(); if (k === 'cinema') applyStyle(); if (k === 'music') Sfx.music(Save.d.music); if (k === 'sound' && !Save.d.sound) Sfx.music(false); showSettings(); };
ACT.pick = a => { const [k, v] = a.split(':'); Save.d[k] = k === 'speed' ? +v : v; Save.save(); applyStyle(); if (G.board && G.mode && k === 'set') { updateHud(); } showSettings(); };
ACT.restore = () => toast('Purchases restored (if any)');
$('#btnSettings').onclick = () => { Sfx.init(); Sfx.click(); showSettings(); };
$('#btnStats').onclick = () => { Sfx.click(); const s = Save.d.stats;
  modal(`<h2>Your Stats</h2><div class="stat"><span>Rating</span><span>${Save.d.rating}</span></div><div class="stat"><span>Games vs computer</span><span>${s.games}</span></div><div class="stat"><span>Wins</span><span>${s.wins}</span></div><div class="stat"><span>Draws</span><span>${s.draws}</span></div><div class="stat"><span>Losses</span><span>${s.losses}</span></div><div class="stat"><span>Strongest opponent beaten</span><span>${s.best || '—'}</span></div><div class="col"><button class="btn gold" data-act="close">Close</button></div>`); $('#card').dataset.dismiss = '1'; };
$('#btnHow').onclick = () => { Sfx.click();
  modal(`<h2>How to play</h2><p style="text-align:left">Tap a piece, then tap a highlighted square. Drag to rotate the board, pinch to zoom.<br><br>🐴 <b>Horse</b> (knight) leaps in an L.<br>🐘 <b>Elephant</b> (rook) marches in straight lines.<br>🐪 <b>Camel</b> (bishop) crosses diagonally.<br>♛ <b>Queen</b> glides anywhere · ♚ <b>King</b> steps one square · ♟ <b>Soldier</b> (pawn) marches forward, captures diagonally, promotes on the far rank.<br><br>Switch to <b>Classic</b> pieces anytime in Settings.</p><div class="col"><button class="btn gold" data-act="close">Got it</button></div>`); $('#card').dataset.dismiss = '1'; };

/* ---------- puzzle flow ---------- */
function puzzleAccept(m) {
  const p = G.puz, b = G.board, rem = p.n - p.step;
  if (rem === 1) { b.make(m); const mate = b.inCheck() && b.legal().length === 0; b.unmake(); return mate; }
  if (p.step === 0) return b.uci(m) === PUZ[p.i].m1;
  return forcedMates(b, rem).includes(m);
}
function puzzleWrong() {
  const p = G.puz; p.tries++; Sfx.bad(); Sfx.buzz(60); G.sel = -1; G.targets = []; scene.deselect();
  toast(p.tries >= 3 ? 'Stuck? Tap the 💡 hint' : 'Not the forced mate – try again!', 1800);
}
async function puzzleAfter(st, mover, gid) {
  const p = G.puz; if (gid !== G.id) return;
  if (st.over) { if (st.reason === 'checkmate') return puzzleSolved(); G.over = true; toast('Hmm, that wasn\'t it'); return; }
  if (mover === G.human) {                      // opponent defends with the stubbornest reply
    p.step++; G.thinking = true; updateHud(); await sleep(650); if (gid !== G.id) return; G.thinking = false;
    const b = G.board, rem = p.n - p.step, reps = b.legal(); let best = reps[0], bestN = 1e9;
    for (const r of reps) { b.make(r); const n = forcedMates(b, rem).length; b.unmake(); if (n >= 1 && (n < bestN || (n === bestN && Math.random() < 0.4))) { bestN = n; best = r; } }
    commit(best);
  } else { updateHud(); }
}
async function puzzleSolved() {
  const p = G.puz, pz = PUZ[p.i], d = Save.d, pr = d.puzzle; G.over = true; updateHud();
  const first = !pr.solved[pz.id]; pr.solved[pz.id] = 1; pr.next = Math.max(pr.next, p.i + 1);
  let coins = first ? [0, 15, 25, 40][pz.n] : 5; if (p.daily && pr.daily !== todayStr()) { pr.daily = todayStr(); coins += 40; }
  if (p.tries === 0 && first) coins += 10;
  d.coins += coins; Save.save(); Sfx.win(); Sfx.buzz(50);
  scene.kingFall(G.board.kingSq[G.board.turn]); await sleep(1400);
  const hasNext = p.i + 1 < PUZ.length && !p.daily;
  modal(`<h2>Puzzle solved!</h2><p>Checkmate in ${pz.n}${p.tries === 0 ? ' · first try ⭐' : ''}</p><div class="stat"><span>Coins</span><span>+${coins} 🪙</span></div>
    <div class="col">${hasNext ? '<button class="btn gold" data-act="nextPuzzle">Next puzzle ▶</button>' : ''}<button class="btn ${hasNext ? 'dark' : 'gold'}" data-act="puzzleMenu">All puzzles</button><button class="btn ghost" data-act="homeAfterPuz">Home</button></div>`);
  $('#card').dataset.dismiss = '0';
}
async function startPuzzle(idx, daily) {
  await loadPuzzles(); const pz = PUZ[idx]; if (!pz) return toast('Puzzles not available');
  closeModal(); Sfx.init(); Sfx.music(); G.id++; clearInterval(G.tick);
  G.mode = 'puzzle'; G.puz = { i: idx, n: pz.n, step: 0, tries: 0, hints: 0, daily: !!daily };
  G.board = new E.Board(pz.fen); G.startFen = pz.fen; G.human = G.board.turn; G.tc = TIMES[0]; G.moves = []; G.sans = []; G.over = false; G.busy = false; G.thinking = false; G.paused = false;
  G.sel = -1; G.targets = []; G.captured = [[], []]; G.lastMove = null; G.hints = 1; G.undos = 0; G.legal = G.board.legal();
  scene.setMenuSpin(false); scene.loadPosition(G.board.b); scene.clearMarks(); if (G.board.inCheck()) scene.markCheck(G.board.kingSq[G.board.turn]);
  $('#home').classList.add('hidden'); $('#hud').classList.remove('hidden'); viewIdx = G.human ? 1 : 0; scene.resetCamera(G.human ? 'black' : 'white');
  setupBars(); updateHud(); $('#nHint').textContent = '💡';
  toast(`Mate in ${pz.n} · ${G.human ? 'Black' : 'White'} to move`, 2600);
}
async function showPuzzles() {
  await loadPuzzles(); const pr = Save.d.puzzle, n = PUZ.length, solved = Object.keys(pr.solved).length;
  const di = n ? dayHash() % n : 0, dDone = pr.daily === todayStr();
  const cells = PUZ.map((pz, i) => `<button class="pg ${pr.solved[pz.id] ? 'done' : i > pr.next ? 'lock' : ''}" data-act="${i > pr.next ? 'locked' : 'playPuzzle'}" data-a="${i}">${pz.id}<small>M${pz.n}</small></button>`).join('');
  modal(`<h2>Puzzles</h2><p>${solved} / ${n} solved · find the one forced checkmate</p>
    <div class="col" style="margin-top:6px"><button class="btn gold" data-act="playPuzzle" data-a="${Math.min(pr.next, n - 1)}">▶ Puzzle ${Math.min(pr.next, n - 1) + 1}${pr.next >= n ? ' (replay)' : ''}</button>
    <button class="btn ${dDone ? 'dark' : 'ad'}" data-act="dailyPuzzle">🗓 Daily puzzle ${dDone ? '✓ done' : '· +40 🪙'}</button></div>
    <h3>All puzzles</h3><div class="pgrid">${cells}</div><div class="col"><button class="btn ghost" data-act="close">Close</button></div>`);
  $('#card').dataset.dismiss = '1';
}
ACT.restartPuzzle = () => startPuzzle(G.puz.i, G.puz.daily);
ACT.puzzleMenu = () => showPuzzles(); ACT.locked = () => toast('Solve the earlier puzzles first');
ACT.playPuzzle = a => startPuzzle(+a, false);
ACT.dailyPuzzle = async () => { await loadPuzzles(); startPuzzle(dayHash() % PUZ.length, true); };
ACT.nextPuzzle = () => startPuzzle(G.puz.i + 1, false);
ACT.homeAfterPuz = () => showHome();
$('#btnPuz').onclick = () => { Sfx.init(); Sfx.click(); showPuzzles(); };

/* ---------- lifecycle ---------- */
function onBack(exit) {
  if (modalOpen()) { closeModal(); return; }
  if (G.mode) { showPause(); return; }
  exit();
}
function pauseNow() { Sfx.music(false); if (G.mode && !G.over && !modalOpen()) showPause(); }
nativeLifecycle(pauseNow, onBack);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseNow(); else Sfx.music(); });
if ('serviceWorker' in navigator && !Native && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

Ads.init();
setTimeout(() => {
  showHome(); $('#loading').classList.add('done'); setTimeout(() => $('#loading').remove(), 700);
  if (!dailyState().claimed && Save.d.gamesPlayed >= 1) setTimeout(showDaily, 600);
}, 400);
window.__play = u => { const m = G.board.parseUci(u, G.legal); if (m) commit(m); return !!m; };
window.__setFen = fen => { closeModal(); G.board.load(fen); G.startFen = fen; G.moves = []; G.sans = []; G.legal = G.board.legal(); G.over = false; G.busy = false; scene.loadPosition(G.board.b); updateHud(); };
window.__G = G; window.__scene = scene; window.__ACT = ACT; window.__E = E;
