/* Deterministic chain-reaction simulation (no DOM). Used by game AND level solver. */
const GROW = 0.25, HOLD = 0.45, SHRINK = 0.25, TOTAL = GROW + HOLD + SHRINK;

function exRadius(e) {
  const t = e.t;
  if (t < GROW) { const k = t / GROW; return e.R * (1 - (1 - k) * (1 - k)); }
  if (t < GROW + HOLD) return e.R;
  return e.R * Math.max(0, 1 - (t - GROW - HOLD) / SHRINK);
}

function makeState(def) {
  return {
    orbs: def.orbs.map((o, i) => ({
      id: i + 1, x: o.x, y: o.y, vx: o.vx, vy: o.vy, type: o.type, c: o.c,
      r: TYPES[o.type].r, blast: TYPES[o.type].blast, hp: TYPES[o.type].hp || 1,
      alive: true, hitId: 0, flash: 0
    })),
    pillars: def.pillars.map(p => ({ x: p.x, y: p.y, r: p.r })),
    expl: [], t: 0, nextEx: 1, frozen: false, freezeUntilSettled: false, roots: {}
  };
}

function cloneState(s) {
  return {
    orbs: s.orbs.map(o => Object.assign({}, o)), pillars: s.pillars,
    expl: s.expl.map(e => Object.assign({}, e)), t: s.t, nextEx: s.nextEx,
    frozen: s.frozen, freezeUntilSettled: s.freezeUntilSettled, roots: Object.assign({}, s.roots)
  };
}

function addExplosion(s, x, y, R, chain, root, color) {
  s.expl.push({ id: s.nextEx++, x, y, R, t: 0, chain, root, color });
}

function aliveCount(s) { let n = 0; for (const o of s.orbs) if (o.alive) n++; return n; }

function step(s, dt, ev) {
  const W = CFG.W, H = CFG.H;
  if (!s.frozen) {
    for (const o of s.orbs) {
      if (!o.alive || TYPES[o.type].static) continue;
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < o.r) { o.x = o.r; o.vx = Math.abs(o.vx); }
      else if (o.x > W - o.r) { o.x = W - o.r; o.vx = -Math.abs(o.vx); }
      if (o.y < o.r) { o.y = o.r; o.vy = Math.abs(o.vy); }
      else if (o.y > H - o.r) { o.y = H - o.r; o.vy = -Math.abs(o.vy); }
      for (const p of s.pillars) {
        const dx = o.x - p.x, dy = o.y - p.y, min = o.r + p.r, d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 0) {
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          o.x = p.x + nx * min; o.y = p.y + ny * min;
          const dot = o.vx * nx + o.vy * ny;
          if (dot < 0) { o.vx -= 2 * dot * nx; o.vy -= 2 * dot * ny; }
        }
      }
    }
  }
  for (let i = 0; i < s.expl.length; i++) {
    const e = s.expl[i];
    e.t += dt;
    const R = exRadius(e);
    for (const o of s.orbs) {
      if (!o.alive || o.hitId === e.id) continue;
      const dx = o.x - e.x, dy = o.y - e.y, rr = R + o.r * 0.5;
      if (dx * dx + dy * dy < rr * rr) {
        if (o.hp > 1) { o.hp--; o.hitId = e.id; o.flash = 1; if (ev) ev.push({ k: 'crack', o }); }
        else {
          o.alive = false;
          const n = (s.roots[e.root] = (s.roots[e.root] || 0) + 1);
          addExplosion(s, o.x, o.y, o.blast, e.chain + 1, e.root, o.c);
          if (ev) ev.push({ k: 'pop', o, n, chain: e.chain + 1, root: e.root });
        }
      }
    }
  }
  s.expl = s.expl.filter(e => e.t < TOTAL);
  if (s.freezeUntilSettled && s.expl.length === 0) { s.frozen = false; s.freezeUntilSettled = false; }
  s.t += dt;
}
