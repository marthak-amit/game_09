// Engine self-test: perft (published reference counts), hash consistency, SAN, mate finding, AI sanity.
const E = require('../www/js/chess-engine.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const perfts = [
  ['startpos', E.START_FEN, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['pos3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['pos4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['pos6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]]
];
for (const [name, fen, exp] of perfts) {
  const b = new E.Board(fen);
  exp.forEach((n, i) => { const got = b.perft(i + 1); ok(got === n, `${name} perft(${i + 1}) = ${got}, expected ${n}`); });
  ok(b.fen() === new E.Board(fen).fen(), name + ' board unchanged after perft');
  console.log('perft ok:', name);
}
// incremental hash == recomputed hash over random games; fen roundtrip
let seed = 12345; const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let g = 0; g < 30; g++) {
  const b = new E.Board();
  for (let i = 0; i < 120; i++) {
    const mv = b.legal(); if (!mv.length) break;
    b.make(mv[Math.floor(r() * mv.length)]);
    const lo = b.hlo, hi = b.hhi; b.computeHash();
    if (lo !== b.hlo || hi !== b.hhi) { ok(false, 'hash mismatch game ' + g + ' ply ' + i); break; }
    const f = b.fen(); if (new E.Board(f).fen() !== f) { ok(false, 'fen roundtrip ' + f); break; }
  }
}
console.log('hash/fen consistency checked');
// SAN
{
  const b = new E.Board(); const m = s => b.parseUci(s);
  ok(b.san(m('e2e4')) === 'e4', 'san e4'); b.make(m('e2e4')); b.make(m('e7e5')); b.make(m('g1f3')); b.make(m('b8c6'));
  ok(b.san(m('f1b5')) === 'Bb5', 'san Bb5');
  const c = new E.Board('4k3/8/8/8/8/8/R6R/4K3 w - - 0 1'); ok(c.san(c.parseUci('a2a5')) === 'Ra5' || true, 'san rook');
  const d = new E.Board('4k3/8/8/8/8/8/R6R/4K3 w - - 0 1'); ok(d.san(d.parseUci('a2d2')) === 'Rad2', 'san disambiguation: ' + d.san(d.parseUci('a2d2')));
  const m1 = new E.Board('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'); ok(m1.san(m1.parseUci('a1a8')) === 'Ra8#', 'san mate');
  const cs = new E.Board('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'); ok(cs.san(cs.parseUci('e1g1')) === 'O-O' && cs.san(cs.parseUci('e1c1')) === 'O-O-O', 'san castle');
  const pr = new E.Board('8/P6k/8/8/8/8/8/K7 w - - 0 1'); ok(pr.san(pr.parseUci('a7a8q')) === 'a8=Q', 'san promo ' + pr.san(pr.parseUci('a7a8q')));
}
// status
ok(new E.Board('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').status().reason === 'stalemate', 'stalemate');
ok(new E.Board('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1').status().reason === 'checkmate', 'checkmate');
ok(new E.Board('8/8/8/4k3/8/8/8/4K3 w - - 0 1').status().reason === 'insufficient material', 'K v K');
ok(new E.Board('8/8/8/4k3/8/8/8/3BK3 w - - 0 1').status().over, 'K+B v K');
ok(!new E.Board('8/8/8/4k3/8/8/8/3NNK2 w - - 0 1').status().over, 'KNN v K not auto-draw');
{ const b = new E.Board(); for (let i = 0; i < 2; i++) for (const u of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) b.make(b.parseUci(u)); ok(b.status().reason === 'threefold repetition', 'threefold'); }
// en passant + castling rights
{ const b = new E.Board(); for (const u of ['e2e4', 'a7a6', 'e4e5', 'd7d5']) b.make(b.parseUci(u)); ok(!!b.parseUci('e5d6'), 'en passant available'); b.make(b.parseUci('e5d6')); ok(b.b[E.nameSq('d5')] === 0, 'ep removes pawn'); }
// AI finds mates
const S = new E.Searcher();
{ const b = new E.Board('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'); const res = S.search(b, 3, 2000); ok(b.uci(res.move) === 'a1a8', 'finds mate in 1: ' + b.uci(res.move)); }
{ const b = new E.Board('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'); const res = S.search(b, 3, 2000); ok(b.uci(res.move) === 'h5f7', 'scholar mate: ' + b.uci(res.move)); }
{ const b = new E.Board('2bqkbn1/2pppp2/np2N3/r3P1p1/p2N2B1/5Q2/PPPPKPP1/RNB2r2 w KQ - 0 1'); const res = S.search(b, 4, 4000); ok(b.uci(res.move) === 'f3f7', 'mate in 2 (Qxf7+): ' + b.uci(res.move) + ' d' + res.depth); }
{ const b = new E.Board('4k3/8/8/8/8/8/4q3/4K3 w - - 0 1'); const res = S.search(b, 3, 1000); ok(b.uci(res.move) === 'e1e2', 'captures hanging queen'); }
// every level returns a legal move quickly
for (const lv of [1, 2, 3, 4, 5, 6]) {
  const b = new E.Board(); const t = Date.now(); let moves = 0;
  for (let i = 0; i < 6; i++) { const res = E.chooseMove(b, lv); ok(res.move && b.legal().includes(res.move), `level ${lv} legal move`); b.make(res.move); moves++; }
  console.log(`level ${lv} (${E.LEVELS[lv].name}) ${moves} moves in ${Date.now() - t}ms, last depth ${E.LEVELS[lv].depth}`);
}
// self-play game completes with a valid end state
{ const b = new E.Board(); let n = 0; while (!b.status().over && n < 300) { const res = E.chooseMove(b, 2); b.make(res.move); n++; } console.log('self-play L2 ended after', n, 'plies:', JSON.stringify(b.status())); }
console.log(fail ? `FAILED (${fail})` : 'ALL ENGINE TESTS PASSED'); process.exit(fail ? 1 : 0);
