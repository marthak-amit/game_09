class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.parts = []; this.rings = []; this.pops = []; this.shake = 0; this.t = 0;
    this.stars = Array.from({ length: 46 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.6, v: 0.01 + Math.random() * 0.03 }));
    this.resize();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = this.cv.getBoundingClientRect();
    this.cv.width = Math.max(1, r.width * dpr); this.cv.height = Math.max(1, r.height * dpr);
    this.dpr = dpr; this.cw = r.width; this.ch = r.height;
    const m = 8; this.k = Math.min((this.cw - m * 2) / CFG.W, (this.ch - m * 2) / CFG.H);
    this.ox = (this.cw - CFG.W * this.k) / 2; this.oy = (this.ch - CFG.H * this.k) / 2;
  }
  toLogical(cx, cy) { const r = this.cv.getBoundingClientRect(); return { x: (cx - r.left - this.ox) / this.k, y: (cy - r.top - this.oy) / this.k }; }

  burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = (0.3 + Math.random()) * speed;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, max: 1, s: 1.5 + Math.random() * 3, color });
    }
  }
  popFx(o, color, chain) {
    this.burst(o.x, o.y, color, 9, 110 + Math.min(chain, 20) * 4);
    this.rings.push({ x: o.x, y: o.y, r: o.r, life: 0.35, max: 0.35, color });
    this.shake = Math.min(7, this.shake + 0.5 + chain * 0.12);
  }
  text(x, y, str, color, size) { this.pops.push({ x, y, str, color, size: size || 16, life: 1, max: 1 }); }

  update(dt) {
    this.t += dt; this.shake *= Math.pow(0.001, dt);
    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; p.vy += 40 * dt; }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const r of this.rings) r.life -= dt; this.rings = this.rings.filter(r => r.life > 0);
    for (const p of this.pops) { p.life -= dt; p.y -= 26 * dt; } this.pops = this.pops.filter(p => p.life > 0);
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }

  draw(s, world, skin, opts) {
    const c = this.ctx; opts = opts || {};
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, this.ch); g.addColorStop(0, world.bg1); g.addColorStop(1, world.bg2);
    c.fillStyle = g; c.fillRect(0, 0, this.cw, this.ch);
    c.fillStyle = '#fff';
    for (const st of this.stars) { st.y = (st.y + st.v * 0.016) % 1; c.globalAlpha = 0.25 + 0.3 * Math.sin(this.t * 2 + st.x * 20); c.fillRect(st.x * this.cw, st.y * this.ch, st.s, st.s); }
    c.globalAlpha = 1;
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    c.save(); c.translate(this.ox + sx, this.oy + sy); c.scale(this.k, this.k);
    // arena
    if (!opts.noArena) { this.rr(c, 0, 0, CFG.W, CFG.H, 18); c.fillStyle = 'rgba(0,0,0,0.22)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.22)'; c.stroke(); }
    if (s) {
      for (const p of s.pillars) this.pillar(c, p, world);
      const colors = skin.colors;
      for (const e of s.expl) this.expl(c, e, world, colors);
      for (const o of s.orbs) if (o.alive) this.orb(c, o, s, colors, world);
    }
    // particles (additive)
    c.globalCompositeOperation = 'lighter';
    for (const r of this.rings) { const k = 1 - r.life / r.max; c.globalAlpha = (1 - k) * 0.9; c.strokeStyle = r.color; c.lineWidth = 3; c.beginPath(); c.arc(r.x, r.y, r.r + k * 26, 0, 6.283); c.stroke(); }
    for (const p of this.parts) { c.globalAlpha = Math.max(0, p.life / p.max); c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.s * Math.max(0.3, p.life), 0, 6.283); c.fill(); }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const p of this.pops) {
      c.globalAlpha = Math.min(1, p.life * 2); const sc = 1 + (1 - p.life) * 0.2;
      c.font = `900 ${p.size * sc}px system-ui, sans-serif`; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.strokeText(p.str, p.x, p.y); c.fillStyle = p.color; c.fillText(p.str, p.x, p.y);
    }
    c.globalAlpha = 1;
    if (opts.hint) { // tutorial: pulsing target + finger
      const k = (Math.sin(this.t * 5) + 1) / 2;
      c.strokeStyle = '#fff'; c.globalAlpha = 0.5 + k * 0.4; c.lineWidth = 3; c.beginPath(); c.arc(opts.hint.x, opts.hint.y, 34 + k * 12, 0, 6.283); c.stroke(); c.globalAlpha = 1;
      c.font = '34px system-ui'; c.textAlign = 'center'; c.fillText('👆', opts.hint.x + 6, opts.hint.y + 40 + k * 8);
    }
    if (opts.ghost) { // aim preview
      const g = opts.ghost, a = 0.5 + 0.2 * Math.sin(this.t * 10);
      c.fillStyle = 'rgba(255,255,255,0.10)'; c.beginPath(); c.arc(g.x, g.y, g.r, 0, 6.283); c.fill();
      c.strokeStyle = g.bad ? 'rgba(255,100,100,0.9)' : 'rgba(255,255,255,' + a + ')'; c.setLineDash([7, 6]); c.lineWidth = 2.5; c.lineDashOffset = -this.t * 30;
      c.beginPath(); c.arc(g.x, g.y, g.r, 0, 6.283); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(g.x, g.y, 3, 0, 6.283); c.fill();
    }
    c.restore();
    if (s && s.frozen) { c.fillStyle = 'rgba(140,220,255,0.12)'; c.fillRect(0, 0, this.cw, this.ch); }
  }
  rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  pillar(c, p, world) {
    const g = c.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, 2, p.x, p.y, p.r);
    g.addColorStop(0, '#4a4a6a'); g.addColorStop(1, '#17172b');
    c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.fill();
    c.strokeStyle = world.accent; c.globalAlpha = 0.6; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.arc(p.x, p.y, p.r * 0.55, 0, 6.283); c.stroke(); c.globalAlpha = 1;
  }
  expl(c, e, world, colors) {
    const R = exRadius(e); if (R <= 0.5) return;
    const col = (typeof e.color === 'number' && e.chain > 0) ? colors[e.color % colors.length] : world.accent;
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(e.x, e.y, R * 0.2, e.x, e.y, R);
    g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.75, col + '55'); g.addColorStop(1, col + 'cc');
    c.fillStyle = g; c.beginPath(); c.arc(e.x, e.y, R, 0, 6.283); c.fill();
    c.strokeStyle = '#fff'; c.globalAlpha = 0.8; c.lineWidth = 2; c.stroke(); c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  orb(c, o, s, colors, world) {
    const T = o.type, col = T === 'bomb' ? '#2b2b3d' : T === 'gold' ? '#ffd700' : T === 'armor' ? '#aab4c8' : colors[o.c % colors.length];
    // look target
    let lx = o.vx, ly = o.vy, scared = false, best = 1e9;
    for (const e of s.expl) { const d = Math.hypot(e.x - o.x, e.y - o.y); if (d < best) { best = d; lx = e.x - o.x; ly = e.y - o.y; scared = d < e.R + 70; } }
    const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll;
    c.save(); c.translate(o.x, o.y);
    const wob = 1 + Math.sin(this.t * 4 + o.id) * 0.03 + (scared ? Math.sin(this.t * 40) * 0.04 : 0);
    c.scale(wob, 2 - wob);
    // glow
    c.globalAlpha = 0.35; c.fillStyle = col; c.beginPath(); c.arc(0, 0, o.r * 1.5, 0, 6.283); c.fill(); c.globalAlpha = 1;
    const g = c.createRadialGradient(-o.r * 0.35, -o.r * 0.4, 1, 0, 0, o.r);
    g.addColorStop(0, '#fff'); g.addColorStop(0.25, col); g.addColorStop(1, shade(col, -0.35));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, o.r, 0, 6.283); c.fill();
    if (T === 'anchor') { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, o.r + 3, 0, 6.283); c.stroke(); }
    if (T === 'armor') { c.strokeStyle = o.hp > 1 ? '#eef' : '#f66'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, o.r - 1.5, 0, 6.283); c.stroke();
      if (o.hp <= 1) { c.beginPath(); c.moveTo(-o.r * 0.6, -o.r * 0.7); c.lineTo(0, 0); c.lineTo(o.r * 0.5, -o.r * 0.2); c.stroke(); } }
    if (T === 'bomb') { c.strokeStyle = '#c9a'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -o.r); c.quadraticCurveTo(5, -o.r - 6, 9, -o.r - 4); c.stroke();
      c.fillStyle = Math.sin(this.t * 20) > 0 ? '#ffd23f' : '#ff5a36'; c.beginPath(); c.arc(9, -o.r - 4, 3, 0, 6.283); c.fill(); }
    if (T === 'gold') { c.fillStyle = '#fff'; c.globalAlpha = 0.6 + Math.sin(this.t * 6 + o.id) * 0.4; c.fillRect(o.r * 0.3, -o.r * 0.7, 2.5, 2.5); c.globalAlpha = 1; }
    // face
    const er = o.r * (scared ? 0.34 : 0.28), ex = o.r * 0.36, ey = -o.r * 0.12;
    for (const sd of [-1, 1]) {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(sd * ex, ey, er, 0, 6.283); c.fill();
      c.fillStyle = '#1b1b2b'; c.beginPath(); c.arc(sd * ex + lx * er * 0.45, ey + ly * er * 0.45, er * 0.55, 0, 6.283); c.fill();
    }
    c.strokeStyle = '#1b1b2b'; c.lineWidth = 1.6; c.fillStyle = '#1b1b2b'; c.beginPath();
    if (scared) c.ellipse(0, o.r * 0.42, o.r * 0.14, o.r * 0.18, 0, 0, 6.283), c.fill();
    else { c.arc(0, o.r * 0.22, o.r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    c.restore();
    if (o.flash > 0) { c.globalAlpha = o.flash; c.fillStyle = '#fff'; c.beginPath(); c.arc(o.x, o.y, o.r, 0, 6.283); c.fill(); c.globalAlpha = 1; o.flash = Math.max(0, o.flash - 0.08); }
  }
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255, t = f < 0 ? 0 : 255, p = Math.abs(f);
  const m = v => Math.round((t - v) * p + v);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
