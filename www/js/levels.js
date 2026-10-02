/* Procedural, seeded, solver-verified levels. Same level number => same level on every device. */
function worldFor(n) { return WORLDS[Math.floor((Math.max(1, n) - 1) / 10) % WORLDS.length]; }

function pickType(R, n, daily) {
  const eff = daily ? Math.max(n, 14) : n;
  const w = [['basic', 60]];
  if (eff >= 3) w.push(['big', 14]);
  if (eff >= 5) w.push(['anchor', 10]);
  if (eff >= 6) w.push(['bomb', 8]);
  if (eff >= 12) w.push(['armor', 10 + Math.min(10, (eff - 12) / 3)]);
  if (eff >= 3) w.push(['gold', 5]);
  let tot = 0; for (const x of w) tot += x[1];
  let r = R() * tot;
  for (const x of w) { if ((r -= x[1]) < 0) return x[0]; }
  return 'basic';
}

function genRaw(n, seed, daily) {
  const R = mulberry(seed), W = CFG.W, H = CFG.H;
  const eff = daily ? Math.max(n, 14) : n;
  const count = Math.min(5 + Math.floor(eff * 0.75), 38);
  const spread = Math.min(1, eff / 45);
  const speed = 16 + Math.min(eff, 60) * 0.6;
  const pillars = [];
  if (eff >= 8) {
    const pc = Math.min(1 + Math.floor((eff - 8) / 12), 4);
    for (let i = 0; i < pc; i++) {
      for (let t = 0; t < 30; t++) {
        const r = 22 + R() * 8, x = 70 + R() * (W - 140), y = 90 + R() * (H - 180);
        if (pillars.every(p => Math.hypot(p.x - x, p.y - y) > p.r + r + 60)) { pillars.push({ x, y, r }); break; }
      }
    }
  }
  const orbs = [];
  for (let i = 0; i < count; i++) {
    const type = (n <= 2 && !daily) ? 'basic' : pickType(R, n, daily), r = TYPES[type].r;
    for (let t = 0; t < 80; t++) {
      let x, y;
      if (orbs.length && R() < 0.92 - 0.75 * spread) {
        const b = orbs[Math.floor(R() * orbs.length)], a = R() * 6.283, d = 32 + R() * 30;
        x = b.x + Math.cos(a) * d; y = b.y + Math.sin(a) * d;
      } else { x = 30 + R() * (W - 60); y = 30 + R() * (H - 60); }
      x = clamp(x, r + 4, W - r - 4); y = clamp(y, r + 4, H - r - 4);
      if (orbs.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r + 6)) continue;
      if (pillars.some(p => Math.hypot(p.x - x, p.y - y) < p.r + r + 8)) continue;
      const a = R() * 6.283, sp = TYPES[type].static ? 0 : speed * (0.6 + R() * 0.6);
      orbs.push({ x, y, r, type, c: Math.floor(R() * 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
      break;
    }
  }
  return { orbs, pillars };
}

/* Greedy Monte-Carlo solver -> "par" (number of taps a sensible player needs). */
function solve(def, seed) {
  const R = mulberry(seed ^ 0x9e3779b9), dt = 1 / 60, K = 24;
  let s = makeState(def), taps = 0;
  while (aliveCount(s) > 0 && taps < 14) {
    const before = aliveCount(s);
    let best = null, bestScore = -1;
    for (let k = 0; k < K; k++) {
      const c = cloneState(s), wait = Math.floor(R() * 90);
      for (let i = 0; i < wait; i++) step(c, dt);
      const alive = c.orbs.filter(o => o.alive);
      if (!alive.length) break;
      const b = alive[Math.floor(R() * alive.length)], a = R() * 6.283, d = R() * 42;
      const x = clamp(b.x + Math.cos(a) * d, 0, CFG.W), y = clamp(b.y + Math.sin(a) * d, 0, CFG.H);
      if (c.pillars.some(p => Math.hypot(p.x - x, p.y - y) < p.r)) continue;
      addExplosion(c, x, y, CFG.tapRadius, 0, 0, 0);
      for (let i = 0; i < 260 && c.expl.length; i++) step(c, dt);
      const score = before - aliveCount(c) + R() * 0.01;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best) return 99;
    s = best; taps++;
  }
  return aliveCount(s) === 0 ? taps : 99;
}

const _lvlCache = {};
function genLevel(n, dailyKey) {
  const key = dailyKey ? 'd' + dailyKey : 'l' + n;
  if (_lvlCache[key]) return _lvlCache[key];
  const eff = dailyKey ? Math.max(n, 14) : n;
  const maxPar = Math.min(2 + Math.floor(eff / 5), 9);
  let def, par = 99;
  for (let att = 0; att < 8; att++) {
    const seed = hashStr(key) + att * 7919;
    def = genRaw(n, seed, !!dailyKey);
    par = solve(def, seed);
    if (par <= maxPar) break;
  }
  if (par > maxPar) par = maxPar;
  const slack = eff < 10 ? 2 : 1;
  def.n = n; def.par = par; def.taps = par + slack; def.world = worldFor(n); def.daily = !!dailyKey;
  return (_lvlCache[key] = def);
}
