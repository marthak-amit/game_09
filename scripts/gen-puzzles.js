// Generates mate-in-1/2/3 puzzles with a UNIQUE forced-mate first move, from self-played games.
// Usage: node scripts/gen-puzzles.js [m1 m2 m3] > www/js/puzzles.json   (progress goes to stderr)
const E = require('../www/js/chess-engine.js');
const want = { 1: +process.argv[2] || 30, 2: +process.argv[3] || 50, 3: +process.argv[4] || 25 };
let seed = 987654321; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/** all moves for the side to move that force checkmate within n of its own moves */
function forcedMates(b, n) {
  const res = [];
  for (const m of b.legal()) {
    b.make(m); let ok = false; const mated = b.inCheck() && b.legal().length === 0;
    if (mated) ok = true;
    else if (n > 1 && !b.insufficient()) {
      const replies = b.legal();
      ok = replies.length > 0 && replies.every(r => { b.make(r); let good = false; if (!b.insufficient() && b.half < 100) good = forcedMates(b, n - 1).length > 0; b.unmake(); return good; });
    }
    b.unmake(); if (ok) res.push(m);
  }
  return res;
}
const S = new E.Searcher(); const out = { 1: [], 2: [], 3: [] }; const seen = new Set();
const total = () => out[1].length + out[2].length + out[3].length, need = () => want[1] + want[2] + want[3];
const done = () => out[1].length >= want[1] && out[2].length >= want[2] && out[3].length >= want[3];
function add(n, b, m1) {
  const fen = b.fen().split(' ').slice(0, 4).join(' ') + ' 0 1'; if (seen.has(fen) || out[n].length >= want[n]) return;
  // keep the position natural: at least 6 pieces total, no piece count extremes
  let pieces = 0; for (let s = 0; s < 64; s++) if (b.b[s]) pieces++; if (pieces < 6) return;
  seen.add(fen); out[n].push({ n, fen, m1: b.uci(m1), side: b.turn ? 'b' : 'w', pieces }); process.stderr.write(`puzzle M${n} #${out[n].length} (${total()}/${need()})\n`);
}
let games = 0; const t0 = Date.now();
while (!done() && Date.now() - t0 < 1000 * 60 * 14) {
  games++; const b = new E.Board(); let ply = 0;
  while (ply < 160 && !b.status().over && !done()) {
    ply++;
    if (ply >= 14 && ply % 1 === 0) {
      const moves = b.legal(); let checks = 0; for (const m of moves) { b.make(m); if (b.inCheck()) checks++; b.unmake(); }
      if (checks) {
        const m1 = forcedMates(b, 1);
        if (m1.length === 1 && out[1].length < want[1] && rnd() < 0.5) add(1, b, m1[0]);
        if (!m1.length && out[2].length < want[2]) { const r = S.search(b, 3, 80); if (r.score === E.MATE - 3) { const f2 = forcedMates(b, 2); if (f2.length === 1) add(2, b, f2[0]); } }
        if (!m1.length && out[3].length < want[3] && checks >= 1 && rnd() < 0.35) { const r = S.search(b, 5, 250); if (r.score === E.MATE - 5) { const f2 = forcedMates(b, 2); if (!f2.length) { const f3 = forcedMates(b, 3); if (f3.length === 1) add(3, b, f3[0]); } } }
      }
    }
    // keep games lively: mostly decent moves, sometimes random to create tactics
    const mv = b.legal(); if (!mv.length) break;
    let m; if (rnd() < 0.18) m = mv[Math.floor(rnd() * mv.length)]; else m = E.chooseMove(b, rnd() < 0.5 ? 2 : 3, rnd).move;
    b.make(m);
  }
  if (games % 20 === 0) process.stderr.write(`games ${games}, puzzles ${total()}/${need()}, ${(Date.now() - t0) / 1000 | 0}s\n`);
}
const list = [...out[1], ...out[2], ...out[3]]; list.forEach((p, i) => { p.id = i + 1; delete p.pieces; });
process.stdout.write(JSON.stringify(list));
process.stderr.write(`done: M1 ${out[1].length}, M2 ${out[2].length}, M3 ${out[3].length} in ${games} games\n`);
