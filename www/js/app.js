/* Royal Chess 3D – game controller, UI and meta-game. */
import { ChessScene } from './scene.js';
import { Sfx } from './audio.js';
import { Save } from './storage.js';
import { CFG, BOARDS, BGS, PIECE_COLORS, TIMES } from './config.js';
import { Ads, IAP, Native, bus, nativeLifecycle } from './ads.js';
import { getBackend, isConfigured, cleanCode, avatarFor, REEL_NAMES, REEL_AVATARS } from './online.js';

const E = window.ChessEngine;
const $ = (s, r) => (r || document).querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GL = {
  royal: { p: '♟︎', n: '🐴', b: '🐪', r: '🐘', q: '♛︎', k: '♚︎' },
  staunton: { p: '♟︎', n: '♞︎', b: '♝︎', r: '♜︎', q: '♛︎', k: '♚︎' }
};
const NAMES = { royal: { p: 'Soldier', n: 'Horse', b: 'Camel', r: 'Elephant', q: 'Queen', k: 'King' }, staunton: { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' } };
const TCH = ' pnbrqk';
const PINFO = {
  royal: { p: ['♟\uFE0E', 'Soldier (Pawn)', 'Steps forward 1 (2 from its start square) and captures diagonally.'], n: ['🐴', 'Horse (Knight)', 'Leaps in an L-shape and can jump over other pieces.'], b: ['🐪', 'Camel (Bishop)', 'Moves any distance diagonally.'], r: ['🐘', 'Elephant (Rook)', 'Marches any distance in a straight line.'], q: ['♛\uFE0E', 'Queen', 'Moves any distance in a straight line or diagonally – the strongest piece.'], k: ['♚\uFE0E', 'King', 'Steps one square in any direction. Keep it safe!'] },
  staunton: { p: ['♟\uFE0E', 'Pawn', 'Steps forward 1 (2 from its start square) and captures diagonally.'], n: ['♞\uFE0E', 'Knight', 'Jumps in an L-shape and can hop over other pieces.'], b: ['♝\uFE0E', 'Bishop', 'Moves any distance diagonally.'], r: ['♜\uFE0E', 'Rook', 'Moves any distance in a straight line.'], q: ['♛\uFE0E', 'Queen', 'Moves any distance in a straight line or diagonally – the strongest piece.'], k: ['♚\uFE0E', 'King', 'Steps one square in any direction. Keep it safe!'] }
};
let pinfoT;
function showPieceInfo(sq) {
  const pc = G.board.b[sq]; if (!pc) return hidePieceInfo(); const t = TCH[pc & 7], c = pc >> 3, [g, name, desc] = PINFO[Save.d.set][t];
  const el = $('#pinfo'); el.className = 'pinfo ' + (c ? 'b' : 'w'); el.innerHTML = `<div class="pg2">${g}</div><div><b>${name} · ${c ? 'Black' : 'White'}</b><span>${desc}</span></div>`;
  clearTimeout(pinfoT); pinfoT = setTimeout(hidePieceInfo, 4200);
}
function hidePieceInfo() { $('#pinfo').classList.add('hidden'); }
const glyph = t => GL[Save.d.set][t];

/* ---------- boot ---------- */
Save.load();
for (const [k, v] of Object.entries(BOARDS)) if (!v.cost && !Save.d.boards.includes(k)) Save.d.boards.push(k);
bus.toast = toast;
const styleOpts = () => ({ board: Save.d.board, pcolor: Save.d.pcolor, set: Save.d.set, quality: Save.d.quality, speed: Save.d.speed, cinema: Save.d.cinema, labels: Save.d.labels, bg: Save.d.bg, custom: Save.d.customBoard });
const scene = new ChessScene($('#c'), styleOpts());
const G = { mode: null, human: 0, level: 2, board: null, moves: [], sans: [], legal: [], over: false, busy: false, thinking: false, sel: -1, targets: [], clocks: [0, 0], tc: TIMES[0], hints: 0, undos: 0, paused: false, startFen: E.START_FEN, id: 0, tick: null, captured: [[], []], lastMove: null };

let busyN = 0, busyT;
/** push the saved look to the 3D scene. The menu updates at once; heavy textures build in slices and a small "Applying…" badge shows only if it takes a moment. */
function applyStyle() {
  syncQuick(); busyN++; clearTimeout(busyT); busyT = setTimeout(() => $('#busy').classList.add('show'), 150);
  return scene.setStyle(styleOpts()).catch(e => console.error(e)).finally(() => { if (--busyN <= 0) { busyN = 0; clearTimeout(busyT); $('#busy').classList.remove('show'); } });
}
syncQuick();
scene.onQuality = q => toast('Graphics set to ' + q + ' for smooth play', 2600);

function syncQuick() {
  const b = BOARDS[Save.d.board] || BOARDS.bw, c = Save.d.board === 'custom' ? Save.d.customBoard : b;
  $('#qBoard .qsw').style.background = `linear-gradient(135deg,${c.light} 50%,${c.dark} 50%)`; $('#qPieces .qg').textContent = Save.d.set === 'royal' ? '🐴' : '♞\uFE0E';
}
$('#qBoard').onclick = () => {
  Sfx.init(); Sfx.click(); const owned = Object.keys(BOARDS).filter(k => Save.d.boards.includes(k)), next = owned[(owned.indexOf(Save.d.board) + 1) % owned.length];
  Save.d.board = next; Save.save(); applyStyle(); syncQuick(); toast('Board: ' + BOARDS[next].name, 1500);
};
$('#qPieces').onclick = () => {
  Sfx.init(); Sfx.click(); Save.d.set = Save.d.set === 'royal' ? 'staunton' : 'royal'; Save.save(); applyStyle(); syncQuick(); if (G.board) updateHud();
  toast(Save.d.set === 'royal' ? 'Pieces: Royal Animals 🐴🐘🐪' : 'Pieces: Classic Staunton ♞♜♝', 1500);
};
let toastT;
function toast(msg, ms = 1900) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
function modal(html) { const c = $('#card'); c.className = 'card'; c.style.rotate = ''; c.innerHTML = html; c.dataset.dismiss = '0'; $('#modal').classList.remove('hidden'); G.paused = G.mode && G.mode !== 'online' && !G.over ? true : G.paused; }
/** full-height sheet (shop / settings): keeps the scroll position when it re-renders after a tap */
function sheet(html) {
  const c = $('#card'), was = c.classList.contains('sheet') && !$('#modal').classList.contains('hidden') ? ($('.sh-body', c) || {}).scrollTop || 0 : 0;
  modal(html); c.classList.add('sheet'); c.dataset.dismiss = '1'; const b = $('.sh-body', c); if (b) b.scrollTop = was;
}
function closeModal() { $('#modal').classList.add('hidden'); if (G.mode && !G.over) G.paused = false; }
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const modalOpen = () => !$('#modal').classList.contains('hidden');
$('#card').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; Sfx.click();
  const fn = ACT[b.dataset.act]; if (fn) fn(b.dataset.a, b);
});
$('#card').addEventListener('change', e => { if (e.target.dataset && e.target.dataset.nm !== undefined) return onlineRename(e.target.value); const k = e.target.dataset && e.target.dataset.cb; if (!k) return; Save.d.customBoard[k] = e.target.value; Save.d.board = 'custom'; Save.save(); applyStyle(); showSettings(); });
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
  onlineTeardown(); closeModal(); clearInterval(G.tick); G.mode = null; G.id++; G.thinking = false;
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
  scene.setMenuSpin(false); scene.loadPosition(G.board.b); viewIdx = (G.mode === 'ai' || G.mode === 'online') && G.human ? 1 : 0;
  if (G.lastMove) scene.markLast(...G.lastMove);
  const st = G.board.status(); if (st.check) scene.markCheck(G.board.kingSq[G.board.turn]);
  $('#home').classList.add('hidden'); $('#hud').classList.remove('hidden');
  const view = (G.mode === 'ai' || G.mode === 'online') ? (G.human ? 'black' : 'white') : (G.board.turn ? 'black' : 'white');
  scene.resetCamera(G.mode === 'pvp' && !Save.d.autoRotate ? 'white' : view, !!resume ? false : false);
  setupBars(); updateHud(); startClock(); saveGame();
  if (G.mode === 'ai' && G.board.turn !== G.human) aiMove();
}
function trackCapture(b, m) {
  const flag = (m >> 16) & 15, to = (m >> 6) & 63, us = b.turn;
  if (flag & E.F_CAP) { const v = (flag & E.F_EP) ? E.P : (b.b[to] & 7); G.captured[us].push(TCH[v]); }
}
function syncF2F() {
  const pvp = G.mode === 'pvp', f = pvp && !Save.d.autoRotate; $('#hud').classList.toggle('f2f', f);
  $('#btnTurn').classList.toggle('hidden', !pvp); $('#btnTurn i').textContent = f ? '🔒' : '🔄'; $('#btnTurn span').textContent = f ? 'Fixed' : 'Turning';
}
function setBoardMode(fixed) {
  Save.d.autoRotate = !fixed; Save.save(); syncF2F();
  if (G.mode === 'pvp' && G.board) scene.resetCamera(fixed ? 'white' : (G.board.turn ? 'black' : 'white'));
}
$('#btnTurn').onclick = () => { Sfx.click(); setBoardMode(Save.d.autoRotate); toast(Save.d.autoRotate ? '🔄 Board turns to the player to move' : '🔒 Board stays fixed – sit face to face', 2200); };
function setupBars() {
  syncF2F();
  const paintAv = (id, color, glyph) => { const e = $(id); e.className = 'avatar ' + (color ? 'avb' : 'avw'); e.textContent = glyph; };
  if (G.mode === 'puzzle') {
    const pz = PUZ[G.puz.i]; G.bottomColor = G.human;
    $('#nameTop').textContent = `🧩 Puzzle ${pz.id}${G.puz.daily ? ' · Daily' : ''}`; $('#avTop').className = 'avatar'; $('#avTop').textContent = '🧩';
    $('#nameBot').textContent = `You · ${G.human ? 'Black' : 'White'} · Mate in ${pz.n}`; paintAv('#avBot', G.human, G.human ? '♚\uFE0E' : '♔\uFE0E');
    $('#btnHint').classList.remove('hidden'); $('#btnUndo').classList.add('hidden'); return;
  }
  if (G.mode === 'online') {
    const o = ON.opp || { name: 'Opponent' }, me = G.human, tc = me ^ 1; G.bottomColor = me;
    $('#nameBot').textContent = `${ON.user ? ON.user.name : 'You'} · ${me ? 'Black' : 'White'}`; $('#nameTop').textContent = `${o.name} · ${tc ? 'Black' : 'White'}`;
    paintAv('#avBot', me, me ? '♚\uFE0E' : '♔\uFE0E'); paintAv('#avTop', tc, avatarFor(o.uid || o.name));
    $('#btnUndo').classList.add('hidden'); $('#btnHint').classList.add('hidden'); return;
  }
  $('#btnUndo').classList.remove('hidden');
  const ai = G.mode === 'ai', L = E.LEVELS[G.level];
  const bottomColor = ai ? G.human : 0, topColor = bottomColor ^ 1, cn = c => c ? 'Black' : 'White';
  G.bottomColor = bottomColor;
  $('#nameBot').textContent = ai ? `You · ${cn(bottomColor)}` : `Player ${bottomColor + 1} · ${cn(bottomColor)}`;
  $('#nameTop').textContent = ai ? `Computer (${L.name}) · ${cn(topColor)}` : `Player ${topColor + 1} · ${cn(topColor)}`;
  paintAv('#avBot', bottomColor, bottomColor ? '♚\uFE0E' : '♔\uFE0E'); paintAv('#avTop', topColor, ai ? '🤖' : (topColor ? '♚\uFE0E' : '♔\uFE0E'));
  $('#btnHint').classList.toggle('hidden', !ai);
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
  { const t = b.turn, wh = t === 0, chk = !G.over && b.inCheck(), el = $('#turn'); let txt;
    if (G.over) txt = 'Game over';
    else if (G.mode === 'puzzle') txt = `${wh ? 'White' : 'Black'} to play · Mate in ${G.puz.n - G.puz.step}`;
    else if (G.mode === 'online') txt = t === G.human ? `Your move · ${wh ? 'White' : 'Black'}` : `${(ON.opp && ON.opp.name) || 'Opponent'}'s move · ${wh ? 'White' : 'Black'}`;
    else if (G.mode === 'ai') txt = t === G.human ? `Your move · ${wh ? 'White' : 'Black'}` : `Computer's move · ${wh ? 'White' : 'Black'}`;
    else txt = `${wh ? 'White' : 'Black'}'s move`;
    el.className = 'turn ' + (wh ? 'w' : 'b') + (chk ? ' chk' : ''); el.textContent = (chk ? '⚠ CHECK · ' : '') + txt; }
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
  if (G.mode === 'puzzle' || G.mode === 'online') return;
  if (G.over || !G.mode) { Save.d.game = null; } else Save.d.game = { mode: G.mode, level: G.level, human: G.human, time: G.tc.id, moves: G.moves.slice(), clocks: G.clocks.slice(), hints: G.hints, undos: G.undos };
  Save.save();
}

