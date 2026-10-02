// Independent verification of www/js/puzzles.json: every FEN is legal, side matches, the stored first move
// forces mate in N, and (for N<=2) it is the ONLY first move that does.
const E = require('../www/js/chess-engine.js'); const puz = require('../www/js/puzzles.json');
function forcedMates(b, n) {
  const res = [];
  for (const m of b.legal()) {
    b.make(m); let ok = b.inCheck() && b.legal().length === 0;
    if (!ok && n > 1 && !b.insufficient()) { const rep = b.legal(); ok = rep.length > 0 && rep.every(r => { b.make(r); const good = forcedMates(b, n - 1).length > 0; b.unmake(); return good; }); }
    b.unmake(); if (ok) res.push(m);
  }
  return res;
}
let bad = 0; const t0 = Date.now();
for (const p of puz) {
  const b = new E.Board(p.fen); const m1 = b.parseUci(p.m1);
  const fail = msg => { bad++; console.log('BAD puzzle', p.id, msg); };
  if (!m1) { fail('first move illegal'); continue; }
  if ((b.turn ? 'b' : 'w') !== p.side) fail('side mismatch');
  if (b.status().over) fail('position already over');
  if (p.n <= 2) { const f = forcedMates(b, p.n); if (f.length !== 1 || f[0] !== m1) fail(`expected unique solution, got ${f.length}`); if (p.n === 2 && forcedMates(b, 1).length) fail('has mate in 1'); }
  else { b.make(m1); const reps = b.legal(); if (!reps.length || !reps.every(r => { b.make(r); const g = forcedMates(b, 2).length > 0; b.unmake(); return g; })) fail('m1 does not force mate in 3'); b.unmake(); }
}
console.log(bad ? `FAILED ${bad}` : `ALL ${puz.length} PUZZLES VERIFIED`, `(${((Date.now() - t0) / 1000).toFixed(1)}s)`); process.exit(bad ? 1 : 0);
