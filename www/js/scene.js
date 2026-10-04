/* 3D scene: board, lighting, camera, piece management, move animations (each piece moves like what it is). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildPiece, makeMaterials, SCHEMES } from './pieces.js';
import { makeBoardTextures, makeTableTexture, makeLegendIcons, LEGEND_ORDER, skyTexture, moonTexture, glowTexture, softDot } from './textures.js';
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
  high: { shadow: 2048, dpr: 2, shadows: true, soft: true },
  medium: { shadow: 1024, dpr: 1.5, shadows: true, soft: false },
  low: { shadow: 512, dpr: 1, shadows: false, soft: false }
};

const BG_LOOK = {
  wood:   { sky: ['#120c08', '#120c08'], fog: 0x120c08, near: 26, far: 62, table: 'wood', tRough: 0.55, tMetal: 0, tEnv: 0.4, sun: 0xfff0d8, sunI: 3.4, warm: 0xffc27a, warmI: 60, fillC: 0xb9c8ff, fillI: 0.7, hemiS: 0xfff0dc, hemiG: 0x2a1a10, hemiI: 0.35, env: 0.45, exp: 1.0 },
  palace: { sky: ['#0e0407', '#4d1424'], fog: 0x4d1424, near: 24, far: 64, table: 'palace', tRough: 0.22, tMetal: 0.05, tEnv: 0.8, sun: 0xffd9a8, sunI: 3.0, warm: 0xffa550, warmI: 120, fillC: 0xff9a7a, fillI: 0.5, hemiS: 0xffc89a, hemiG: 0x2a0a10, hemiI: 0.4, env: 0.5, exp: 1.05, fx: 'dust',
            glows: [[-10, 2.2, -10, 0xffb35a, 7], [10, 2.2, -10, 0xffb35a, 7], [-12, 2.2, 6, 0xffb35a, 6], [12, 2.2, 6, 0xffb35a, 6]] },
  garden: { sky: ['#2c3b86', '#ffb06b'], fog: 0xffb06b, near: 28, far: 80, table: 'grass', tRough: 0.9, tMetal: 0, tEnv: 0.25, sun: 0xffd2a0, sunI: 3.6, warm: 0xffb070, warmI: 45, fillC: 0x9ab4ff, fillI: 0.6, hemiS: 0xffd8b0, hemiG: 0x2a4a2a, hemiI: 0.5, env: 0.45, exp: 1.0, fx: 'fireflies',
            glows: [[-34, 7, -60, 0xffc27a, 46], [-34, 7, -60, 0xfff0c0, 12]] },
  night:  { sky: ['#01020a', '#14204a'], fog: 0x14204a, near: 26, far: 70, table: 'glass', tRough: 0.14, tMetal: 0.6, tEnv: 1.1, sun: 0xbcd0ff, sunI: 2.4, warm: 0x6a8cff, warmI: 40, fillC: 0x8aa0ff, fillI: 0.8, hemiS: 0x6c7cff, hemiG: 0x05060f, hemiI: 0.3, env: 0.4, exp: 1.0, fx: 'stars',
            glows: [[36, 30, -62, 'moon', 22]] },
  snow:   { sky: ['#8aaed8', '#e6eef9'], fog: 0xe6eef9, near: 20, far: 72, table: 'snow', tRough: 0.8, tMetal: 0, tEnv: 0.5, sun: 0xeaf2ff, sunI: 3.0, warm: 0xdfe9ff, warmI: 30, fillC: 0xbcd0ff, fillI: 0.8, hemiS: 0xeaf2ff, hemiG: 0x8aa0c0, hemiI: 0.7, env: 0.6, exp: 0.95, fx: 'snow' }
};

const sleep0 = () => new Promise(r => setTimeout(r, 0));

export class ChessScene {
  constructor(canvas, init = {}) {
    this.canvas = canvas; this.pieces = new Map(); this.tweens = []; this.speed = 1; this.t = 0; this.onPick = null;
    this.all = new Set(); this.set = 'royal'; this.scheme = 'ivory'; this.boardKey = 'wood'; this.quality = 'high'; this.kits = {}; this.kit = null; this.boardTok = 0; this.bgTok = 0; this.pieceTok = 0; this.qualityReq = null;
    this.targets = []; this.hl = {}; this.custom = null; this.customJson = ''; this.cine = true; this.labels = 'border'; this.labelCache = {}; this.frames = 0; this.acc = 0; this.noAdapt = new URLSearchParams(location.search).has('fast'); this.shake = 0; this.maxDt = new URLSearchParams(location.search).has('fast') ? 0.4 : 0.05; this.running = true; this.menuSpin = false; this.camTween = null;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    const sc = this.scene = new THREE.Scene(); sc.background = new THREE.Color(0x120c08); sc.fog = new THREE.Fog(0x120c08, 26, 62);
    const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = 0.45; pm.dispose();
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.5, 150);
    const c = this.controls = new OrbitControls(this.camera, canvas);
    c.enablePan = false; c.enableDamping = true; c.dampingFactor = 0.09; c.rotateSpeed = 0.65; c.zoomSpeed = 0.7; c.minPolarAngle = 0.02; c.maxPolarAngle = 1.36; c.target.set(0, 0.1, 0.5);
    c.autoRotateSpeed = 0.9;
    // lights
    const hemi = this.hemi = new THREE.HemisphereLight(0xfff0dc, 0x2a1a10, 0.35); sc.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 3.4); sun.position.set(6, 12, 7); sun.castShadow = true;
    const sh = sun.shadow.camera; sh.left = -8; sh.right = 8; sh.top = 8; sh.bottom = -8; sh.near = 2; sh.far = 40; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    sc.add(sun); sc.add(sun.target);
    const fill = this.fill = new THREE.DirectionalLight(0xb9c8ff, 0.7); fill.position.set(-8, 6, -6); sc.add(fill);
    const warm = this.warm = new THREE.PointLight(0xffc27a, 60, 40, 1.6); warm.position.set(0, 7, 0); sc.add(warm);
    this.boardGroup = new THREE.Group(); this.pieceRoot = new THREE.Group(); this.hlGroup = new THREE.Group(); this.fx = new THREE.Group();
    sc.add(this.boardGroup, this.hlGroup, this.pieceRoot, this.fx);
    this.glowRed = glowTexture('rgba(255,60,50,1)'); this.glowGreen = glowTexture('rgba(90,255,150,1)'); this.glowGold = glowTexture('rgba(255,220,90,1)'); this.dot = softDot();
    this.sprites = []; for (let i = 0; i < 70; i++) { const m = new THREE.SpriteMaterial({ map: this.dot, transparent: true, depthWrite: false, opacity: 0 }); const s = new THREE.Sprite(m); s.visible = false; s.userData = { life: 0 }; this.fx.add(s); this.sprites.push(s); }
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (init.set) this.set = init.set; if (init.pcolor) this.scheme = init.pcolor; if (init.board) this.boardKey = init.board; if (init.custom) { this.custom = init.custom; this.customJson = JSON.stringify(init.custom); }
    if (init.labels) this.labels = init.labels; if (init.cinema !== undefined) this.cine = init.cinema; if (init.speed !== undefined) this.speed = init.speed;
    this.autoFlat = init.flatHigh !== false; this.qualityReq = init.quality || 'high'; this.applyQuality(this.qualityReq); this.bgKey = null; this.kit = this.getKit(this.set, this.scheme);
    this.ready = (async () => { await this.buildBoard(); await this.setBackground(init.bg || 'wood'); await this.ensureKit(); this.updateLegend(); this.flatIcons(this.kit); await this.precompile(); this.live = true; })();
    this.bindInput(); this.last = performance.now();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement || canvas); this.resize();
    this.resetCamera('white', true);
    this.lastActive = performance.now(); this.lastDraw = 0;
    const poke = () => { this.lastActive = performance.now(); };
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart']) canvas.addEventListener(ev, poke, { passive: true });
    this.poke = poke;
    /* render loop: full speed while anything moves; ambient scenes (stars, snow…) at 30 fps; a still board at 10 fps → much cooler/lighter on phones */
    const loop = now => {
      requestAnimationFrame(loop); if (!this.running || !this.live) { this.last = now; return; }
      const busy = this.tweens.length > 0 || this.menuSpin || this.camTween || this.shake > 0.0004 || this.targets.length > 0 || now - this.lastActive < 450 || this.animating();
      const gap = busy ? 0 : this.bgFx ? 32 : 98; if (now - this.lastDraw < gap) return; this.lastDraw = now;
      const dt = Math.min(this.maxDt, (now - this.last) / 1000); this.last = now; this._busy = busy; this.update(dt); this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  /* ---------- flat 2D view: clean top-down board with flat piece icons (renders of the same pieces, outlined) ---------- */
  flatIcons(kit) {
    if (kit.flat) return kit.flat;
    const R = 320, r = this.renderer, rt = new THREE.WebGLRenderTarget(R, R, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const sc = new THREE.Scene(); sc.environment = this.scene.environment; sc.environmentIntensity = 0.85;
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.15)); const dl = new THREE.DirectionalLight(0xffffff, 2.3); dl.position.set(5, 7, 4); sc.add(dl);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60), buf = new Uint8Array(R * R * 4), out = {}, FH = { p: 0.74, n: 0.92, b: 0.98, r: 0.86, q: 1.0, k: 1.08 };   // icon heights in board squares
    const pr = r.getRenderTarget(), cc = new THREE.Color(); r.getClearColor(cc); const ca = r.getClearAlpha(), sh = r.shadowMap.enabled; r.shadowMap.enabled = false;
    for (const c of [0, 1]) for (const t of 'pnbrqk') {
      const key = t + c, tpl = kit.tpl[key] || (kit.tpl[key] = buildPiece(t, kit.set, kit.mats[c], c)), m = tpl.root.clone(true);
      for (const nm of ['base', 'ring']) { const o = m.getObjectByName(nm); if (o) o.parent.remove(o); }
      sc.add(m); const bx = new THREE.Box3().setFromObject(m), sz = bx.getSize(new THREE.Vector3()), ctr = bx.getCenter(new THREE.Vector3());
      const half = Math.max(sz.y, sz.z) * 0.5 * 1.1; cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
      cam.position.set(12, ctr.y, ctr.z); cam.lookAt(0, ctr.y, ctr.z);
      r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(sc, cam); r.readRenderTargetPixels(rt, 0, 0, R, R, buf); sc.remove(m);
      const raw = document.createElement('canvas'); raw.width = raw.height = R; const rx = raw.getContext('2d'), id = rx.createImageData(R, R);
      for (let y = 0; y < R; y++) id.data.set(buf.subarray((R - 1 - y) * R * 4, (R - y) * R * 4), y * R * 4); rx.putImageData(id, 0, 0);
      const sil = document.createElement('canvas'); sil.width = sil.height = R; const sx = sil.getContext('2d'); sx.drawImage(raw, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = c === 0 ? '#2b1d12' : '#0b0807'; sx.fillRect(0, 0, R, R);
      const cv = document.createElement('canvas'); cv.width = cv.height = R; const cx = cv.getContext('2d'), pad = (half - sz.y / 2) / (2 * half);
      cx.fillStyle = 'rgba(0,0,0,.28)'; cx.beginPath(); cx.ellipse(R / 2, R * (1 - pad) - 3, R * 0.3, R * 0.03, 0, 0, 7); cx.fill();
      for (let a = 0; a < 20; a++) cx.drawImage(sil, Math.cos(a / 20 * 6.283) * 5.5, Math.sin(a / 20 * 6.283) * 5.5);
      cx.drawImage(raw, 0, 0);
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter;
      out[key] = { tx, S: FH[t] * (2 * half) / sz.y, pad };     // plane size (squares) so the piece itself is FH[t] tall; pad = base height above the plane's bottom edge (fraction)
    }
    r.setRenderTarget(pr); r.setClearColor(cc, ca); r.shadowMap.enabled = sh; rt.dispose(); return kit.flat = out;
  }
  attachIcon(p) {
    if (p.icon) return; const ic = this.flatIcons(this.kit)[p.type + p.color]; if (!this.iconGeo) this.iconGeo = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.Mesh(this.iconGeo, new THREE.MeshBasicMaterial({ map: ic.tx, transparent: true, depthWrite: false, toneMapped: false })); m.userData.ic = ic; m.rotation.x = -Math.PI / 2; m.renderOrder = 3; m.userData.piece = p;
    this.fx.add(m); p.icon = m; this.syncIcon(p);
  }
  syncIcon(p) {
    const m = p.icon; if (!m) return; const th = this.flatYaw || 0, y = Math.max(0, p.root.position.y), ic = m.userData.ic, sc = p.root.scale.x * (1 + y * 0.3), S = ic.S * sc;
    const up = -0.36 + (S / 2 - ic.pad * S);      // piece base sits a little below the square's centre; icon centre is S/2 above it
    m.position.set(p.root.position.x - up * Math.sin(th), 0.05 + y * 0.4, p.root.position.z - up * Math.cos(th)); m.rotation.z = th; m.scale.setScalar(S); m.visible = p.root.visible;
  }
  detachIcon(p) { if (!p.icon) return; this.fx.remove(p.icon); p.icon.material.dispose(); p.icon = null; }
  /** swap between the 3D pieces and the flat icons; chosen automatically from the camera angle (high angle = clear flat icons, low angle = real 3D) */
  setFlat(on) {
    if (this.is2D === on) return; this.is2D = on; if (on && this.legendGlows) for (const q of this.legendGlows) q.visible = false; if (this.legendMesh) this.legendMesh.visible = !on && this.labels === 'border';
    for (const p of this.all) { if (on) this.attachIcon(p); else this.detachIcon(p); p.content.visible = !on; if (p.base) p.base.visible = !on; }
    this.poke && this.poke();
  }
  updateFlat() {
    if (!this.autoFlat) { if (this.is2D) this.setFlat(false); return; }
    const phi = this.controls.getPolarAngle(); if (!this.is2D && phi < 0.70) this.setFlat(true); else if (this.is2D && phi > 0.82) this.setFlat(false);
    if (this.is2D) this.flatYaw = this.controls.getAzimuthalAngle();
  }
  /* ---------- name tags: float the piece's NAME above chosen pieces for a few seconds ---------- */
  tagTexture(name, color) {
    const k = name + color; this.tagCache = this.tagCache || {}; if (this.tagCache[k]) return this.tagCache[k];
    const W = 340, H = 150, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), team = color === 0 ? '#f0c24a' : '#ff5a5f';
    x.font = '800 38px system-ui,Segoe UI,Roboto,sans-serif'; const tw = x.measureText(name).width, pw = Math.min(W - 16, tw + 92), px = (W - pw) / 2, ph = 66, py = 8;
    x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 12; x.shadowOffsetY = 4;
    const g = x.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, 'rgba(38,28,20,.94)'); g.addColorStop(1, 'rgba(14,9,5,.94)');
    x.fillStyle = g; x.beginPath(); x.roundRect(px, py, pw, ph, ph / 2); x.fill(); x.shadowColor = 'transparent';
    x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.28)'; x.stroke();
    x.fillStyle = team; x.beginPath(); x.arc(px + 33, py + ph / 2, 11, 0, 7); x.fill();                      // team dot
    x.fillStyle = '#fff6e0'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(name, px + 56, py + ph / 2 + 2);
    x.strokeStyle = team; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.moveTo(W / 2, py + ph + 2); x.lineTo(W / 2, H - 12); x.stroke();   // leader line to the piece
    x.fillStyle = team; x.beginPath(); x.arc(W / 2, H - 10, 7, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return this.tagCache[k] = t;
  }
  /** types: array of 'pnbrqk' (or null = every piece except pawns). Chosen pieces get a glowing ring and a small name label for `ms`. */
  showTags(types, ms = 3600) {
    const NM = this.set === 'royal' ? { p: 'Soldier', n: 'Horse', b: 'Camel', r: 'Elephant', q: 'Queen', k: 'King' } : { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
    this.hideTags(); this.tags = this.tags || [];
    if (!this.ringGeo) this.ringGeo = new THREE.RingGeometry(0.46, 0.58, 48).rotateX(-Math.PI / 2);
    for (const p of this.all) {
      if (types ? !types.includes(p.type) : p.type === 'p') continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTexture(NM[p.type], p.color), transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
      sp.center.set(0.5, 0); sp.scale.set(1.6, 0.7, 1); sp.renderOrder = 20; this.fx.add(sp);
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: p.color === 0 ? 0xf0c24a : 0xff5a5f, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); ring.renderOrder = 4; this.fx.add(ring);
      this.tags.push({ sp, ring, p, t: 0, ms: ms / 1000 });
    }
    this.poke && this.poke();
  }
  hideTags() { for (const g of this.tags || []) { this.fx.remove(g.sp, g.ring); g.sp.material.dispose(); g.ring.material.dispose(); } this.tags = []; }
  updateTags(dt) {
    if (!this.tags || !this.tags.length) return;
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const g = this.tags[i]; g.t += dt; const k = g.t / g.ms, p = g.p;
      if (k >= 1 || !this.all.has(p)) { this.fx.remove(g.sp, g.ring); g.sp.material.dispose(); g.ring.material.dispose(); this.tags.splice(i, 1); continue; }
      const pop = Math.min(1, g.t / 0.28), ease = 1 - Math.pow(1 - pop, 3), fade = k > 0.85 ? (1 - k) / 0.15 : 1, x = p.root.position.x, z = p.root.position.z;
      g.sp.position.set(x, p.root.position.y + (p.height || 1) + 0.04 + (1 - ease) * -0.25, z); g.sp.material.opacity = fade * ease;
      g.ring.position.set(x, 0.03, z); const rs = 0.9 + 0.12 * Math.sin(this.t * 6); g.ring.scale.set(rs, 1, rs); g.ring.material.opacity = fade * (0.55 + 0.3 * Math.sin(this.t * 6));
    }
  }
  /** any highlight that pulses or particle still alive? */
  animating() {
    const h = this.hl; if ((h.check && h.check.visible) || (h.hintB && h.hintB.visible) || (h.sel && h.sel.visible)) return true;
    if (this.legendGlows && this.legendGlows[0].visible) return true;
    if (this.tags && this.tags.length) return true;
    for (const sp of this.sprites) if (sp.userData.life > 0) return true; return false;
  }
  /* ---------- setup ---------- */
  applyQuality(q) {
    this.autoQ = q === 'auto';
    if (q === 'auto') q = 'medium';   // safe start; the governor steps down to Low if frames are slow
    this.quality = q; const Q = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr)); this.renderer.shadowMap.enabled = Q.shadows; if (this._soft !== Q.soft) { this._soft = Q.soft; this.renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; this._shadowOn = null; } this.sun.castShadow = Q.shadows;
    if (this.sun.shadow.mapSize.x !== Q.shadow) { this.sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    if (this._shadowOn !== Q.shadows) { this._shadowOn = Q.shadows; this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
    this.resize();
  }
  resize() {
    const p = this.canvas.parentElement || this.canvas, w = Math.max(1, p.clientWidth), h = Math.max(1, p.clientHeight);
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.w = w; this.h = h; this.fit();
  }
  /** keep the whole board in view for the current aspect ratio */
  fit() {
    const vf = 54 * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    const need = 4.55 / Math.tan(Math.min(hf, vf * 1.4) / 2);
    this.fitDist = Math.max(13, need);
    this.controls.minDistance = this.fitDist * 0.5; this.controls.maxDistance = this.fitDist * 3.0;
    if (!this._fitted) { this._fitted = true; this.setRadius(this.fitDist); }
  }
  setRadius(r) { const o = this.camera.position.clone().sub(this.controls.target).setLength(r); this.camera.position.copy(this.controls.target).add(o); }
  /* ---------- piece kits: materials + geometry templates, cached per (set, colour scheme) so switching back is instant ---------- */
  getKit(set, scheme) {
    const k = set + '|' + scheme; if (this.kits[k]) return this.kits[k];
    const sch = SCHEMES[scheme] || SCHEMES.ivory; return this.kits[k] = { set, mats: [makeMaterials(sch, 0), makeMaterials(sch, 1)], tpl: {}, full: false };
  }
  /** compile every shader program in parallel on the GPU process so the first frame never stalls the UI */
  async precompile() {
    const sc = this.scene; const tmp = [];
    for (const k of ['p', 'n', 'b', 'r', 'q', 'k']) for (const c of [0, 1]) { const m = this.spawn(k, c, c ? 8 + 'pnbrqk'.indexOf(k) : 48 + 'pnbrqk'.indexOf(k)); tmp.push(m); }
    const hid = []; this.scene.traverse(o => { if (!o.visible && (o.isMesh || o.isSprite || o.isPoints)) { o.visible = true; hid.push(o); } });
    try { if (this.renderer.compileAsync) await this.renderer.compileAsync(sc, this.camera); else this.renderer.compile(sc, this.camera); } catch (e) { /* ignore */ }
    for (const o of hid) o.visible = false;
    this.clearPieces();
  }
  async ensureKit(set = this.set, scheme = this.scheme) {
    const kit = this.getKit(set, scheme); if (kit.full) return kit;
    for (const c of [0, 1]) for (const t of 'pnbrqk') { const key = t + c; if (!kit.tpl[key]) { kit.tpl[key] = buildPiece(t, kit.set, kit.mats[c], c); await sleep0(); } }
    kit.full = true; return kit;
  }
  async rebuildPieces() {
    const tok = ++this.pieceTok, want = this.getKit(this.set, this.scheme); await this.ensureKit(this.set, this.scheme);
    if (tok !== this.pieceTok) return;
    this.kit = want; this.labelCache = {}; this.updateLegend(); this.flatIcons(want); if (this.is2D) { this.is2D = false; }
    const lay = [...this.pieces.values()].map(p => ({ type: p.type, color: p.color, sq: p.sq })); this.clearPieces(); for (const l of lay) this.spawn(l.type, l.color, l.sq);
  }
  async buildBoard() {
    const tok = ++this.boardTok, key = this.boardKey, custom = this.custom;
    const T = await makeBoardTextures(key, this.renderer, custom); if (tok !== this.boardTok) return;
    const g = this.boardGroup; while (g.children.length) { const o = g.children.pop(); o.geometry && o.geometry.dispose(); if (o.material) for (const m of [].concat(o.material)) m.dispose(); }
    this.texs = T; const th = T.theme;
    const frameTop = new THREE.MeshStandardMaterial({ map: T.frame, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.5 });
    const side = new THREE.MeshStandardMaterial({ color: th.frame, roughness: 0.6 });
    const slab = new THREE.Mesh(new RoundedBoxGeometry(11, 0.55, 11, 4, 0.12), [side, side, frameTop, side, side, side]);
    slab.position.y = -0.275; slab.receiveShadow = true; slab.castShadow = true; g.add(slab);
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: T.squares, roughness: th.type === 'marble' || th.type === 'glass' ? 0.22 : 0.5, metalness: 0, envMapIntensity: 0.6 }));
    sq.rotation.x = -Math.PI / 2; sq.position.y = 0.002; sq.receiveShadow = true; g.add(sq);
    const lm = this.legendMesh = new THREE.Group(); lm.position.y = 0.004; g.add(lm);
    const qg = new THREE.PlaneGeometry(0.8, 0.8); qg.rotateX(-Math.PI / 2); this.legendSet = null;
    for (const color of [0, 1]) LEGEND_ORDER.forEach((t, f) => {
      const m = new THREE.Mesh(qg, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      m.position.set(f - 3.5, 0, color === 0 ? 5.05 : -5.05); if (color === 1) m.rotation.y = Math.PI; m.renderOrder = 1; m.userData.key = color + t; lm.add(m);
    });
    this.updateLegend();
    const trim = new THREE.MeshStandardMaterial({ color: th.trim, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.0 });
    for (const [w, d, x, z] of [[8.16, 0.08, 0, -4.04], [8.16, 0.08, 0, 4.04], [0.08, 8.16, -4.04, 0], [0.08, 8.16, 4.04, 0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), trim); b.position.set(x, 0.03, z); b.receiveShadow = true; g.add(b); }
  }
  /** apply any subset of style options; heavy parts are async (sliced) so the UI never freezes */
  async setStyle({ board, pcolor, set, quality, speed, cinema, labels, bg, custom, flatHigh }) {
    await this.ready; if (flatHigh !== undefined) this.autoFlat = flatHigh !== false;
    const jobs = []; let boardChanged = false;
    if (speed !== undefined) this.speed = speed;
    if (cinema !== undefined) this.cine = cinema;
    if (labels !== undefined && labels !== this.labels) { this.labels = labels; for (const p of this.all) this.addLabel(p); this.updateLegend(); }
    if (quality && quality !== this.qualityReq) { this.qualityReq = quality; this.applyQuality(quality); }
    if (custom) { const j = JSON.stringify(custom); if (j !== this.customJson) { this.customJson = j; this.custom = custom; if ((board || this.boardKey) === 'custom') boardChanged = true; } }
    if (board && board !== this.boardKey) { this.boardKey = board; boardChanged = true; }
    if (boardChanged) jobs.push(this.buildBoard());
    if (bg && bg !== this.bgKey) jobs.push(this.setBackground(bg));
    if ((pcolor && pcolor !== this.scheme) || (set && set !== this.set)) { if (pcolor) this.scheme = pcolor; if (set) this.set = set; jobs.push(this.rebuildPieces()); }
    await Promise.all(jobs);
  }
  /** pre-build the alternatives a player is likely to pick next, a little at a time while idle */
  async prewarm({ boards = [], bgs = [], sets = [] } = {}) {
    await this.ready;
    const idle = () => new Promise(r => setTimeout(r, 120));
    for (const b of boards) { if (b !== 'custom') await makeBoardTextures(b, this.renderer); await idle(); }
    for (const k of bgs) { const L = BG_LOOK[k]; if (L) await makeTableTexture(L.table, this.renderer); await idle(); }
    for (const st of sets) { await this.ensureKit(st, this.scheme); await idle(); }
  }

  /* ---------- backgrounds (sky, floor, lighting, ambient effects) ---------- */
  async setBackground(key) {
    const L = BG_LOOK[key] || BG_LOOK.wood; const tok = ++this.bgTok; const tex = await makeTableTexture(L.table, this.renderer); if (tok !== this.bgTok) return; this.bgKey = key; const sc = this.scene;
    if (sc.background && sc.background.isTexture) sc.background.dispose(); sc.background = skyTexture([L.sky[0], L.sky[1], L.sky[1]]);
    sc.fog.color.setHex(L.fog); sc.fog.near = this.fogN = L.near; sc.fog.far = this.fogF = L.far;
    if (this.tableMesh) { this.scene.remove(this.tableMesh); this.tableMesh.material.dispose(); this.tableMesh.geometry.dispose(); }
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: L.tRough, metalness: L.tMetal, envMapIntensity: L.tEnv });
    this.tableMesh = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), m); this.tableMesh.rotation.x = -Math.PI / 2; this.tableMesh.position.y = -0.56; this.tableMesh.receiveShadow = true; this.scene.add(this.tableMesh);
    this.sun.color.setHex(L.sun); this.sun.intensity = L.sunI; this.warm.color.setHex(L.warm); this.warm.intensity = L.warmI; this.fill.color.setHex(L.fillC); this.fill.intensity = L.fillI;
    this.hemi.color.setHex(L.hemiS); this.hemi.groundColor.setHex(L.hemiG); this.hemi.intensity = L.hemiI; sc.environmentIntensity = L.env; this.renderer.toneMappingExposure = L.exp;
    this.buildBgFx(L);
  }
  buildBgFx(L) {
    if (this.bgFx) { this.scene.remove(this.bgFx.group); this.bgFx.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map && o.material.map !== this.dot && o.material.map !== this.glowGold) o.material.map.dispose(); o.material.dispose(); } }); this.bgFx = null; }
    if (!L.fx && !L.glows) return;
    const group = new THREE.Group(), rnd = (a, b) => a + Math.random() * (b - a); let upd = () => {};
    for (const [x, y, z, col, sz] of (L.glows || [])) {      // soft light halos (candles, sun, moon)
      const isMoon = col === 'moon'; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: isMoon ? moonTexture() : this.glowGold, color: isMoon ? 0xffffff : col, transparent: true, depthWrite: false, blending: isMoon ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false, toneMapped: false }));
      sp.position.set(x, y, z); sp.scale.setScalar(sz || 5); sp.renderOrder = -1; group.add(sp);
    }
    if (L.fx) {
      const kind = L.fx, N = { dust: 90, fireflies: 46, stars: 800, snow: 280 }[kind], pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        if (kind === 'stars') { const a = rnd(0, 6.283), e = rnd(0.12, 1.45), r = 95; pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
        else { pos[i * 3] = rnd(-16, 16); pos[i * 3 + 1] = rnd(0.3, kind === 'snow' ? 14 : 8); pos[i * 3 + 2] = rnd(-16, 16); vel[i * 3] = rnd(-0.3, 0.3); vel[i * 3 + 1] = kind === 'snow' ? -rnd(0.5, 1.3) : rnd(0.05, 0.3); vel[i * 3 + 2] = rnd(-0.3, 0.3); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ map: this.dot, color: { dust: 0xffd9a0, fireflies: 0xe6ff7a, stars: 0xffffff, snow: 0xffffff }[kind], size: { dust: 0.2, fireflies: 0.32, stars: 2.6, snow: 0.22 }[kind], sizeAttenuation: kind !== 'stars', transparent: true, depthWrite: false, blending: kind === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending, opacity: 0.9, fog: false });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; group.add(pts);
      upd = (dt, t) => {
        if (kind === 'stars') { mat.opacity = 0.75 + 0.25 * Math.sin(t * 1.7); pts.rotation.y += dt * 0.004; return; }
        const a = geo.attributes.position.array;
        for (let i = 0; i < N; i++) {
          const k = i * 3; a[k] += (vel[k] + (kind === 'snow' ? Math.sin(t + i) * 0.25 : Math.sin(t * 0.8 + i) * 0.2)) * dt; a[k + 1] += vel[k + 1] * dt; a[k + 2] += (vel[k + 2] + (kind === 'fireflies' ? Math.cos(t * 0.9 + i) * 0.3 : 0)) * dt;
          if (a[k + 1] < 0.1) a[k + 1] = kind === 'snow' ? 14 : 8; if (a[k + 1] > (kind === 'snow' ? 14.5 : 8.5)) a[k + 1] = 0.3; if (a[k] > 16) a[k] = -16; if (a[k] < -16) a[k] = 16; if (a[k + 2] > 16) a[k + 2] = -16; if (a[k + 2] < -16) a[k + 2] = 16;
        }
        geo.attributes.position.needsUpdate = true; if (kind === 'fireflies') mat.opacity = 0.55 + 0.45 * Math.sin(t * 2.3);
      };
    }
    this.scene.add(group); this.bgFx = { group, update: upd };
  }

  /* ---------- pieces ---------- */
  drop(p) { this.detachIcon(p); this.pieceRoot.remove(p.root); if (p.base) this.pieceRoot.remove(p.base); this.all.delete(p); }
  clearPieces() { this.hideTags(); for (const p of [...this.all]) this.drop(p); this.pieces.clear(); }
  loadPosition(b) { this.clearPieces(); for (let sq = 0; sq < 64; sq++) { const p = b[sq]; if (p) this.spawn(TYPE_CH[p & 7], p >> 3, sq); } this.clearMarks(); }
  at(sq) { return this.pieces.get(sq); }
  spawn(type, color, sq, scale = 1) {
    const key = type + color, kit = this.kit; let tpl = kit.tpl[key];
    if (!tpl) tpl = kit.tpl[key] = buildPiece(type, kit.set, kit.mats[color], color);
    const root = new THREE.Group(), tilt = new THREE.Group(), content = tpl.root.clone(true);
    root.rotation.order = 'YXZ'; tilt.rotation.order = 'YXZ'; tilt.add(content); root.add(tilt);
    const legs = []; content.traverse(o => { if (o.userData.leg) legs.push(o); });
    const p = { type, color, sq, root, tilt, content, legs, restYaw: color === 0 ? Math.PI : 0, height: tpl.height, base: null };
    const bm = content.getObjectByName('base');          // animals keep a flat base (+ team ring) that glides on the board while the animal moves above it
    if (bm) { p.base = new THREE.Group(); for (const nm of ['base', 'ring']) { const m = content.getObjectByName(nm); if (m) { m.parent.remove(m); p.base.add(m); } } this.pieceRoot.add(p.base); }
    const mark = o => o.traverse(m => { if (m.isMesh) m.userData.piece = p; }); mark(content); if (p.base) mark(p.base);
    this.all.add(p); this.addLabel(p); if (this.is2D) { p.content.visible = false; if (p.base) p.base.visible = false; }
    const [x, z] = sqPos(sq); root.position.set(x, 0.002, z); root.rotation.y = p.restYaw; root.scale.setScalar(scale);
    this.pieceRoot.add(root); this.pieces.set(sq, p); if (p.base) p.base.position.set(x, 0.002, z); if (this.is2D) this.attachIcon(p); return p;
  }
  updateLegend() {
    if (!this.legendMesh) return; const on = this.labels === 'border'; this.legendMesh.visible = on && !this.is2D;
    if (!on) return;
    if (this.legendSet !== this.set) {   // (re)paint the 16 border medallions for the current piece set
      if (this.legendTexs) for (const k in this.legendTexs) this.legendTexs[k].dispose();
      this.legendTexs = makeLegendIcons(this.set); this.legendSet = this.set;
    }
    for (const m of this.legendMesh.children) { const tx = this.legendTexs[m.userData.key]; if (m.material.map !== tx) { m.material.map = tx; m.material.needsUpdate = true; } }
  }
  /** glow on every border icon of the piece type you just selected (rooks a+h, knights b+g, ...) */
  legendFocus(type, color) {
    if (!this.legendGlows) this.legendGlows = [0, 1].map(() => { const q = this.quad(0xffffff, 0.9, 1.15, this.glowGold); q.renderOrder = 3; q.visible = false; return q; });
    for (const q of this.legendGlows) q.visible = false;
    if (!type || this.labels !== 'border' || this.is2D) return;
    let n = 0; LEGEND_ORDER.forEach((t, f) => { if (t === type && n < 2) { const q = this.legendGlows[n++]; q.position.set(f - 3.5, 0.008, color === 0 ? 5.05 : -5.05); q.visible = true; } });
  }
  /* floating badge above each piece: what it is + which team (ivory = White, dark = Black, gold/red border) */
  labelTexture(type, color) {
    const key = `${this.labels}|${this.set}|${type}|${color}`; if (this.labelCache[key]) return this.labelCache[key];
    const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d');
    const white = color === 0, fill = white ? '#f6ecd2' : '#1b1514', edge = white ? '#d9a62e' : '#d0323b', ink = white ? '#2a1a0a' : '#f6ecd2';
    x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 10; x.shadowOffsetY = 3;
    x.fillStyle = fill; x.beginPath(); x.arc(80, 78, 62, 0, 7); x.fill(); x.shadowColor = 'transparent';
    x.lineWidth = 11; x.strokeStyle = edge; x.stroke();
    const royal = this.set === 'royal', glyph = { p: '♟\uFE0E', n: royal ? '🐴' : '♞\uFE0E', b: royal ? '🐪' : '♝\uFE0E', r: royal ? '🐘' : '♜\uFE0E', q: '♛\uFE0E', k: '♚\uFE0E' }[type], letter = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }[type];
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (this.labels === 'letters') { x.fillStyle = ink; x.font = '900 82px Georgia, serif'; x.fillText(letter, 80, 84); }
    else { const emoji = /\p{Extended_Pictographic}/u.test(glyph) && !glyph.includes('\uFE0E'); x.fillStyle = ink; x.font = emoji ? '74px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif' : '900 86px "DejaVu Sans","Segoe UI Symbol",serif'; x.fillText(glyph, 80, emoji ? 86 : 84); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return (this.labelCache[key] = t);
  }
  addLabel(p) {
    if (p.label) { p.root.remove(p.label); p.label.material.dispose(); p.label = null; }
    if (this.labels !== 'above') return;
    const m = new THREE.SpriteMaterial({ map: this.labelTexture(p.type, p.color), transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const sp = new THREE.Sprite(m); sp.scale.setScalar(0.62); sp.position.set(0, p.height + 0.42, 0); sp.renderOrder = 6; sp.userData.piece = p; p.label = sp; p.root.add(sp);
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
    this.sel = sq; this.place(this.hl.sel, sq, 0.011); { const pc = this.at(sq); if (pc) this.legendFocus(pc.type, pc.color); }
    const p = this.at(sq); if (p) this.tween(0.14, e => { p.root.position.y = 0.002 + 0.16 * e; }, E.out);
    for (const t of targets) {
      const m = new THREE.Mesh(t.capture ? this.hl.ringGeo : this.hl.dotGeo, new THREE.MeshBasicMaterial({ color: t.capture ? 0xff4d4d : 0x39e07a, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 3; const [x, z] = sqPos(t.sq); m.position.set(x, 0.02, z); m.userData.cap = !!t.capture; this.hlGroup.add(m); this.targets.push(m);
    }
  }
  deselect(animate = true) {
    if (this.sel !== undefined && this.sel !== null) { const p = this.at(this.sel); if (p) { if (animate) { const y0 = p.root.position.y; this.tween(0.12, e => { p.root.position.y = y0 + (0.002 - y0) * e; }, E.out); } else p.root.position.y = 0.002; } }
    this.sel = null; if (this.hl.sel) this.hl.sel.visible = false; this.legendFocus(null);
    for (const m of this.targets) { this.hlGroup.remove(m); m.material.dispose(); } this.targets = [];
  }
  markLast(from, to) { this.ensureHl(); if (from < 0) { this.hl.from.visible = this.hl.to.visible = false; return; } this.place(this.hl.from, from, 0.008); this.place(this.hl.to, to, 0.009); }
  markCheck(sq) { this.ensureHl(); if (sq < 0) this.hl.check.visible = false; else this.place(this.hl.check, sq, 0.013); }
  showHint(from, to) { this.ensureHl(); if (from < 0) { this.hl.hintA.visible = this.hl.hintB.visible = false; return; } this.place(this.hl.hintA, from, 0.014); this.place(this.hl.hintB, to, 0.015); }
  clearMarks() { this.ensureHl(); this.deselect(false); this.markLast(-1); this.markCheck(-1); this.showHint(-1); }

  /* ---------- camera ---------- */
  /** looking straight down uses a narrow "telephoto" lens (square, undistorted board like a 2D app); low angles use the normal wide lens */
  fovOf(phi) { const k = Math.min(1, Math.max(0, (phi - 0.45) / 0.5)), e = k * k * (3 - 2 * k); return 24 + (54 - 24) * e; }
  resetCamera(view, instant) {
    const target = { white: [0, 0.03], black: [Math.PI, 0.03], whiteLow: [0, 0.95], blackLow: [Math.PI, 0.95], top: [this.controls.getAzimuthalAngle(), 0.14], side: [Math.PI / 2, 1.1] }[view] || [0, 0.03];
    const t = this.controls.target, tz = target[1] < 0.5 ? 1.25 : 0.5, fit = this.fitDist || 22, K54 = Math.tan(27 * Math.PI / 180);
    const app1 = fit * K54 * (target[1] < 0.5 ? 0.94 : 1);                                   // apparent size to keep (board width on screen)
    const th0 = this.controls.getAzimuthalAngle(), ph0 = this.controls.getPolarAngle(), z0 = t.z, app0 = this.camera.position.distanceTo(t) * Math.tan(this.camera.fov * Math.PI / 360);
    const dth = angDelta(th0, target[0]), set = e => { const ph = ph0 + (target[1] - ph0) * e, app = app0 + (app1 - app0) * e; t.z = z0 + (tz - z0) * e; this.setSph(th0 + dth * e, ph, app / Math.tan(this.fovOf(ph) * Math.PI / 360)); };
    if (instant) { set(1); return; }
    this.tween(0.8, set, E.io);
  }
  setSph(theta, phi, r) {
    const f = this.fovOf(phi); if (Math.abs(this.camera.fov - f) > 0.05) { this.camera.fov = f; this.camera.updateProjectionMatrix(); }
    const t = this.controls.target; this.camera.position.set(t.x + r * Math.sin(phi) * Math.sin(theta), t.y + r * Math.cos(phi), t.z + r * Math.sin(phi) * Math.cos(theta)); this.controls.update();
  }
  setMenuSpin(on) { this.menuSpin = on; this.controls.autoRotate = on; }

  /** cinematic move camera: ease toward the action, then back */
  cinemaIn(mx, mz, factor) {
    const c = this.controls, t0 = c.target.clone(), off = this.camera.position.clone().sub(t0), r0 = off.length();
    const t1 = new THREE.Vector3(mx * 0.6, 0.3, mz * 0.6 + 0.5 * 0.4), r1 = Math.max(c.minDistance + 0.5, r0 * factor);
    const saved = { t0, r0 }; this.cinemaOn = true;
    return this.tween(0.5, e => { const dir = this.camera.position.clone().sub(c.target).normalize(); c.target.lerpVectors(t0, t1, e); this.camera.position.copy(c.target).addScaledVector(dir, r0 + (r1 - r0) * e); c.update(); }, E.io).then(() => saved);
  }
  cinemaOut(saved) {
    const c = this.controls, t1 = c.target.clone(), r1 = this.camera.position.distanceTo(c.target);
    return this.tween(0.6, e => { const dir = this.camera.position.clone().sub(c.target).normalize(); c.target.lerpVectors(t1, saved.t0, e); this.camera.position.copy(c.target).addScaledVector(dir, r1 + (saved.r0 - r1) * e); c.update(); }, E.io).then(() => { this.cinemaOn = false; });
  }

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
  /** adaptive graphics: if the device can't keep ~30fps, step quality down automatically (only when quality = Auto) */
  govern(dt) {
    if (!this.autoQ || this.noAdapt || document.hidden || !this._busy) return;
    if (this.warmup === undefined) this.warmup = 45; if (this.warmup > 0) { this.warmup--; return; }   // ignore the first frames (shader warm-up)
    this.acc += dt; this.frames++;
    if (this.frames >= 60) {
      const avg = this.acc / this.frames; this.acc = 0; this.frames = 0;
      if (avg > 0.030 && this.quality !== 'low') { const next = this.quality === 'high' ? 'medium' : 'low'; const keep = this.autoQ; this.applyQuality(next); this.autoQ = keep; if (this.onQuality) this.onQuality(next); }
    }
  }
  update(dt) {
    this.t += dt; this.govern(dt);
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
    if (this.legendGlows) for (const q of this.legendGlows) if (q.visible) { const k = 1.1 + 0.15 * Math.sin(this.t * 6); q.scale.set(k, k, 1); }
    if (this.hl.sel && this.hl.sel.visible) this.hl.sel.material.opacity = 0.4 + 0.15 * Math.sin(this.t * 5);
    { const c = this.controls, d0 = this.camera.position.distanceTo(c.target);   // lens follows the camera's tilt; the distance is adjusted so the board keeps the same size on screen
      if (this._lastD === undefined || Math.abs(d0 - this._lastD) > 1e-3) this._app = d0 * Math.tan(this.camera.fov * Math.PI / 360);   // distance was changed by the player / move camera
      const f = this.fovOf(c.getPolarAngle());
      if (Math.abs(this.camera.fov - f) > 0.05) { this.camera.fov = f; this.camera.updateProjectionMatrix(); const nd = this._app / Math.tan(f * Math.PI / 360), dir = this.camera.position.clone().sub(c.target).normalize(); this.camera.position.copy(c.target).addScaledVector(dir, nd); }
      this._lastD = this.camera.position.distanceTo(c.target); const extra = Math.max(0, this._lastD - (this.fitDist || 20)); this.scene.fog.near = (this.fogN || 26) + extra; this.scene.fog.far = (this.fogF || 62) + extra; }
    this.updateFlat(); if (this.is2D) for (const p of this.all) this.syncIcon(p);
    this.updateTags(dt);
    if (this.bgFx) this.bgFx.update(dt, this.t);
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
    const animal = this.set === 'royal' && (mover.type === 'n' || mover.type === 'r' || mover.type === 'b');
    const cin = this.cine && !this.cinemaOn && (animal || victim) ? this.cinemaIn((x0 + x1) / 2, (z0 + z1) / 2, animal ? 0.68 : 0.8) : null;
    const jobs = [this.moveOne(mover, x0, z0, x1, z1, victim, info)];
    if (info.castle) {
      const rook = this.at(info.castle.from); this.pieces.delete(info.castle.from);
      const [rx0, rz0] = sqPos(info.castle.from), [rx1, rz1] = sqPos(info.castle.to);
      jobs.push(this.moveOne(rook, rx0, rz0, rx1, rz1, null, {})); rook.sq = info.castle.to; this.pieces.set(info.castle.to, rook);
    }
    await Promise.all(jobs);
    if (cin) { const saved = await cin; await this.wait(0.15); await this.cinemaOut(saved); }
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