/* ---------- input ---------- */
scene.onPick = sq => {
  Sfx.init(); Sfx.music();
  if (!G.mode || G.over || G.busy || G.thinking || G.paused || sq < 0) return;
  if ((G.mode === 'ai' || G.mode === 'online') && G.board.turn !== G.human) return;
  const b = G.board, p = b.b[sq];
  if (G.sel >= 0 && G.targets.some(t => t.sq === sq)) { tryMove(G.sel, sq); return; }
  if (p && (p >> 3) === b.turn) selectSq(sq); else if (G.sel >= 0) { G.sel = -1; G.targets = []; scene.deselect(); hidePieceInfo(); }
};
function selectSq(sq) {
  const mv = G.legal.filter(m => (m & 63) === sq), seen = new Map();
  for (const m of mv) { const to = (m >> 6) & 63; seen.set(to, seen.get(to) || !!((m >> 16) & E.F_CAP)); }
  G.sel = sq; G.targets = [...seen].map(([s, c]) => ({ sq: s, capture: c }));
  Sfx.select(); Sfx.buzz(8); showPieceInfo(sq);
  scene.select(sq, Save.d.legal ? G.targets : []);
  if (!mv.length) { toast('No legal moves for this piece'); }
}
function tryMove(from, to) {
  const mv = G.legal.filter(m => (m & 63) === from && ((m >> 6) & 63) === to);
  if (!mv.length) return;
  if (G.mode === 'puzzle' && mv.length === 1 && !puzzleAccept(mv[0])) return puzzleWrong();
  if (mv.length > 1) { promotionDialog(mv); return; }
  commit(mv[0]);
}
function promotionDialog(mv) {
  const color = G.board.turn, set = Save.d.set, nm = { q: 'Queen', r: set === 'royal' ? 'Elephant (Rook)' : 'Rook', b: set === 'royal' ? 'Camel (Bishop)' : 'Bishop', n: set === 'royal' ? 'Horse (Knight)' : 'Knight' };
  G._promo = mv;
  modal(`<h2>Pawn Promotion</h2><p>Your ${set === 'royal' ? 'soldier' : 'pawn'} reached the last rank!<br>Choose what it becomes:</p>
    <div class="promo2">${['q', 'r', 'b', 'n'].map(t => `<button class="pbtn ${color ? 'pb' : 'pw'}" data-act="promo" data-a="${t}"><span class="pgl">${glyph(t)}</span><b>${nm[t]}</b></button>`).join('')}</div>
    <div class="col"><button class="btn ghost" data-act="promoCancel">Cancel move</button></div>`);
  $('#card').dataset.dismiss = '0'; if (G.mode === 'pvp' && !Save.d.autoRotate && color) $('#card').style.rotate = '180deg';   // Black sits opposite: dialog faces them
}
const ACT = {};
ACT.promoCancel = () => { G._promo = null; closeModal(); toast('Move cancelled – choose another move'); };
ACT.promo = t => { if (!G._promo) return; const code = 'pnbrqk'.indexOf(t) + 1; const m = G._promo.find(x => ((x >> 12) & 7) === code); closeModal(); G._promo = null; if (m) { if (G.mode === 'puzzle' && !puzzleAccept(m)) return puzzleWrong(); commit(m); } };

