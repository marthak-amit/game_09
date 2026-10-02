/* Royal Chess 3D – chess rules + AI engine (no dependencies, no DOM).
   Works in the browser, in a classic Web Worker (importScripts) and in Node (tests).
   Squares: 0..63, a1 = 0, h1 = 7, a8 = 56.  Piece code = type | (color << 3), type 1..6 = P N B R Q K.  */
(function (root) {
  'use strict';
  const WHITE = 0, BLACK = 1, P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const FILES = 'abcdefgh', PCHARS = ' PNBRQK';
  const F_EP = 1, F_CASTLE = 2, F_DOUBLE = 4, F_CAP = 8;
  const CR_WK = 1, CR_WQ = 2, CR_BK = 4, CR_BQ = 8;
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const MATE = 30000, INF = 32000;
  const VAL = [0, 100, 320, 330, 500, 900, 0];

  /* ---------- tables ---------- */
  const sqName = s => FILES[s & 7] + ((s >> 3) + 1);
  const nameSq = n => (n.charCodeAt(0) - 97) + (n.charCodeAt(1) - 49) * 8;
  const KN = [], KG = [], RAYS = [], PAWN_ATK = [[], []];
  const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  (function init() {
    for (let s = 0; s < 64; s++) {
      const f = s & 7, r = s >> 3, kn = [], kg = [], rays = [];
      for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
        const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) kn.push(nr * 8 + nf);
      }
      for (const [df, dr] of DIRS) {
        const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) kg.push(nr * 8 + nf);
        const ray = []; let cf = f + df, cr = r + dr;
        while (cf >= 0 && cf < 8 && cr >= 0 && cr < 8) { ray.push(cr * 8 + cf); cf += df; cr += dr; }
        rays.push(ray);
      }
      KN[s] = kn; KG[s] = kg; RAYS[s] = rays;
      PAWN_ATK[0][s] = []; PAWN_ATK[1][s] = [];
      for (const df of [-1, 1]) {
        if (f + df < 0 || f + df > 7) continue;
        if (r < 7) PAWN_ATK[0][s].push((r + 1) * 8 + f + df);
        if (r > 0) PAWN_ATK[1][s].push((r - 1) * 8 + f + df);
      }
    }
  })();

  /* zobrist (deterministic) */
  let seed = 0x9E3779B9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const ZLO = [], ZHI = [], ZC_LO = [], ZC_HI = [], ZE_LO = [], ZE_HI = [];
  for (let p = 0; p < 16; p++) { ZLO[p] = []; ZHI[p] = []; for (let s = 0; s < 64; s++) { ZLO[p][s] = rnd(); ZHI[p][s] = rnd(); } }
  for (let i = 0; i < 16; i++) { ZC_LO[i] = rnd(); ZC_HI[i] = rnd(); }
  for (let i = 0; i < 8; i++) { ZE_LO[i] = rnd(); ZE_HI[i] = rnd(); }
  const ZS_LO = rnd(), ZS_HI = rnd();

  const CASTLE_MASK = new Int8Array(64).fill(15);
  CASTLE_MASK[0] = 15 & ~CR_WQ; CASTLE_MASK[7] = 15 & ~CR_WK; CASTLE_MASK[4] = 15 & ~(CR_WK | CR_WQ);
  CASTLE_MASK[56] = 15 & ~CR_BQ; CASTLE_MASK[63] = 15 & ~CR_BK; CASTLE_MASK[60] = 15 & ~(CR_BK | CR_BQ);

  /* ---------- evaluation tables (white's view, printed rank 8 -> 1) ---------- */
  const PST = {
    1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    7: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50]
  };

  /* ---------- board ---------- */
  class Board {
    constructor(fen) {
      this.b = new Int8Array(64); this.kingSq = [4, 60];
      this.stM = []; this.stCap = []; this.stCastle = []; this.stEp = []; this.stHalf = []; this.stHlo = []; this.stHhi = [];
      this.hist = []; // position keys of every position reached (for repetition)
      this.load(fen || START_FEN);
    }
    load(fen) {
      const parts = fen.trim().split(/\s+/); this.b.fill(0);
      let r = 7, f = 0;
      for (const ch of parts[0]) {
        if (ch === '/') { r--; f = 0; } else if (ch >= '1' && ch <= '8') f += +ch;
        else { const t = PCHARS.indexOf(ch.toUpperCase()), c = ch === ch.toUpperCase() ? 0 : 1; this.b[r * 8 + f] = t | (c << 3); if (t === K) this.kingSq[c] = r * 8 + f; f++; }
      }
      this.turn = parts[1] === 'b' ? BLACK : WHITE;
      this.castle = 0; const cs = parts[2] || '-';
      if (cs.includes('K')) this.castle |= CR_WK; if (cs.includes('Q')) this.castle |= CR_WQ; if (cs.includes('k')) this.castle |= CR_BK; if (cs.includes('q')) this.castle |= CR_BQ;
      this.ep = parts[3] && parts[3] !== '-' ? nameSq(parts[3]) : -1;
      this.half = parseInt(parts[4] || '0', 10) || 0; this.full = parseInt(parts[5] || '1', 10) || 1;
      this.sp = 0; this.computeHash(); this.hist = [this.key()];
      this.startFen = fen;
    }
    fen() {
      let s = '';
      for (let r = 7; r >= 0; r--) {
        let e = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.b[r * 8 + f];
          if (!p) e++; else { if (e) { s += e; e = 0; } const ch = PCHARS[p & 7]; s += (p >> 3) ? ch.toLowerCase() : ch; }
        }
        if (e) s += e; if (r) s += '/';
      }
      const c = (this.castle & 1 ? 'K' : '') + (this.castle & 2 ? 'Q' : '') + (this.castle & 4 ? 'k' : '') + (this.castle & 8 ? 'q' : '');
      return `${s} ${this.turn ? 'b' : 'w'} ${c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
    }
    computeHash() {
      let lo = 0, hi = 0;
      for (let s = 0; s < 64; s++) { const p = this.b[s]; if (p) { lo ^= ZLO[p][s]; hi ^= ZHI[p][s]; } }
      lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
      if (this.ep >= 0) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
      if (this.turn) { lo ^= ZS_LO; hi ^= ZS_HI; }
      this.hlo = lo; this.hhi = hi;
    }
    key() { return (this.hhi & 0x1FFFFF) * 4294967296 + (this.hlo >>> 0); }

    isAttacked(sq, by) {
      const b = this.b, bc = by << 3;
      for (const s of PAWN_ATK[by ^ 1][sq]) if (b[s] === (P | bc)) return true;
      for (const s of KN[sq]) if (b[s] === (N | bc)) return true;
      for (const s of KG[sq]) if (b[s] === (K | bc)) return true;
      const rays = RAYS[sq];
      for (let d = 0; d < 8; d++) {
        const ray = rays[d], orth = d < 4;
        for (let i = 0; i < ray.length; i++) {
          const p = b[ray[i]]; if (!p) continue;
          if ((p >> 3) === by) { const t = p & 7; if (t === Q || (orth ? t === R : t === B)) return true; }
          break;
        }
      }
      return false;
    }
    inCheck() { return this.isAttacked(this.kingSq[this.turn], this.turn ^ 1); }

    /* pseudo-legal moves */
    gen(capOnly) {
      const mv = [], b = this.b, us = this.turn, them = us ^ 1;
      for (let sq = 0; sq < 64; sq++) {
        const p = b[sq]; if (!p || (p >> 3) !== us) continue;
        const t = p & 7;
        if (t === P) {
          const dir = us ? -8 : 8, rank = sq >> 3, start = us ? 6 : 1, promoFrom = us ? 1 : 6, to = sq + dir;
          if (b[to] === 0) {
            if (rank === promoFrom) { for (let pr = Q; pr >= N; pr--) mv.push(sq | (to << 6) | (pr << 12)); }
            else if (!capOnly) { mv.push(sq | (to << 6)); if (rank === start && b[to + dir] === 0) mv.push(sq | ((to + dir) << 6) | (F_DOUBLE << 16)); }
          }
          for (const tt of PAWN_ATK[us][sq]) {
            const tp = b[tt];
            if (tp && (tp >> 3) === them) {
              if (rank === promoFrom) { for (let pr = Q; pr >= N; pr--) mv.push(sq | (tt << 6) | (pr << 12) | (F_CAP << 16)); }
              else mv.push(sq | (tt << 6) | (F_CAP << 16));
            } else if (tt === this.ep && !tp) mv.push(sq | (tt << 6) | ((F_EP | F_CAP) << 16));
          }
        } else if (t === N || t === K) {
          for (const tt of (t === N ? KN[sq] : KG[sq])) {
            const tp = b[tt];
            if (!tp) { if (!capOnly) mv.push(sq | (tt << 6)); }
            else if ((tp >> 3) === them) mv.push(sq | (tt << 6) | (F_CAP << 16));
          }
        } else {
          const rays = RAYS[sq], d0 = t === B ? 4 : 0, d1 = t === R ? 4 : 8;
          for (let d = d0; d < d1; d++) {
            const ray = rays[d];
            for (let i = 0; i < ray.length; i++) {
              const tt = ray[i], tp = b[tt];
              if (!tp) { if (!capOnly) mv.push(sq | (tt << 6)); continue; }
              if ((tp >> 3) === them) mv.push(sq | (tt << 6) | (F_CAP << 16));
              break;
            }
          }
        }
      }
      if (!capOnly) {
        if (us === WHITE && this.kingSq[0] === 4) {
          if ((this.castle & CR_WK) && !b[5] && !b[6] && !this.isAttacked(4, 1) && !this.isAttacked(5, 1) && !this.isAttacked(6, 1)) mv.push(4 | (6 << 6) | (F_CASTLE << 16));
          if ((this.castle & CR_WQ) && !b[3] && !b[2] && !b[1] && !this.isAttacked(4, 1) && !this.isAttacked(3, 1) && !this.isAttacked(2, 1)) mv.push(4 | (2 << 6) | (F_CASTLE << 16));
        } else if (us === BLACK && this.kingSq[1] === 60) {
          if ((this.castle & CR_BK) && !b[61] && !b[62] && !this.isAttacked(60, 0) && !this.isAttacked(61, 0) && !this.isAttacked(62, 0)) mv.push(60 | (62 << 6) | (F_CASTLE << 16));
          if ((this.castle & CR_BQ) && !b[59] && !b[58] && !b[57] && !this.isAttacked(60, 0) && !this.isAttacked(59, 0) && !this.isAttacked(58, 0)) mv.push(60 | (58 << 6) | (F_CASTLE << 16));
        }
      }
      return mv;
    }

    make(m) {
      const b = this.b, from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, flag = (m >> 16) & 15;
      const p = b[from], us = p >> 3, i = this.sp++;
      let cap = b[to];
      this.stM[i] = m; this.stCastle[i] = this.castle; this.stEp[i] = this.ep; this.stHalf[i] = this.half; this.stHlo[i] = this.hlo; this.stHhi[i] = this.hhi;
      let lo = this.hlo, hi = this.hhi;
      if (this.ep >= 0) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
      lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
      lo ^= ZLO[p][from]; hi ^= ZHI[p][from];
      b[from] = 0;
      if (flag & F_EP) {
        const cs = us ? to + 8 : to - 8; cap = b[cs]; b[cs] = 0; lo ^= ZLO[cap][cs]; hi ^= ZHI[cap][cs];
      } else if (cap) { lo ^= ZLO[cap][to]; hi ^= ZHI[cap][to]; }
      this.stCap[i] = cap;
      const np = promo ? (promo | (us << 3)) : p;
      b[to] = np; lo ^= ZLO[np][to]; hi ^= ZHI[np][to];
      if (flag & F_CASTLE) {
        let rf, rt; if (to > from) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
        const rk = b[rf]; b[rf] = 0; b[rt] = rk; lo ^= ZLO[rk][rf] ^ ZLO[rk][rt]; hi ^= ZHI[rk][rf] ^ ZHI[rk][rt];
      }
      if ((p & 7) === K) this.kingSq[us] = to;
      this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
      this.ep = (flag & F_DOUBLE) ? (from + to) >> 1 : -1;
      if (this.ep >= 0) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
      lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
      lo ^= ZS_LO; hi ^= ZS_HI;
      this.hlo = lo; this.hhi = hi;
      this.half = ((p & 7) === P || cap) ? 0 : this.half + 1;
      if (us) this.full++;
      this.turn ^= 1;
      this.hist.push(this.key());
    }
    unmake() {
      const i = --this.sp, m = this.stM[i], b = this.b, from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, flag = (m >> 16) & 15;
      this.turn ^= 1; const us = this.turn;
      if (us) this.full--;
      const p = promo ? (P | (us << 3)) : b[to];
      b[from] = p; b[to] = 0;
      const cap = this.stCap[i];
      if (flag & F_EP) { b[us ? to + 8 : to - 8] = cap; }
      else if (cap) b[to] = cap;
      if (flag & F_CASTLE) {
        let rf, rt; if (to > from) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
        b[rf] = b[rt]; b[rt] = 0;
      }
      if ((p & 7) === K) this.kingSq[us] = from;
      this.castle = this.stCastle[i]; this.ep = this.stEp[i]; this.half = this.stHalf[i]; this.hlo = this.stHlo[i]; this.hhi = this.stHhi[i];
      this.hist.pop();
    }
    makeNull() {
      const i = this.sp++; this.stM[i] = 0; this.stEp[i] = this.ep; this.stHlo[i] = this.hlo; this.stHhi[i] = this.hhi; this.stHalf[i] = this.half;
      if (this.ep >= 0) { this.hlo ^= ZE_LO[this.ep & 7]; this.hhi ^= ZE_HI[this.ep & 7]; }
      this.ep = -1; this.hlo ^= ZS_LO; this.hhi ^= ZS_HI; this.turn ^= 1; this.half++; this.hist.push(this.key());
    }
    unmakeNull() {
      const i = --this.sp; this.turn ^= 1; this.ep = this.stEp[i]; this.hlo = this.stHlo[i]; this.hhi = this.stHhi[i]; this.half = this.stHalf[i]; this.hist.pop();
    }

    legal() {
      const out = [], us = this.turn;
      for (const m of this.gen(false)) {
        this.make(m);
        if (!this.isAttacked(this.kingSq[us], us ^ 1)) out.push(m);
        this.unmake();
      }
      return out;
    }
    legalFrom(sq) { return this.legal().filter(m => (m & 63) === sq); }

    /* ---------- notation ---------- */
    uci(m) { const pr = (m >> 12) & 7; return sqName(m & 63) + sqName((m >> 6) & 63) + (pr ? PCHARS[pr].toLowerCase() : ''); }
    parseUci(s, moves) {
      moves = moves || this.legal();
      for (const m of moves) if (this.uci(m) === s) return m;
      return 0;
    }
    san(m, moves) {
      moves = moves || this.legal();
      const from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, flag = (m >> 16) & 15, t = this.b[from] & 7;
      let s;
      if (flag & F_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
      else {
        s = '';
        if (t !== P) {
          s += PCHARS[t];
          let sameFile = false, sameRank = false, other = false;
          for (const o of moves) {
            if (o === m || ((o >> 6) & 63) !== to || (this.b[o & 63] & 7) !== t) continue;
            other = true; if ((o & 7) === (from & 7)) sameFile = true; if (((o & 63) >> 3) === (from >> 3)) sameRank = true;
          }
          if (other) { if (!sameFile) s += FILES[from & 7]; else if (!sameRank) s += (from >> 3) + 1; else s += sqName(from); }
        } else if (flag & F_CAP) s += FILES[from & 7];
        if (flag & F_CAP) s += 'x';
        s += sqName(to);
        if (promo) s += '=' + PCHARS[promo];
      }
      this.make(m);
      if (this.inCheck()) s += this.legal().length ? '+' : '#';
      this.unmake();
      return s;
    }

    /* ---------- game state ---------- */
    insufficient() {
      let minors = 0, bishopsW = 0, bishopsB = 0;
      for (let s = 0; s < 64; s++) {
        const p = this.b[s]; if (!p) continue; const t = p & 7;
        if (t === P || t === R || t === Q) return false;
        if (t === N) minors++;
        if (t === B) { minors++; ((s >> 3) + (s & 7)) & 1 ? bishopsB++ : bishopsW++; }
      }
      if (minors <= 1) return true;
      if (minors === (bishopsW + bishopsB) && (bishopsW === 0 || bishopsB === 0)) return true; // only same-colour bishops
      return false;
    }
    repetitions() { const k = this.key(); let n = 0; for (const h of this.hist) if (h === k) n++; return n; }
    /** {over, result:'1-0'|'0-1'|'1/2-1/2', reason, check} */
    status() {
      const moves = this.legal(), chk = this.inCheck();
      if (!moves.length) return chk ? { over: true, result: this.turn ? '1-0' : '0-1', reason: 'checkmate', check: true } : { over: true, result: '1/2-1/2', reason: 'stalemate', check: false };
      if (this.insufficient()) return { over: true, result: '1/2-1/2', reason: 'insufficient material', check: chk };
      if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule', check: chk };
      if (this.repetitions() >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition', check: chk };
      return { over: false, check: chk };
    }

    perft(d) {
      if (d === 0) return 1;
      let n = 0;
      for (const m of this.legal()) { this.make(m); n += d === 1 ? 1 : this.perft(d - 1); this.unmake(); }
      return n;
    }

    /* ---------- evaluation (centipawns, side-to-move view) ---------- */
    evaluate() {
      const b = this.b; let mat = 0, nonPawn = 0; const bishops = [0, 0];
      for (let s = 0; s < 64; s++) { const p = b[s]; if (p) { const t = p & 7; if (t !== P && t !== K) nonPawn += VAL[t]; } }
      const endgame = nonPawn <= 2600 - 1300 ? true : nonPawn < 1500;
      let score = 0; const pawnFiles = [new Int8Array(8), new Int8Array(8)];
      for (let s = 0; s < 64; s++) {
        const p = b[s]; if (!p) continue; const t = p & 7, c = p >> 3;
        if (t === P) pawnFiles[c][s & 7]++;
      }
      for (let s = 0; s < 64; s++) {
        const p = b[s]; if (!p) continue; const t = p & 7, c = p >> 3;
        const tab = t === K && endgame ? PST[7] : PST[t];
        let v = VAL[t] + tab[c ? s : s ^ 56];
        if (t === B) bishops[c]++;
        if (t === P) {
          const f = s & 7, r = c ? 7 - (s >> 3) : s >> 3;
          if (pawnFiles[c][f] > 1) v -= 12;
          if ((f === 0 || !pawnFiles[c][f - 1]) && (f === 7 || !pawnFiles[c][f + 1])) v -= 12;
          let passed = true;
          for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1) && passed; ff++) {
            for (let rr = r + 1; rr < 7; rr++) { const sq = c ? (7 - rr) * 8 + ff : rr * 8 + ff; if (b[sq] === (P | ((c ^ 1) << 3))) { passed = false; break; } }
          }
          if (passed) v += 8 + r * r * 3;
        }
        score += c ? -v : v;
      }
      if (bishops[0] >= 2) score += 30; if (bishops[1] >= 2) score -= 30;
      return (this.turn ? -score : score) + 10;
    }
  }

  /* ---------- search ---------- */
  const TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  class Searcher {
    constructor() {
      this.ttLo = new Int32Array(TT_SIZE); this.ttHi = new Int32Array(TT_SIZE); this.ttMove = new Int32Array(TT_SIZE);
      this.ttScore = new Int16Array(TT_SIZE); this.ttDepth = new Int8Array(TT_SIZE).fill(-1); this.ttFlag = new Int8Array(TT_SIZE);
      this.killers = []; this.history = new Int32Array(64 * 64);
    }
    clear() { this.ttDepth.fill(-1); this.history.fill(0); }
    timeUp() { return this.stop || (this.nodes & 1023) === 0 && Date.now() > this.deadline && (this.stop = true); }

    orderMoves(bd, moves, ttMove, ply) {
      const b = bd.b, sc = new Array(moves.length), k = this.killers[ply] || [];
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i], to = (m >> 6) & 63, from = m & 63; let s = 0;
        if (m === ttMove) s = 1e7;
        else if ((m >> 16) & F_CAP) { const v = (m >> 16) & F_EP ? P : (b[to] & 7); s = 1e6 + VAL[v] * 10 - VAL[b[from] & 7] / 10; }
        else if ((m >> 12) & 7) s = 9e5;
        else if (m === k[0]) s = 8e5; else if (m === k[1]) s = 7e5;
        else s = this.history[from * 64 + to];
        sc[i] = s;
      }
      const idx = moves.map((_, i) => i).sort((a, c) => sc[c] - sc[a]);
      return idx.map(i => moves[i]);
    }

    quiesce(bd, alpha, beta, ply) {
      this.nodes++;
      if (this.timeUp()) return 0;
      const stand = bd.evaluate();
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (ply > 40) return stand;
      const moves = this.orderMoves(bd, bd.gen(true), 0, ply), us = bd.turn;
      for (const m of moves) {
        const cv = ((m >> 16) & F_EP) ? 100 : VAL[bd.b[(m >> 6) & 63] & 7];
        if (!((m >> 12) & 7) && stand + cv + 200 < alpha) continue;
        bd.make(m);
        if (bd.isAttacked(bd.kingSq[us], us ^ 1)) { bd.unmake(); continue; }
        const s = -this.quiesce(bd, -beta, -alpha, ply + 1);
        bd.unmake();
        if (this.stop) return 0;
        if (s >= beta) return s;
        if (s > alpha) alpha = s;
      }
      return alpha;
    }

    negamax(bd, depth, alpha, beta, ply, allowNull) {
      this.nodes++;
      if (this.timeUp()) return 0;
      if (ply > 0) {
        if (bd.half >= 100) return 0;
        // repetition / draw inside search
        const k = bd.key(), h = bd.hist; let reps = 0;
        for (let i = h.length - 3; i >= 0 && i >= h.length - 1 - bd.half; i -= 2) if (h[i] === k && ++reps >= 1) return 0;
      }
      const inChk = bd.inCheck();
      if (inChk) depth++;
      if (depth <= 0) return this.quiesce(bd, alpha, beta, ply);
      const idx = bd.hlo & TT_MASK; let ttMove = 0;
      if (this.ttDepth[idx] >= 0 && this.ttLo[idx] === bd.hlo && this.ttHi[idx] === bd.hhi) {
        ttMove = this.ttMove[idx];
        if (this.ttDepth[idx] >= depth && ply > 0) {
          let s = this.ttScore[idx]; if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
          const f = this.ttFlag[idx];
          if (f === 0) return s; if (f === 1 && s >= beta) return s; if (f === 2 && s <= alpha) return s;
        }
      }
      // null move pruning
      if (allowNull && !inChk && depth >= 3 && ply > 0) {
        let np = 0; const c = bd.turn;
        for (let s = 0; s < 64; s++) { const p = bd.b[s]; if (p && (p >> 3) === c && (p & 7) > P && (p & 7) < K) { np = 1; break; } }
        if (np) {
          bd.makeNull();
          const s = -this.negamax(bd, depth - 1 - (depth > 6 ? 3 : 2), -beta, -beta + 1, ply + 1, false);
          bd.unmakeNull();
          if (this.stop) return 0;
          if (s >= beta) return beta;
        }
      }
      const us = bd.turn, moves = this.orderMoves(bd, bd.gen(false), ttMove, ply);
      let best = -INF, bestMove = 0, legal = 0, flag = 2; const origAlpha = alpha;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i], quiet = !((m >> 16) & F_CAP) && !((m >> 12) & 7);
        bd.make(m);
        if (bd.isAttacked(bd.kingSq[us], us ^ 1)) { bd.unmake(); continue; }
        legal++;
        let s;
        if (legal > 4 && depth >= 3 && quiet && !inChk) {
          s = -this.negamax(bd, depth - 2, -alpha - 1, -alpha, ply + 1, true);
          if (s > alpha) s = -this.negamax(bd, depth - 1, -beta, -alpha, ply + 1, true);
        } else s = -this.negamax(bd, depth - 1, -beta, -alpha, ply + 1, true);
        bd.unmake();
        if (this.stop) return 0;
        if (s > best) { best = s; bestMove = m; }
        if (s > alpha) {
          alpha = s; flag = 0;
          if (alpha >= beta) {
            if (quiet) { const kl = this.killers[ply] || (this.killers[ply] = [0, 0]); if (kl[0] !== m) { kl[1] = kl[0]; kl[0] = m; } this.history[(m & 63) * 64 + ((m >> 6) & 63)] += depth * depth; }
            flag = 1; break;
          }
        }
      }
      if (!legal) return inChk ? -MATE + ply : 0;
      if (flag === 0 && best <= origAlpha) flag = 2;
      let st = best; if (st > MATE - 200) st += ply; else if (st < -MATE + 200) st -= ply;
      if (depth >= this.ttDepth[idx] || this.ttLo[idx] !== bd.hlo) {
        this.ttLo[idx] = bd.hlo; this.ttHi[idx] = bd.hhi; this.ttMove[idx] = bestMove; this.ttScore[idx] = st; this.ttDepth[idx] = depth; this.ttFlag[idx] = flag;
      }
      return best;
    }

    /** Iterative deepening. Returns {move, score, depth, nodes}. */
    search(bd, maxDepth, timeMs) {
      this.nodes = 0; this.stop = false; this.deadline = Date.now() + timeMs; this.killers = [];
      const rootMoves = bd.legal(); if (!rootMoves.length) return { move: 0, score: 0, depth: 0, nodes: 0 };
      let best = rootMoves[0], bestScore = 0, done = 0;
      let ordered = this.orderMoves(bd, rootMoves, 0, 0);
      for (let d = 1; d <= maxDepth; d++) {
        let alpha = -INF, iterBest = 0, iterScore = -INF; const us = bd.turn;
        for (const m of ordered) {
          bd.make(m);
          const s = -this.negamax(bd, d - 1, -INF, -alpha, 1, true);
          bd.unmake();
          if (this.stop) break;
          if (s > iterScore) { iterScore = s; iterBest = m; }
          if (s > alpha) alpha = s;
        }
        if (this.stop) { if (iterBest && d > 1 && false) { best = iterBest; } break; }
        best = iterBest; bestScore = iterScore; done = d;
        ordered = [best].concat(ordered.filter(m => m !== best));
        if (Math.abs(bestScore) > MATE - 100) break;
        if (Date.now() > this.deadline) break;
      }
      return { move: best, score: bestScore, depth: done, nodes: this.nodes };
    }

    /** score every root move at a fixed depth (used for weaker, human-like levels) */
    scoreRoot(bd, depth, timeMs) {
      this.nodes = 0; this.stop = false; this.deadline = Date.now() + timeMs; this.killers = [];
      const out = [];
      for (const m of bd.legal()) {
        bd.make(m);
        const s = -this.negamax(bd, depth - 1, -INF, INF, 1, false);
        bd.unmake();
        out.push({ move: m, score: this.stop ? -INF : s });
      }
      return out;
    }
  }

  const LEVELS = {
    1: { name: 'Beginner', elo: 600, depth: 1, temp: 260 },
    2: { name: 'Easy', elo: 900, depth: 2, temp: 110 },
    3: { name: 'Casual', elo: 1200, depth: 3, temp: 45 },
    4: { name: 'Club', elo: 1500, depth: 4, temp: 0, time: 1800 },
    5: { name: 'Advanced', elo: 1800, depth: 6, temp: 0, time: 2500 },
    6: { name: 'Master', elo: 2000, depth: 9, temp: 0, time: 4000 }
  };
  let _searcher = null;
  /** Pick a move for the side to move. `bd` must contain the full game history. */
  function chooseMove(bd, level, rng) {
    rng = rng || Math.random;
    const cfg = LEVELS[level] || LEVELS[3];
    const s = _searcher || (_searcher = new Searcher());
    if (!bd.legal().length) return { move: 0 };
    if (cfg.temp > 0) {
      const sc = s.scoreRoot(bd, cfg.depth, 3000);
      const top = Math.max(...sc.map(x => x.score));
      let tot = 0; const w = sc.map(x => { const e = Math.exp((x.score - top) / cfg.temp); tot += e; return e; });
      let r = rng() * tot, i = 0; for (; i < w.length; i++) { if ((r -= w[i]) < 0) break; }
      const pick = sc[Math.min(i, sc.length - 1)];
      return { move: pick.move, score: pick.score, depth: cfg.depth };
    }
    return s.search(bd, cfg.depth, cfg.time);
  }

  root.ChessEngine = { Board, Searcher, chooseMove, LEVELS, START_FEN, sqName, nameSq, PCHARS, FILES, WHITE, BLACK, P, N, B, R, Q, K, F_EP, F_CASTLE, F_DOUBLE, F_CAP, VAL, MATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChessEngine;
})(typeof self !== 'undefined' ? self : globalThis);
