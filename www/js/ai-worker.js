/* Chess AI in a Web Worker so the 3D scene never stutters while the computer thinks. */
importScripts('chess-engine.js');
const E = self.ChessEngine; let searcher = null;
self.onmessage = ev => {
  const { id, startFen, moves, level, hint } = ev.data;
  try {
    const b = new E.Board(startFen); for (const m of moves) b.make(m);
    let res;
    if (hint) { searcher = searcher || new E.Searcher(); res = searcher.search(b, 5, 1500); }
    else res = E.chooseMove(b, level);
    self.postMessage({ id, move: res.move, score: res.score || 0, depth: res.depth || 0 });
  } catch (e) { self.postMessage({ id, error: String(e) }); }
};