/* ---------- making moves ---------- */
async function commit(m, remote) {
  const b = G.board, gid = G.id; const uciS = G.mode === 'online' && !remote ? b.uci(m) : null; G.busy = true; G.sel = -1; G.targets = []; scene.deselect(false); hidePieceInfo();
  const from = m & 63, to = (m >> 6) & 63, flag = (m >> 16) & 15, promo = (m >> 12) & 7, us = b.turn;
  const san = b.san(m, G.legal); let capture = null, castle = null;
  if (flag & E.F_CAP) capture = { sq: (flag & E.F_EP) ? (us ? to + 8 : to - 8) : to };
  if (flag & E.F_CASTLE) castle = { from: to > from ? from + 3 : from - 4, to: to > from ? from + 1 : from - 1 };
  trackCapture(b, m); b.make(m); G.moves.push(m); G.sans.push(san); G.lastMove = [from, to];
  if (G.tc.inc) G.clocks[us] += G.tc.inc;
  if (uciS) sendOnlineMove(uciS, G.moves.length - 1);
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
  if (G.mode === 'online') pumpOnline();
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
  if (G.mode === 'online') { modal(`<h2>Online game</h2><p>vs ${esc((ON.opp && ON.opp.name) || 'Opponent')} · room ${esc(ON.code || '')}</p><div class="col"><button class="btn gold" data-act="close">Resume</button><button class="btn dark" data-act="moveList">Move list</button><button class="btn dark" data-act="settings">Settings</button>${G.over ? '<button class="btn ghost" data-act="home">Home</button>' : '<button class="btn dark" data-act="resign">Resign &amp; leave</button>'}</div>`); $('#card').dataset.dismiss = '1'; return; }
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
ACT.resignYes = () => { closeModal(); const loser = (G.mode === 'ai' || G.mode === 'online') ? G.human : G.board.turn; endGame({ result: loser ? '1-0' : '0-1', reason: 'resignation' }); };

/* ---------- game over ---------- */
async function endGame(st) {
  if (G.over) return; G.over = true; G.busy = false; G.thinking = false; clearInterval(G.tick); updateHud();
  const online = G.mode === 'online'; if (online && !st.remote && ON.be) ON.be.finish(ON.code, st.result, st.reason).catch(() => {});
  const ai = G.mode === 'ai', white = st.result === '1-0', black = st.result === '0-1';
  const outcome = st.result === '1/2-1/2' ? 'draw' : ((white && G.human === 0) || (black && G.human === 1)) ? (ai ? 'win' : 'win') : 'loss';
  let coins = 0, dr = 0, title = '', sub = '';
  const reason = st.reason[0].toUpperCase() + st.reason.slice(1);
  if (online) { title = outcome === 'win' ? '🏆 You win!' : outcome === 'draw' ? 'Draw' : 'You lose'; sub = `${reason} · vs ${(ON.opp && ON.opp.name) || 'Opponent'}`; Sfx[outcome === 'win' ? 'win' : outcome === 'draw' ? 'draw' : 'lose'](); }
  else if (!ai) { title = st.result === '1/2-1/2' ? 'Draw' : (white ? 'White wins!' : 'Black wins!'); sub = reason; Sfx[st.result === '1/2-1/2' ? 'draw' : 'win'](); }
  else {
    const d = Save.d, L = E.LEVELS[G.level], score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0, exp = 1 / (1 + Math.pow(10, (L.elo - d.rating) / 400));
    dr = Math.round(32 * (score - exp)); d.rating = Math.max(100, d.rating + dr); d.stats.games++;
    if (outcome === 'win') { d.stats.wins++; coins = 30 + G.level * 15; d.stats.best = Math.max(d.stats.best, L.elo); } else if (outcome === 'draw') { d.stats.draws++; coins = 20; } else { d.stats.losses++; coins = 10; }
    d.coins += coins; d.gamesPlayed++;
    title = outcome === 'win' ? 'Victory!' : outcome === 'draw' ? 'Draw' : 'Defeat'; sub = reason; Sfx[outcome === 'win' ? 'win' : outcome === 'draw' ? 'draw' : 'lose']();
  }
  if (!online) Save.d.game = null; Save.save();
  if (st.reason === 'checkmate') { const lk = G.board.kingSq[G.board.turn]; scene.kingFall(lk); }
  await sleep(st.reason === 'checkmate' ? 1500 : 700);
  G.lastOutcome = { coins, ai };
  if (online) { modal(`<h2>${title}</h2><p>${esc(sub)}</p><div class="col"><button class="btn gold" data-act="onAgain">🌐 Play online again</button><button class="btn dark" data-act="viewBoard">View board</button><button class="btn ghost" data-act="home">Home</button></div>`); $('#card').dataset.dismiss = '0'; return; }
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
  const ls = Save.d.lastSetup; setup.mode = mode; setup.rot = Save.d.autoRotate ? 'auto' : 'fixed'; setup.level = ls.level; setup.color = ls.color; setup.time = ls.time;
  renderSetup();
}
function renderSetup() {
  const opt = (g, v, label, small) => `<button class="opt ${setup[g] === v ? 'on' : ''}" data-act="set" data-a="${g}:${v}">${label}${small ? `<small>${small}</small>` : ''}</button>`;
  const ai = setup.mode === 'ai';
  modal(`<h2>${ai ? 'Play vs Computer' : 'Pass & Play'}</h2>
   ${ai ? `<h3>Opponent</h3><div class="lvl">${Object.entries(E.LEVELS).map(([k, L]) => opt('level', +k, L.name, '★'.repeat(Math.ceil(k / 1.2)))).join('')}</div>
   <h3>Your colour</h3><div class="chips">${opt('color', 'white', '♔ White')}${opt('color', 'random', '🎲 Random')}${opt('color', 'black', '♚ Black')}</div>` : `<h3>Board</h3><div class="chips">${opt('rot', 'auto', '🔄 Turns', 'faces the player to move')}${opt('rot', 'fixed', '🪑 Fixed', 'sit face to face')}</div>
   <p class="hint">${setup.rot === 'fixed' ? 'The board never turns. Put the phone flat between you – White sits at the bottom, Black opposite. Black\'s bar, name cards and dialogs flip to face them.' : 'The board turns to face whoever is to move. You can switch to a fixed board any time in the game.'}</p>`}
   <h3>Clock</h3><div class="chips">${TIMES.map(t => opt('time', t.id, t.name)).join('')}</div>
   <div class="col"><button class="btn gold" data-act="start">Start game</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
  $('#card').dataset.dismiss = '1';
}
ACT.set = a => { const [g, v] = a.split(':'); setup[g] = g === 'level' ? +v : v; renderSetup(); };
ACT.start = async () => {
  Save.d.lastSetup = { level: setup.level, color: setup.color, time: setup.time }; if (setup.mode === 'pvp') Save.d.autoRotate = setup.rot !== 'fixed'; Save.save();
  const human = setup.color === 'black' ? 1 : setup.color === 'random' ? (Math.random() < 0.5 ? 0 : 1) : 0;
  newGame({ mode: setup.mode, level: setup.level, human: setup.mode === 'ai' ? human : 0, time: setup.time });
};
$('#btnAI').onclick = () => { Sfx.init(); Sfx.click(); showSetup('ai'); };
$('#btnPvP').onclick = () => { Sfx.init(); Sfx.click(); showSetup('pvp'); };
$('#btnContinue').onclick = () => { Sfx.init(); Sfx.click(); const g = Save.d.game; if (g) newGame({ mode: g.mode, level: g.level, human: g.human, time: g.time }, g); };


/* ---------- online play (Firebase or the local demo backend – see online.js) ---------- */
const FB_ON = false;   // set true once the Facebook app id/token are configured (see ONLINE_SETUP.md)
const ON = { be: null, user: null, code: null, unsub: null, tc: 'none', opp: null, room: null, searching: false, reelT: null };
const avHtml = u => u && u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : avatarFor(u ? u.uid || u.name : '?');
function onlineTeardown() {
  if (ON.unsub) { ON.unsub(); ON.unsub = null; } if (ON.be && ON.searching) ON.be.cancelQuick(); ON.searching = false; clearTimeout(ON.reelT);
  if (ON.be && ON.code && !(G.mode === 'online' && ON.room && ON.room.status !== 'waiting')) ON.be.leaveRoom(ON.code);
  if (G.mode !== 'online') { ON.code = null; ON.room = null; }
}
async function onlineInit() {
  if (!ON.be) ON.be = await getBackend(); if (!ON.be) return false;
  if (!ON.user) ON.user = await ON.be.init(); return true;
}
const onHead = t => `<div class="sh-head"><h2>${t}</h2><button class="x" data-act="onClose" aria-label="Close">✕</button></div>`;
async function showOnline() {
  sheet(onHead('🌐 Play Online') + '<div class="sh-body"><p class="fine">Connecting…</p></div>');
  let ok = false;
  try { ok = await onlineInit(); } catch (e) { console.error(e); sheet(onHead('🌐 Play Online') + `<div class="sh-body"><div class="banner done" style="background:rgba(224,52,79,.18)"><div class="bi">⚠</div><div class="grow"><b>Can't connect</b><small>Check your internet connection and try again.<br>${esc(e.message || e)}</small></div></div></div>`); return; }
  if (!ok) { sheet(onHead('🌐 Play Online') + `<div class="sh-body"><div class="banner gold"><div class="bi">🛠</div><div class="grow"><b>Coming soon</b><small>Online play isn't switched on in this build yet. Meanwhile try Play vs Computer or Pass &amp; Play.</small></div></div></div>`); return; }
  renderOnline();
}
function renderOnline() {
  const u = ON.user, demo = ON.be.name === 'demo', prov = { guest: 'Guest account', google: 'Signed in with Google', facebook: 'Signed in with Facebook' }[u.provider] || 'Signed in';
  const tcs = TIMES.slice(0, 3);
  sheet(onHead('🌐 Play Online') + `<div class="sh-body">
   <div class="prof"><div class="pav">${avHtml(u)}</div><div class="grow"><input class="nm" data-nm value="${esc(u.name)}" maxlength="16" aria-label="Your name"><small>${prov} · ♔ ${u.rating || 800}</small></div></div>
   ${demo ? '<div class="banner gold"><div class="bi">🧪</div><div class="grow"><b>Demo mode</b><small>No Firebase set up yet – open this game in two browser tabs to try it.</small></div></div>' : ''}
   <div class="sec">Time control</div><div class="seg">${tcs.map(t => `<button class="${ON.tc === t.id ? 'on' : ''}" data-act="onTc" data-a="${t.id}">${t.name}</button>`).join('')}</div>
   <div class="sec">Play</div>
   <button class="bigact" data-act="onQuick"><i>⚡</i><div><b>Quick match</b><small>Play a random online opponent</small></div></button>
   <button class="bigact" data-act="onCreate"><i>🔑</i><div><b>Create private game</b><small>Get a code and share it with a friend</small></div></button>
   <div class="joinrow"><input class="code" data-code maxlength="6" placeholder="ENTER CODE" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="btn gold" data-act="onJoin">Join</button></div>
   <div class="sec">Account</div>
   ${u.guest ? `<p class="fine" style="margin:0 0 10px;text-align:left">You're playing as a guest. Sign in to keep your name and rating on any device.</p>
     <button class="authbtn g" data-act="onSign" data-a="google"><i>G</i>Continue with Google</button>${FB_ON ? '<button class="authbtn f" data-act="onSign" data-a="facebook"><i>f</i>Continue with Facebook</button>' : ''}`
   : `<button class="btn dark" style="width:100%" data-act="onSignOut">Sign out</button>`}
  </div>`);
}
ACT.onClose = () => { onlineTeardown(); closeModal(); };
ACT.onTc = id => { ON.tc = id; renderOnline(); };
ACT.onSign = async p => { try { toast('Signing in…', 1500); ON.user = await ON.be.signIn(p); toast('Signed in as ' + ON.user.name); } catch (e) { console.error(e); if (!/cancel|closed|popup/i.test(String(e.code || e.message))) toast('Sign-in failed: ' + (e.code || e.message), 3500); } renderOnline(); };
ACT.onSignOut = async () => { ON.user = await ON.be.signOut(); renderOnline(); };
async function onlineRename(v) { v = v.trim().slice(0, 16); if (!v) return renderOnline(); ON.user.name = v; try { await ON.be.setName(v); toast('Name saved'); } catch (e) { toast('Could not save name'); } }
$('#btnOnline').onclick = () => { Sfx.init(); Sfx.click(); showOnline(); };
$('#card').addEventListener('input', e => { if (e.target.dataset && e.target.dataset.code !== undefined) { const v = cleanCode(e.target.value); if (v !== e.target.value) e.target.value = v; } });

/* private game: create + share a code */
ACT.onCreate = async () => {
  try { const code = await ON.be.createRoom({ tc: ON.tc }); ON.code = code; renderWaiting(code);
    ON.unsub = ON.be.watchRoom(code, r => { if (r && r.status === 'playing' && r.guest) { if (ON.unsub) ON.unsub(); ON.unsub = null; beginOnline(r); } }); }
  catch (e) { console.error(e); toast('Could not create game: ' + (e.message || e), 3200); }
};
const shareText = code => `Let's play chess! Join my Royal Chess 3D game with code ${code}`;
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
function renderWaiting(code) {
  const spaced = code.split('').join(' ');
  sheet(onHead('🔑 Private game') + `<div class="sh-body" style="text-align:center">
   <p class="fine" style="margin-top:6px">Share this code with your friend. The game starts as soon as they join.</p>
   <div class="codebox" id="codeBox">${spaced}</div>
   <div class="sharerow">${isNative() ? '' : `<button class="authbtn w" data-act="onShare" data-a="wa"><i>✆</i>WhatsApp</button>`}<button class="authbtn s" data-act="onShare" data-a="sys"><i>⤴</i>Share</button><button class="authbtn c" data-act="onShare" data-a="copy"><i>⧉</i>Copy</button></div>
   <div class="waiting"><span></span><span></span><span></span> Waiting for your friend…</div>
   <p class="fine">Time: ${(TIMES.find(t => t.id === ON.tc) || TIMES[0]).name}</p>
   <button class="btn ghost" style="width:100%;margin-top:10px" data-act="onClose">Cancel</button></div>`);
}
ACT.onShare = async k => {
  const code = ON.code, text = shareText(code);
  if (k === 'copy') { try { await navigator.clipboard.writeText(code); toast('Code copied: ' + code); } catch (e) { toast('Code: ' + code, 3000); } return; }
  if (k === 'wa') { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); return; }
  try { const Sh = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share; if (Sh) await Sh.share({ text, dialogTitle: 'Invite a friend' }); else if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Invite copied'); } } catch (e) { /* cancelled */ }
};
ACT.onJoin = async () => {
  const code = cleanCode(($('input[data-code]') || {}).value); if (code.length !== 6) return toast('Enter the 6-character code');
  try { const r = await ON.be.joinRoom(code); ON.code = code; beginOnline(r); }
  catch (e) { toast({ notfound: 'No game with that code', full: 'That game already has two players', over: 'That game has finished' }[e.message] || 'Could not join: ' + (e.code || e.message), 3000); }
};

/* quick match: spinning reel of player profiles that lands on your real opponent */
const reelCard = (n, a, cls = '') => `<div class="rc ${cls}"><i>${a}</i><b>${esc(n)}</b></div>`;
const randReel = n => Array.from({ length: n }, () => reelCard(REEL_NAMES[Math.random() * REEL_NAMES.length | 0], REEL_AVATARS[Math.random() * REEL_AVATARS.length | 0])).join('');
ACT.onQuick = () => {
  ON.searching = true; let sec = 0;
  const base = randReel(14);
  sheet(onHead('⚡ Quick match') + `<div class="sh-body" style="text-align:center">
   <p class="fine" style="margin-top:6px" id="srchTxt">Looking for an opponent…</p>
   <div class="reel"><div class="strip spin" id="strip">${base}${base}</div><div class="mark"></div></div>
   <div class="vs hidden" id="vsRow"></div>
   <div id="srchBtns"><div class="waiting"><span></span><span></span><span></span> <em id="srchSec">0s</em></div>
   <button class="btn ghost" style="width:100%;margin-top:10px" data-act="onCancelQuick">Cancel</button></div></div>`);
  const t0 = Date.now(); const tick = () => { if (!ON.searching) return; sec = Math.floor((Date.now() - t0) / 1000); const e = $('#srchSec'); if (e) e.textContent = sec + 's'; if (sec === 20 && $('#srchTxt')) { $('#srchTxt').textContent = 'No one yet… players join all the time. Keep waiting or play the computer.'; $('#srchBtns').insertAdjacentHTML('afterbegin', '<button class="btn dark" style="width:100%;margin-bottom:8px" data-act="onToAI">🤖 Play vs Computer instead</button>'); } ON.reelT = setTimeout(tick, 500); };
  tick();
  ON.be.quickMatch({ tc: ON.tc }).then(async ({ code }) => {
    if (!ON.searching) return; ON.searching = false; clearTimeout(ON.reelT);
    const room = await ON.be.joinRoom(code); const opp = room.host.uid === ON.user.uid ? room.guest : room.host;
    await landReel(opp, room);
  }).catch(e => { if (e.message !== 'cancelled') { console.error(e); toast('Matchmaking failed: ' + (e.message || e), 3200); renderOnline(); } });
};
async function landReel(opp, room) {
  const strip = $('#strip'); if (!strip) return beginOnline(room);
  const pitch = 106, idx = 26, n = 30; let html = '';
  for (let i = 0; i < n; i++) html += i === idx ? reelCard(opp.name, avHtml(opp), 'real') : randReel(1);
  strip.className = 'strip'; strip.style.transition = 'none'; strip.style.transform = 'translateX(0)'; strip.innerHTML = html; void strip.offsetWidth;
  const view = strip.parentElement.clientWidth, target = -(idx * pitch - (view / 2 - 48));
  $('#srchTxt').textContent = 'Opponent found!'; $('#srchBtns').classList.add('hidden');
  strip.style.transition = 'transform 2.8s cubic-bezier(.12,.6,.12,1)'; strip.style.transform = `translateX(${target}px)`;
  Sfx.select(); await sleep(3000);
  const row = $('#vsRow'); if (row) { row.classList.remove('hidden'); row.innerHTML = `<div class="vsc"><div class="pav">${avHtml(ON.user)}</div><b>${esc(ON.user.name)}</b></div><div class="vsx">VS</div><div class="vsc"><div class="pav">${avHtml(opp)}</div><b>${esc(opp.name)}</b></div>`; Sfx.win(); }
  await sleep(1400); beginOnline(room);
}
ACT.onCancelQuick = () => { onlineTeardown(); renderOnline(); };
ACT.onToAI = () => { onlineTeardown(); closeModal(); showSetup('ai'); };
ACT.onAgain = () => { showHome(); showOnline(); };

/* playing an online game */
function beginOnline(room) {
  ON.searching = false; clearTimeout(ON.reelT); if (ON.unsub) { ON.unsub(); ON.unsub = null; }
  const me = ON.user.uid, host = room.host.uid === me, color = host ? room.hostColor : room.hostColor ^ 1; ON.opp = host ? room.guest : room.host; ON.code = room.code; ON.room = room;
  const tmp = new E.Board(), moves = [];
  for (const u of room.moves) { const m = tmp.parseUci(u, tmp.legal()); if (!m) break; tmp.make(m); moves.push(m); }
  const tc = TIMES.find(t => t.id === room.tc) || TIMES[0];
  newGame({ mode: 'online', human: color, time: tc.id }, moves.length ? { moves, hints: 0, undos: 0, clocks: [tc.base, tc.base] } : null);
  toast(`You play ${color ? 'Black' : 'White'} vs ${ON.opp.name}`, 2600);
  ON.unsub = ON.be.watchRoom(room.code, r => { if (!r || G.mode !== 'online' || r.code !== ON.code) return; ON.room = r; pumpOnline(); });
}
async function sendOnlineMove(uci, len) {
  for (let i = 0; i < 5; i++) { try { await ON.be.pushMove(ON.code, uci, len); return; } catch (e) { if (e.message === 'stale') return; await sleep(600 * (i + 1)); } }
  toast('Connection problem – your move may not have been sent', 3500);
}
function pumpOnline() {
  const r = ON.room; if (!r || G.mode !== 'online' || G.over || G.busy) return;
  if (r.moves.length > G.moves.length) { const m = G.board.parseUci(r.moves[G.moves.length], G.legal); if (m) commit(m, true); else toast('Received an invalid move'); return; }
  if (r.result) endGame({ result: r.result.result, reason: r.result.reason, remote: true });
}

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
let shopTab = 'coins';
const BG_GRAD = { wood: 'linear-gradient(#3a2414,#8a5a32)', palace: 'linear-gradient(#2a1a3a,#d9b36a)', garden: 'linear-gradient(#2c3b86,#ffb06b 60%,#4a7a3a)', night: 'linear-gradient(#01020a,#26357a)', snow: 'linear-gradient(#8aaed8,#f4f8ff)' };
function showShop() {
  const d = Save.d, I = CFG.iap, ad = d.adCoins.date === todayStr() ? d.adCoins.n : 0, t = shopTab;
  const state = (owned, cur, cost, kind, key) => cur ? `<button class="gbtn eq" disabled>✓ Equipped</button>` : owned ? `<button class="gbtn use" data-act="${kind}" data-a="${key}">Equip</button>` : `<button class="gbtn buy ${d.coins >= cost ? '' : 'poor'}" data-act="${kind}" data-a="${key}">🪙 ${cost}</button>`;
  const tabs = [['coins', '🪙', 'Coins'], ['boards', '♟', 'Boards'], ['scenes', '🏞', 'Scenes'], ['pieces', '🎨', 'Pieces']];
  let body = '';
  if (t === 'coins') {
    body = `<div class="banner ad"><div class="bi">▶</div><div class="grow"><b>Free coins</b><small>${5 - ad} of 5 left today · +60 🪙 each</small></div><button class="btn ad" data-act="freeCoins" ${ad >= 5 ? 'disabled' : ''}>Watch</button></div>
     ${d.noAds ? '<div class="banner done"><div class="bi">✓</div><div class="grow"><b>Ads removed</b><small>Thank you for supporting us 💖</small></div></div>' : `<div class="banner gold"><div class="bi">🚫</div><div class="grow"><b>${I.remove_ads.name}</b><small>${I.remove_ads.desc}</small></div><button class="btn gold" data-act="buy" data-a="remove_ads">${I.remove_ads.price}</button></div>`}
     <div class="sec">Coin packs</div><div class="packs">${['coins_500', 'coins_1500', 'coins_4000'].map((k, i) => `<button class="pack ${i === 1 ? 'best' : ''}" data-act="buy" data-a="${k}">${i === 1 ? '<em>Best value</em>' : ''}<span class="pc">${['🪙', '💰', '🏆'][i]}</span><b>${I[k].coins}</b><small>coins</small><span class="pp">${I[k].price}</span></button>`).join('')}</div>
     <p class="fine">Coins unlock boards, scenes and piece colours. Everything is optional – the game is fully playable for free.</p>`;
  } else if (t === 'boards') {
    body = `<div class="grid">${Object.entries(BOARDS).filter(([k]) => k !== 'custom').map(([k, v]) => `<div class="gcard ${d.board === k ? 'cur' : ''}"><div class="prev chk" style="--l:${v.light};--d:${v.dark}"></div><b>${v.name}</b>${state(d.boards.includes(k), d.board === k, v.cost, 'board', k)}</div>`).join('')}</div>
     <p class="fine">Want your own colours? Settings → Appearance → Custom colours (free).</p>`;
  } else if (t === 'scenes') {
    body = `<div class="grid">${Object.entries(BGS).map(([k, v]) => { const own = d.bgs.includes(k); return `<div class="gcard ${d.bg === k ? 'cur' : ''}"><div class="prev scn" style="background:${BG_GRAD[k]}"><span>${v.icon}</span></div><b>${v.name}</b>${own ? '' : `<button class="gbtn ghost2" data-act="bgPreview" data-a="${k}">👁 Preview</button>`}${state(own, d.bg === k, v.cost, 'bg', k)}</div>`; }).join('')}</div>`;
  } else {
    const psw = { ivory: ['#e9dcb9', '#2a2524'], rosewood: ['#efd6a8', '#6a2e22'], gold: ['#e3e7ee', '#d6a737'] };
    body = `<div class="grid">${Object.entries(PIECE_COLORS).map(([k, v]) => `<div class="gcard ${d.pcolor === k ? 'cur' : ''}"><div class="prev pcs"><i style="background:${psw[k][0]}"></i><i style="background:${psw[k][1]}"></i></div><b>${v.name}</b>${state(d.pcolors.includes(k), d.pcolor === k, v.cost, 'pcolor', k)}</div>`).join('')}</div>`;
  }
  sheet(`<div class="sh-head"><h2>🛍 Shop</h2><span class="coinpill">🪙 ${d.coins}</span><button class="x" data-act="close" aria-label="Close">✕</button></div>
   <div class="tabs">${tabs.map(([k, ic, l]) => `<button class="${t === k ? 'on' : ''}" data-act="shopTab" data-a="${k}"><i>${ic}</i>${l}</button>`).join('')}</div>
   <div class="sh-body">${body}</div>`);
}
ACT.shopTab = k => { shopTab = k; showShop(); };
ACT.bg = k => { if (!Save.d.bgs.includes(k)) { if (Save.d.coins < BGS[k].cost) return toast('Not enough coins'); Save.d.coins -= BGS[k].cost; Save.d.bgs.push(k); Sfx.coin(); } Save.d.bg = k; Save.save(); applyStyle(); showShop(); };
let bgPrevT;
ACT.bgPreview = k => { closeModal(); applyBgOnly(k); toast(`Previewing ${BGS[k].name} – buy it in the Shop to keep`, 3200); clearTimeout(bgPrevT); bgPrevT = setTimeout(() => { applyBgOnly(Save.d.bg); showShop(); }, 6500); };
const applyBgOnly = k => scene.setStyle({ bg: k });
ACT.board = k => { if (!Save.d.boards.includes(k)) { if (Save.d.coins < BOARDS[k].cost) return toast('Not enough coins'); Save.d.coins -= BOARDS[k].cost; Save.d.boards.push(k); Sfx.coin(); } Save.d.board = k; Save.save(); applyStyle(); showShop(); };
ACT.pcolor = k => { if (!Save.d.pcolors.includes(k)) { if (Save.d.coins < PIECE_COLORS[k].cost) return toast('Not enough coins'); Save.d.coins -= PIECE_COLORS[k].cost; Save.d.pcolors.push(k); Sfx.coin(); } Save.d.pcolor = k; Save.save(); applyStyle(); showShop(); };
ACT.freeCoins = async () => { const a = Save.d.adCoins, t = todayStr(); if (a.date !== t) { a.date = t; a.n = 0; } if (a.n >= 5) return toast('Come back tomorrow!'); if (await Ads.rewarded()) { a.n++; Save.d.coins += 60; Save.save(); toast('+60 🪙'); Sfx.coin(); showShop(); } };
ACT.buy = async id => { if (await IAP.buy(id)) { const p = CFG.iap[id]; if (id === 'remove_ads') Save.d.noAds = true; else Save.d.coins += p.coins; Save.save(); toast('Thank you! 💖'); Sfx.coin(); showShop(); } };
$('#btnShop').onclick = () => { Sfx.init(); Sfx.click(); showShop(); };
$('#homeCoins').onclick = () => { showShop(); };
function showSettings() {
  const d = Save.d, tg = (k, ic, label, sub) => `<div class="row-s"><i>${ic}</i><div class="grow">${label}${sub ? `<small>${sub}</small>` : ''}</div><button class="tg ${d[k] ? 'on' : ''}" data-act="tog" data-a="${k}" role="switch" aria-checked="${!!d[k]}"></button></div>`;
  const seg = (k, vals) => `<div class="seg">${vals.map(([v, l]) => `<button class="${d[k] === v ? 'on' : ''}" data-act="pick" data-a="${k}:${v}">${l}</button>`).join('')}</div>`;
  const lbl = (ic, t, sub) => `<div class="row-l"><i>${ic}</i><div class="grow">${t}${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  const bsw = (k, v) => k === 'custom' ? `linear-gradient(135deg,${d.customBoard.light} 50%,${d.customBoard.dark} 50%)` : `linear-gradient(135deg,${v.light} 50%,${v.dark} 50%)`;
  sheet(`<div class="sh-head"><h2>⚙ Settings</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>
   <div class="sh-body">
   <div class="sec">Sound &amp; feel</div><div class="grp">${tg('sound', '🔊', 'Sound effects')}${tg('music', '🎵', 'Music')}${tg('vib', '📳', 'Vibration')}</div>
   <div class="sec">Gameplay</div><div class="grp">${tg('legal', '🟢', 'Show legal moves', 'Dots on squares a piece can reach')}${tg('cinema', '🎬', 'Cinematic move camera', 'Camera follows every move')}
     <div class="row-s col2">${lbl('🧑‍🤝‍🧑', 'Pass &amp; Play board', 'Fixed = sit face to face, board never turns')}${`<div class="seg"><button class="${d.autoRotate ? 'on' : ''}" data-act="rot" data-a="auto">🔄 Turns</button><button class="${!d.autoRotate ? 'on' : ''}" data-act="rot" data-a="fixed">🪑 Fixed</button></div>`}</div></div>
   <div class="sec">Appearance</div><div class="grp">
     <div class="row-s col2">${lbl('🐴', 'Piece style')}${seg('set', [['royal', '🐴 Royal Animals'], ['staunton', '♞ Classic']])}</div>
     <div class="row-s col2">${lbl('🎨', 'Board colours')}<div class="swgrid">${Object.entries(BOARDS).filter(([k]) => d.boards.includes(k)).map(([k, v]) => `<button class="swb ${d.board === k ? 'on' : ''}" data-act="pick" data-a="board:${k}"><i style="background:${bsw(k, v)}"></i><small>${k === 'custom' ? 'Custom' : v.name}</small></button>`).join('')}<button class="swb more" data-act="toShopBoards"><i>＋</i><small>More</small></button></div>
       ${d.board === 'custom' ? `<div class="custom"><label>Light squares<input type="color" data-cb="light" value="${d.customBoard.light}"></label><label>Dark squares<input type="color" data-cb="dark" value="${d.customBoard.dark}"></label></div>
       <div class="seg">${[['wood', 'Wood'], ['felt', 'Matte'], ['glass', 'Glossy']].map(([f, l]) => `<button class="${d.customBoard.finish === f ? 'on' : ''}" data-act="cfinish" data-a="${f}">${l}</button>`).join('')}</div>` : ''}</div>
     <div class="row-s col2">${lbl('🏞', 'Background')}<div class="swgrid bgs">${Object.entries(BGS).filter(([k]) => d.bgs.includes(k)).map(([k, v]) => `<button class="swb ${d.bg === k ? 'on' : ''}" data-act="pick" data-a="bg:${k}"><i style="background:${BG_GRAD[k]}">${v.icon}</i><small>${v.name}</small></button>`).join('')}<button class="swb more" data-act="toShopBg"><i>＋</i><small>More</small></button></div></div>
     <div class="row-s col2">${lbl('🏷', 'Piece icons (who is who)')}${seg('labels', [['border', 'Border'], ['above', 'Above'], ['off', 'Off']])}</div></div>
   <div class="sec">Graphics</div><div class="grp">
     <div class="row-s col2">${lbl('✨', 'Quality', 'Lower it if the game feels slow')}${seg('quality', [['auto', 'Auto'], ['high', 'High'], ['medium', 'Med'], ['low', 'Low']])}</div>
     <div class="row-s col2">${lbl('⏩', 'Animation speed')}${seg('speed', [[0.7, 'Slow'], [1, 'Normal'], [1.6, 'Fast']])}</div></div>
   <div class="foot"><button class="btn dark" data-act="restore">Restore purchases</button></div></div>
   <div class="sh-foot"><button class="btn gold" data-act="close">Done</button></div>`);
}
ACT.rot = v => { setBoardMode(v === 'fixed'); showSettings(); };
ACT.settings = () => showSettings();
ACT.tog = k => { Save.d[k] = !Save.d[k]; Save.save(); if (k === 'cinema') applyStyle(); if (k === 'music') Sfx.music(Save.d.music); if (k === 'sound' && !Save.d.sound) Sfx.music(false); showSettings(); };
ACT.pick = a => { const [k, v] = a.split(':'); Save.d[k] = k === 'speed' ? +v : v; Save.save(); applyStyle(); if (G.board && G.mode && k === 'set') { updateHud(); } showSettings(); };
ACT.toShopBg = () => { shopTab = 'scenes'; showShop(); }; ACT.toShopBoards = () => { shopTab = 'boards'; showShop(); };
ACT.cfinish = f => { Save.d.customBoard.finish = f; Save.save(); applyStyle(); showSettings(); };
ACT.restore = () => toast('Purchases restored (if any)');
$('#btnSettings').onclick = () => { Sfx.init(); Sfx.click(); showSettings(); };
$('#btnStats').onclick = () => { Sfx.click(); const s = Save.d.stats;
  modal(`<h2>Your Stats</h2><div class="stat"><span>Rating</span><span>${Save.d.rating}</span></div><div class="stat"><span>Games vs computer</span><span>${s.games}</span></div><div class="stat"><span>Wins</span><span>${s.wins}</span></div><div class="stat"><span>Draws</span><span>${s.draws}</span></div><div class="stat"><span>Losses</span><span>${s.losses}</span></div><div class="stat"><span>Strongest opponent beaten</span><span>${s.best || '—'}</span></div><div class="col"><button class="btn gold" data-act="close">Close</button></div>`); $('#card').dataset.dismiss = '1'; };
function showGuide() {
  const set = Save.d.set, rows = ['k', 'q', 'r', 'b', 'n', 'p'].map(t => { const [g, name, desc] = PINFO[set][t]; return `<div class="gi"><div class="gg">${g}</div><div><b>${name}</b><span>${desc}</span></div></div>`; }).join('');
  modal(`<h2>Meet the pieces</h2><p style="margin:2px 0 6px">The icons on the board's <b>border</b> show every piece. Tap a piece and its icon lights up.</p>
   <div class="teams"><div class="tw">⚪ White<br><small>ivory pieces · gold ring</small></div><div class="tb">⚫ Black<br><small>dark pieces · red ring</small></div></div>
   <div class="guide">${rows}</div><div class="col"><button class="btn gold" data-act="close">Got it</button></div>`); $('#card').dataset.dismiss = '1';
}
ACT.guide = () => showGuide();
$('#btnHow').onclick = () => { Sfx.click(); showGuide(); };
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
function pauseNow() { Sfx.music(false); if (G.mode && G.mode !== 'online' && !G.over && !modalOpen()) showPause(); }
nativeLifecycle(pauseNow, onBack);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseNow(); else Sfx.music(); });
if ('serviceWorker' in navigator && !Native && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

Ads.init();
Promise.all([scene.ready, sleep(350)]).then(() => {
  showHome(); $('#loading').classList.add('done'); setTimeout(() => $('#loading').remove(), 700);
  if (!dailyState().claimed && Save.d.gamesPlayed >= 1) setTimeout(showDaily, 600);
  setTimeout(() => scene.prewarm({ sets: [Save.d.set === 'royal' ? 'staunton' : 'royal'], boards: Save.d.boards.filter(k => k !== Save.d.board && k !== 'custom').slice(0, 3), bgs: Save.d.bgs.filter(k => k !== Save.d.bg) }), 1500);
});
window.__play = u => { const m = G.board.parseUci(u, G.legal); if (m) commit(m); return !!m; };
window.__setFen = fen => { closeModal(); G.board.load(fen); G.startFen = fen; G.moves = []; G.sans = []; G.legal = G.board.legal(); G.over = false; G.busy = false; scene.loadPosition(G.board.b); updateHud(); };
window.__G = G; window.__scene = scene; window.__ACT = ACT; window.__E = E;
