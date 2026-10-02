/* 3D scene: board, lighting, camera, piece management, move animations (each piece moves like what it is). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildPiece, makeMaterials, SCHEMES } from './pieces.js';
import { makeBoardTextures, glowTexture, softDot } from './textures.js';
import { Sfx } from './audio.js';

const TYPE_CH = ' pnbrqk';
const sqPos = sq => [(sq & 7) - 3.5, 3.5 - (sq >> 3)];
const angDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const E = {
  io: u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2,
  sine: u => -(Math.cos(Math.PI * u) - 1) / 2,
  out: u => 1 - (1 - u) * (1 - u),
  lin: u => u,
  back: u => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
};
const QUALITY = {
  high: { shadow: 2048, dpr: 2, shadows: true },
  medium: { shadow: 1024, dpr: 1.5, shadows: true },
  low: { shadow: 512, dpr: 1, shadows: false }
};

export class ChessScene {
  constructor(canvas) {
    this.canvas = canvas; this.pieces = new Map(); this.tweens = []; this.speed = 1; this.t = 0; this.onPick = null;
    this.all = new Set(); this.set = 'royal'; this.scheme = 'ivory'; this.boardKey = 'wood'; this.quality = 'high'; this.tpl = {}; this.mats = null;
    this.targets = []; this.hl = {}; this.shake = 0; this.maxDt = new URLSearchParams(location.search).has('fast') ? 0.4 : 0.05; this.running = true; this.menuSpin = false; this.camTween = null;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    const sc = this.scene = new THREE.Scene(); sc.background = new THREE.Color(0x120c08); sc.fog = new THREE.Fog(0x120c08, 26, 62);
    const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = 0.45; pm.dispose();
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.5, 150);
    const c = this.controls = new OrbitControls(this.camera, canvas);
    c.enablePan = false; c.enableDamping = true; c.dampingFactor = 0.09; c.rotateSpeed = 0.65; c.zoomSpeed = 0.7; c.minPolarAngle = 0.12; c.maxPolarAngle = 1.36; c.target.set(0, 0.1, 0.5);
    c.autoRotateSpeed = 0.9;
    // lights
    sc.add(new THREE.HemisphereLight(0xfff0dc, 0x2a1a10, 0.35));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 3.4); sun.position.set(6, 12, 7); sun.castShadow = true;
    const sh = sun.shadow.camera; sh.left = -8; sh.right = 8; sh.top = 8; sh.bottom = -8; sh.near = 2; sh.far = 40; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    sc.add(sun); sc.add(sun.target);
    const fill = new THREE.DirectionalLight(0xb9c8ff, 0.7); fill.position.set(-8, 6, -6); sc.add(fill);
    const warm = new THREE.PointLight(0xffc27a, 60, 40, 1.6); warm.position.set(0, 7, 0); sc.add(warm);
    this.boardGroup = new THREE.Group(); this.pieceRoot = new THREE.Group(); this.hlGroup = new THREE.Group(); this.fx = new THREE.Group();
    sc.add(this.boardGroup, this.hlGroup, this.pieceRoot, this.fx);
    this.glowRed = glowTexture('rgba(255,60,50,1)'); this.glowGreen = glowTexture('rgba(90,255,150,1)'); this.glowGold = glowTexture('rgba(255,220,90,1)'); this.dot = softDot();
    this.sprites = []; for (let i = 0; i < 70; i++) { const m = new THREE.SpriteMaterial({ map: this.dot, transparent: true, depthWrite: false, opacity: 0 }); const s = new THREE.Sprite(m); s.visible = false; s.userData = { life: 0 }; this.fx.add(s); this.sprites.push(s); }
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.applyQuality(this.quality); this.buildBoard(); this.buildMaterials();
    this.bindInput(); this.last = performance.now();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement || canvas); this.resize();
    this.resetCamera('white', true);
    const loop = now => { requestAnimationFrame(loop); if (!this.running) { this.last = now; return; } const dt = Math.min(this.maxDt, (now - this.last) / 1000); this.last = now; this.update(dt); this.renderer.render(this.scene, this.camera); };
    requestAnimationFrame(loop);
  }

  /* ---------- setup ---------- */
  applyQuality(q) {
    if (q === 'auto') q = (Math.min(screen.width, screen.height) * (window.devicePixelRatio || 1) > 1000 && (navigator.hardwareConcurrency || 4) >= 6) ? 'high' : 'medium';
    this.quality = q; const Q = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr)); this.renderer.shadowMap.enabled = Q.shadows; this.sun.castShadow = Q.shadows;
    if (this.sun.shadow.mapSize.x !== Q.shadow) { this.sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }
  resize() {
    const p = this.canvas.parentElement || this.canvas, w = Math.max(1, p.clientWidth), h = Math.max(1, p.clientHeight);
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.w = w; this.h = h; this.fit();
  }
  /** keep the whole board in view for the current aspect ratio */
  fit() {
    const vf = this.camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    const need = 4.85 / Math.tan(Math.min(hf, vf * 1.4) / 2);
    this.fitDist = Math.max(13, need);
    this.controls.minDistance = this.fitDist * 0.5; this.controls.maxDistance = this.fitDist * 1.35;
    if (!this._fitted) { this._fitted = true; this.setRadius(this.fitDist); }
  }
  setRadius(r) { const o = this.camera.position.clone().sub(this.controls.target).setLength(r); this.camera.position.copy(this.controls.target).add(o); }
  buildMaterials() {
    for (const k in this.tpl) this.tpl[k].root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.tpl = {};
    if (this.mats) for (const m of this.mats) for (const k in m) m[k].dispose();
    const sch = SCHEMES[this.scheme] || SCHEMES.ivory; this.mats = [makeMaterials(sch, 0), makeMaterials(sch, 1)];
  }
  buildBoard() {
    const g = this.boardGroup; while (g.children.length) { const o = g.children.pop(); o.geometry && o.geometry.dispose(); }
    if (this.texs) for (const k of ['squares', 'frame', 'table']) this.texs[k].dispose();
    const T = this.texs = makeBoardTextures(this.boardKey, this.renderer), th = T.theme;
    const frameTop = new THREE.MeshStandardMaterial({ map: T.frame, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.5 });
    const side = new THREE.MeshStandardMaterial({ color: th.frame, roughness: 0.6 });
    const slab = new THREE.Mesh(new RoundedBoxGeometry(10.6, 0.55, 10.6, 4, 0.12), [side, side, frameTop, side, side, side]);
    slab.position.y = -0.275; slab.receiveShadow = true; slab.castShadow = true; g.add(slab);
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: T.squares, roughness: th.type === 'marble' || th.type === 'glass' ? 0.22 : 0.5, metalness: 0, envMapIntensity: 0.6 }));
    sq.rotation.x = -Math.PI / 2; sq.position.y = 0.002; sq.receiveShadow = true; g.add(sq);
    const trim = new THREE.MeshStandardMaterial({ color: th.trim, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.0 });
    for (const [w, d, x, z] of [[8.16, 0.08, 0, -4.04], [8.16, 0.08, 0, 4.04], [0.08, 8.16, -4.04, 0], [0.08, 8.16, 4.04, 0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), trim); b.position.set(x, 0.03, z); b.receiveShadow = true; g.add(b); }
    T.table.repeat.set(5, 5); T.table.needsUpdate = true;
    const table = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: T.table, roughness: 0.55, metalness: 0, envMapIntensity: 0.4 }));
    table.rotation.x = -Math.PI / 2; table.position.y = -0.56; table.receiveShadow = true; g.add(table);
  }
  setStyle({ board, pcolor, set, quality, speed }) {
    if (speed !== undefined) this.speed = speed;
    if (quality && quality !== this.quality) this.applyQuality(quality);
    let rebuildPieces = false;
    if (board && board !== this.boardKey) { this.boardKey = board; this.buildBoard(); }
    if ((pcolor && pcolor !== this.scheme) || (set && set !== this.set)) { if (pcolor) this.scheme = pcolor; if (set) this.set = set; this.buildMaterials(); rebuildPieces = true; }
    if (rebuildPieces) { const lay = [...this.pieces.values()].map(p => ({ type: p.type, color: p.color, sq: p.sq })); this.clearPieces(); for (const l of lay) this.spawn(l.type, l.color, l.sq); }
  }

  /* ---------- pieces ---------- */
  drop(p) { this.pieceRoot.remove(p.root); if (p.base) this.pieceRoot.remove(p.base); this.all.delete(p); }
  clearPieces() { for (const p of [...this.all]) this.drop(p); this.pieces.clear(); }
  loadPosition(b) { this.clearPieces(); for (let sq = 0; sq < 64; sq++) { const p = b[sq]; if (p) this.spawn(TYPE_CH[p & 7], p >> 3, sq); } this.clearMarks(); }
  at(sq) { return this.pieces.get(sq); }
  spawn(type, color, sq, scale = 1) {
    const key = type + color; let tpl = this.tpl[key];
    if (!tpl) tpl = this.tpl[key] = buildPiece(type, this.set, this.mats[color]);
    const root = new THREE.Group(), tilt = new THREE.Group(), content = tpl.root.clone(true);
    root.rotation.order = 'YXZ'; tilt.rotation.order = 'YXZ'; tilt.add(content); root.add(tilt);
    const legs = []; content.traverse(o => { if (o.userData.leg) legs.push(o); });
    const p = { type, color, sq, root, tilt, content, legs, restYaw: color === 0 ? Math.PI : 0, height: tpl.height, base: null };
    const bm = content.getObjectByName('base');          // animals keep a flat base that glides on the board while the animal moves above it
    if (bm) { bm.parent.remove(bm); p.base = new THREE.Group(); p.base.add(bm); this.pieceRoot.add(p.base); }
    const mark = o => o.traverse(m => { if (m.isMesh) m.userData.piece = p; }); mark(content); if (p.base) mark(p.base);
    this.all.add(p);
    const [x, z] = sqPos(sq); root.position.set(x, 0.002, z); root.rotation.y = p.restYaw; root.scale.setScalar(scale);
    this.pieceRoot.add(root); this.pieces.set(sq, p); if (p.base) p.base.position.set(x, 0.002, z); return p;
  }
  setPivot(p, z) { p.tilt.position.z = z; p.content.position.z = -z; }

  /* ---------- picking ---------- */
  bindInput() {
    let down = null;
    const c = this.canvas;
    c.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    c.addEventListener('pointerup', e => {
      if (!down) return; const d = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
      if (d < 9 && dt < 600 && this.onPick) this.onPick(this.pick(e.clientX, e.clientY));
    });
  }
  pick(cx, cy) {
    const r = this.canvas.getBoundingClientRect(), ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObjects(this.pieceRoot.children, true);
    for (const h of hit) { let o = h.object; while (o && !o.userData.piece) o = o.parent; if (o && o.userData.piece && this.pieces.get(o.userData.piece.sq) === o.userData.piece) return o.userData.piece.sq; }
    const pt = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(this.plane, pt)) return -1;
    const f = Math.floor(pt.x + 4), rk = Math.floor(4 - pt.z); return f < 0 || f > 7 || rk < 0 || rk > 7 ? -1 : rk * 8 + f;
  }

  /* ---------- highlights ---------- */
  quad(color, opacity, size = 0.98, map = null) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: map ? 0xffffff : color, map, transparent: true, opacity, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2; this.hlGroup.add(m); return m;
  }
  ensureHl() {
    if (this.hl.sel) return;
    this.hl.sel = this.quad(0x66ff99, 0.5); this.hl.from = this.quad(0xf4d94e, 0.38); this.hl.to = this.quad(0xf4d94e, 0.5);
    this.hl.check = this.quad(0xffffff, 0.95, 2.1, this.glowRed); this.hl.hintA = this.quad(0x4ad8ff, 0.55); this.hl.hintB = this.quad(0x4ad8ff, 0.75);
    this.hl.dotGeo = new THREE.CircleGeometry(0.17, 28); this.hl.ringGeo = new THREE.RingGeometry(0.36, 0.48, 40);
  }
  place(m, sq, y = 0.012) { const [x, z] = sqPos(sq); m.position.set(x, y, z); m.visible = true; }
  select(sq, targets) {
    this.ensureHl(); this.deselect(false);
    this.sel = sq; this.place(this.hl.sel, sq, 0.011);
    const p = this.at(sq); if (p) this.tween(0.14, e => { p.root.position.y = 0.002 + 0.16 * e; }, E.out);
    for (const t of targets) {
      const m = new THREE.Mesh(t.capture ? this.hl.ringGeo : this.hl.dotGeo, new THREE.MeshBasicMaterial({ color: t.capture ? 0xff4d4d : 0x39e07a, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 3; const [x, z] = sqPos(t.sq); m.position.set(x, 0.02, z); m.userData.cap = !!t.capture; this.hlGroup.add(m); this.targets.push(m);
    }
  }
  deselect(animate = true) {
    if (this.sel !== undefined && this.sel !== null) { const p = this.at(this.sel); if (p) { if (animate) { const y0 = p.root.position.y; this.tween(0.12, e => { p.root.position.y = y0 + (0.002 - y0) * e; }, E.out); } else p.root.position.y = 0.002; } }
    this.sel = null; if (this.hl.sel) this.hl.sel.visible = false;
    for (const m of this.targets) { this.hlGroup.remove(m); m.material.dispose(); } this.targets = [];
  }
  markLast(from, to) { this.ensureHl(); if (from < 0) { this.hl.from.visible = this.hl.to.visible = false; return; } this.place(this.hl.from, from, 0.008); this.place(this.hl.to, to, 0.009); }
  markCheck(sq) { this.ensureHl(); if (sq < 0) this.hl.check.visible = false; else this.place(this.hl.check, sq, 0.013); }
  showHint(from, to) { this.ensureHl(); if (from < 0) { this.hl.hintA.visible = this.hl.hintB.visible = false; return; } this.place(this.hl.hintA, from, 0.014); this.place(this.hl.hintB, to, 0.015); }
  clearMarks() { this.ensureHl(); this.deselect(false); this.markLast(-1); this.markCheck(-1); this.showHint(-1); }

  /* ---------- camera ---------- */
  resetCamera(view, instant) {
    const target = { white: [0, 0.82], black: [Math.PI, 0.82], top: [this.controls.getAzimuthalAngle(), 0.14], side: [Math.PI / 2, 1.1] }[view] || [0, 0.82];
    const r = this.fitDist || 22;
    if (instant) { this.setSph(target[0], target[1], r); return; }
    const th0 = this.controls.getAzimuthalAngle(), ph0 = this.controls.getPolarAngle(), r0 = this.camera.position.distanceTo(this.controls.target);
    const dth = angDelta(th0, target[0]);
    this.tween(0.8, e => this.setSph(th0 + dth * e, ph0 + (target[1] - ph0) * e, r0 + (r - r0) * e), E.io);
  }
  setSph(theta, phi, r) {
    const t = this.controls.target; this.camera.position.set(t.x + r * Math.sin(phi) * Math.sin(theta), t.y + r * Math.cos(phi), t.z + r * Math.sin(phi) * Math.cos(theta)); this.controls.update();
  }
  setMenuSpin(on) { this.menuSpin = on; this.controls.autoRotate = on; }

  /* ---------- effects ---------- */
  puff(x, y, z, n, color = 0xd8c8a8, speed = 1.2, up = 0.8, size = 0.5) {
    let k = 0;
    for (const s of this.sprites) {
      if (s.userData.life > 0) continue; if (k++ >= n) break;
      const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * speed;
      s.position.set(x, y, z); s.userData = { life: 0.7 + Math.random() * 0.4, max: 1, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: up * (0.3 + Math.random()), size: size * (0.6 + Math.random() * 0.8) };
      s.material.color.setHex(color); s.material.opacity = 0.55; s.scale.setScalar(s.userData.size * 0.5); s.visible = true; s.userData.max = s.userData.life;
    }
  }
  sparkle(x, y, z, n = 24) { this.puff(x, y, z, n, 0xffd75e, 2.2, 2.2, 0.28); }
  bump(a) { this.shake = Math.max(this.shake, a); }

  /* ---------- tween engine ---------- */
  tween(dur, fn, ease = E.io) { return new Promise(res => { this.tweens.push({ t: 0, dur: Math.max(0.001, dur), fn, ease, res }); }); }
  wait(sec) { return this.tween(sec, () => {}, E.lin); }
  update(dt) {
    this.t += dt;
    const sdt = dt * this.speed;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]; tw.t += sdt; const u = Math.min(1, tw.t / tw.dur); tw.fn(tw.ease(u), u);
      if (u >= 1) { this.tweens.splice(i, 1); tw.res(); }
    }
    for (const s of this.sprites) { const d = s.userData; if (d.life > 0) { d.life -= dt; if (d.life <= 0) { s.visible = false; s.material.opacity = 0; continue; } const k = d.life / d.max; s.position.x += d.vx * dt; s.position.z += d.vz * dt; s.position.y += d.vy * dt; d.vy -= 1.4 * dt; d.vx *= 0.97; d.vz *= 0.97; s.material.opacity = 0.55 * k; s.scale.setScalar(d.size * (1.4 - 0.9 * k)); } }
    const pulse = 1 + 0.12 * Math.sin(this.t * 6);
    for (const m of this.targets) m.scale.setScalar(m.userData.cap ? 1 + 0.06 * Math.sin(this.t * 6) : pulse);
    if (this.hl.check && this.hl.check.visible) this.hl.check.material.opacity = 0.7 + 0.3 * Math.sin(this.t * 7);
    if (this.hl.hintB && this.hl.hintB.visible) { const o = 0.5 + 0.3 * Math.sin(this.t * 6); this.hl.hintA.material.opacity = o * 0.7; this.hl.hintB.material.opacity = o; }
    if (this.hl.sel && this.hl.sel.visible) this.hl.sel.material.opacity = 0.4 + 0.15 * Math.sin(this.t * 5);
    for (const p of this.all) if (p.base) { p.base.position.set(p.root.position.x, 0.002, p.root.position.z); p.base.scale.setScalar(p.root.scale.x); }
    this.controls.update();
    if (this.shake > 0.0004) { this.camera.rotateX((Math.random() - 0.5) * this.shake); this.camera.rotateY((Math.random() - 0.5) * this.shake); this.shake *= Math.pow(0.02, dt); }
  }

  /* ---------- move animation ---------- */
  /** info: {from,to,capture:{sq}|null,castle:{from,to}|null,promo:'q'|..|null} */
  async animateMove(info) {
    const mover = this.at(info.from); if (!mover) return;
    this.deselect(false); this.showHint(-1); this.markCheck(-1);
    const victim = info.capture ? this.at(info.capture.sq) : null;
    this.pieces.delete(info.from); if (victim) this.pieces.delete(info.capture.sq);
    const [x0, z0] = sqPos(info.from), [x1, z1] = sqPos(info.to);
    const jobs = [this.moveOne(mover, x0, z0, x1, z1, victim, info)];
    if (info.castle) {
      const rook = this.at(info.castle.from); this.pieces.delete(info.castle.from);
      const [rx0, rz0] = sqPos(info.castle.from), [rx1, rz1] = sqPos(info.castle.to);
      jobs.push(this.moveOne(rook, rx0, rz0, rx1, rz1, null, {})); rook.sq = info.castle.to; this.pieces.set(info.castle.to, rook);
    }
    await Promise.all(jobs);
    mover.sq = info.to; this.pieces.set(info.to, mover);
    if (info.promo) await this.promote(mover, info.promo);
  }
  async promote(p, newType) {
    this.drop(p); this.pieces.delete(p.sq);
    const n = this.spawn(newType, p.color, p.sq, 0.01); const [x, z] = sqPos(p.sq);
    Sfx.promote(); this.sparkle(x, 0.9, z, 30); this.bump(0.004);
    await this.tween(0.5, e => { n.root.scale.setScalar(Math.max(0.01, e)); n.root.rotation.y = n.restYaw + (1 - e) * Math.PI * 2; }, E.back);
    n.root.scale.setScalar(1); n.root.rotation.y = n.restYaw;
  }
  async turn(p, to, dur) {
    const from = p.root.rotation.y, d = angDelta(from, to);
    await this.tween(dur, e => { p.root.rotation.y = from + d * e; }, E.io);
  }
  setLegs(p, fn) { p.legs.forEach(l => { const side = l.position.x > 0 ? 1 : 0, fr = l.userData.leg.front ? 1 : 0; fn(l, fr, side); }); }
  restLegs(p) { for (const l of p.legs) l.rotation.x = 0; }

  async moveOne(p, x0, z0, x1, z1, victim, info) {
    const dx = x1 - x0, dz = z1 - z0, dist = Math.hypot(dx, dz), yawT = Math.atan2(dx, dz), rest = p.restYaw, animal = this.set === 'royal';
    const ca = Math.cos(rest), sa = Math.sin(rest), lx = (dx * ca - dz * sa) / dist, lz = (dx * sa + dz * ca) / dist;
    const arrive = async () => {
      if (victim) this.knock(victim, dx / dist, dz / dist, p);
      else { Sfx.place(); }
      this.puff(x1, 0.05, z1, victim ? 10 : 4, 0xcbb994, victim ? 1.4 : 0.6, 0.5, 0.45);
    };
    const T = p.type, Y = 0.002;
    if (T === 'n') {
      const horse = p.legs.length > 0;
      if (horse) { this.setPivot(p, -0.28); Sfx.clop(1); }
      const yaw0 = p.root.rotation.y, dyaw = angDelta(yaw0, yawT);
      await this.tween(horse ? 0.34 : 0.16, e => { p.root.rotation.y = yaw0 + dyaw * e; if (horse) { p.tilt.rotation.x = -0.6 * e; this.setLegs(p, (l, fr) => { l.rotation.x = fr ? -0.55 * e : 0.1 * e; }); } }, E.io);
      Sfx.clop(2, 0.07);
      const H = 0.5 + 0.13 * dist, dur = 0.5 + 0.13 * dist;
      await this.tween(dur, (e, u) => {
        p.root.position.set(x0 + dx * e, Y + H * 4 * u * (1 - u), z0 + dz * e);
        if (horse) { p.tilt.rotation.x = -0.6 + (0.28 + 0.6) * E.sine(u); this.setLegs(p, (l, fr) => { l.rotation.x = fr ? -0.55 - 0.45 * Math.sin(Math.PI * u) : 0.1 + 0.9 * Math.sin(Math.PI * u); }); }
        else p.tilt.rotation.x = 0.3 * Math.sin(Math.PI * u);
      }, E.lin);
      p.root.position.set(x1, Y, z1); await arrive();
      if (horse) Sfx.clop(3, 0.09);
      this.bump(0.003);
      await this.tween(0.42, (e, u) => {
        const s = Math.sin(u * Math.PI * 2.2) * (1 - u) * 0.05; p.root.position.y = Y + Math.max(0, s) * 1.6;
        if (horse) { p.tilt.rotation.x = 0.28 * (1 - e); this.setLegs(p, (l, fr) => { l.rotation.x = (fr ? -1.0 : 1.0) * (1 - e); }); } else p.tilt.rotation.x = 0;
      }, E.out);
      if (horse) { p.tilt.rotation.x = 0; this.restLegs(p); this.setPivot(p, 0); }
      await this.turn(p, rest, 0.28);
    } else if (animal && (T === 'r' || T === 'b')) {
      const cfg = T === 'r' ? { amp: 0.34, freq: 1.45, bob: 0.03, sway: 0.05, base: 0.5, per: 0.36, snd: () => { Sfx.thud(); this.bump(0.0026); } }
                            : { amp: 0.3, freq: 1.9, bob: 0.028, sway: 0.06, base: 0.4, per: 0.27, snd: () => { Sfx.pad(); } };
      await this.turn(p, yawT, T === 'r' ? 0.34 : 0.26);
      const dur = cfg.base + cfg.per * dist; let last = -1;
      await this.tween(dur, (e, u) => {
        p.root.position.set(x0 + dx * e, Y, z0 + dz * e);
        const ph = u * dur * cfg.freq * Math.PI * 2; this.setLegs(p, (l, fr, side) => { l.rotation.x = cfg.amp * Math.sin(ph + (((fr ? 1 : 0) + side) % 2 ? 0 : Math.PI)); });
        p.root.position.y = Y + Math.abs(Math.sin(ph)) * cfg.bob; p.tilt.rotation.z = Math.sin(ph) * cfg.sway; p.tilt.rotation.x = Math.sin(ph * 2) * 0.02 + (T === 'b' ? Math.sin(ph) * 0.03 : 0);
        const s = Math.floor(ph / Math.PI); if (s !== last && u < 0.97) { last = s; cfg.snd(); }
      }, E.sine);
      p.root.position.set(x1, Y, z1); p.tilt.rotation.set(0, 0, 0); this.restLegs(p);
      await arrive(); if (T === 'r' && victim) { Sfx.trumpet(); this.bump(0.007); }
      await this.turn(p, rest, 0.32);
    } else if (T === 'p') {
      const dur = 0.3 + 0.12 * dist, yaw0 = p.root.rotation.y, dyaw = angDelta(yaw0, rest + (victim ? Math.atan2(lx, lz) * 0.4 : 0));
      await this.tween(dur, (e, u) => { p.root.position.set(x0 + dx * e, Y + 0.2 * Math.sin(Math.PI * u), z0 + dz * e); p.root.rotation.y = yaw0 + dyaw * Math.sin(Math.PI * u); p.tilt.rotation.x = 0.12 * Math.sin(Math.PI * u); }, E.sine);
      p.root.position.set(x1, Y, z1); p.root.rotation.y = rest; p.tilt.rotation.x = 0; await arrive();
    } else {
      // glide pieces: lean into the direction of travel
      const lean = T === 'q' ? 0.16 : T === 'k' ? 0.09 : 0.12, dur = (T === 'k' ? 0.5 : 0.36) + 0.11 * dist;
      Sfx.rustle();
      await this.tween(dur, (e, u) => {
        const s = Math.sin(Math.PI * u); p.root.position.set(x0 + dx * e, Y + 0.05 * s, z0 + dz * e);
        p.tilt.rotation.x = lean * lz * s; p.tilt.rotation.z = -lean * lx * s; if (T === 'q') p.root.rotation.y = rest + Math.sin(Math.PI * 2 * u) * 0.18;
      }, E.sine);
      p.root.position.set(x1, Y, z1); p.tilt.rotation.set(0, 0, 0); p.root.rotation.y = rest; await arrive();
      if (T === 'r' || T === 'b') this.bump(0.002);
    }
    p.root.position.set(x1, Y, z1); p.root.rotation.set(0, rest, 0); p.tilt.rotation.set(0, 0, 0);
  }

  /** checkmate: the losing king topples over */
  kingFall(sq) {
    const p = this.at(sq); if (!p) return; const [x, z] = sqPos(sq); this.bump(0.009); Sfx.capture(); this.puff(x, 0.3, z, 18, 0xe0cfa8, 1.6, 1.2, 0.6);
    return this.tween(1.0, (e, u) => { p.tilt.rotation.z = (p.color ? 1 : -1) * 1.5 * E.out(u); p.root.position.y = 0.002 + 0.34 * Math.sin(Math.min(1, u * 1.1) * Math.PI / 2 * 1.0) * (u > 0.5 ? 1 : u * 2); p.root.position.x = x + (p.color ? 0.5 : -0.5) * E.out(u); }, E.lin);
  }

  /** captured piece gets knocked away, tumbles and fades out */
  knock(v, nx, nz, attacker) {
    const x0 = v.root.position.x, z0 = v.root.position.z, big = attacker && (attacker.type === 'r' || attacker.type === 'q' || attacker.type === 'n');
    Sfx.capture(); Sfx.buzz(30); this.bump(big ? 0.008 : 0.005); this.puff(x0, 0.2, z0, 14, 0xe0cfa8, 1.8, 1.4, 0.55);
    const spin = (nx >= 0 ? -1 : 1);
    this.tween(0.8, (e, u) => {
      v.root.position.set(x0 + nx * 1.3 * e, 0.002 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * 0.4), z0 + nz * 1.3 * e);
      v.tilt.rotation.z = spin * 2.4 * e; v.tilt.rotation.x = nz * 1.2 * e;
      const s = u > 0.72 ? Math.max(0.001, 1 - (u - 0.72) / 0.28) : 1; v.root.scale.setScalar(s);
    }, E.lin).then(() => { this.drop(v); });
  }
}
