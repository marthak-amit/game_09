/* Procedural textures (no image files): wood grain, marble veins, felt, glass-like sapphire; board frame with engraved labels. */
import * as THREE from 'three';

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(x, y, s) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, o = 4) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { v += a * vnoise(x * f, y * f, s + i * 17); f *= 2; a *= 0.5; } return v; }
const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;

export const THEMES = {
  wood: { light: 0xeed3a4, dark: 0x7c4a2a, frame: 0x4a2a18, trim: 0xd9ad4a, label: 0xe8c98a, type: 'wood' },
  marble: { light: 0xeeeae3, dark: 0x2a2a2e, frame: 0x1c1a1a, trim: 0xd4af37, label: 0xd9c27a, type: 'marble', veinL: 0x8a8f99, veinD: 0xcaa646 },
  emerald: { light: 0xe8dfc2, dark: 0x2f6e52, frame: 0x3b2316, trim: 0xe0b84e, label: 0xe8d9a0, type: 'felt' },
  sapphire: { light: 0xc9d7ec, dark: 0x27487d, frame: 0x121b33, trim: 0xcfd6e6, label: 0xc3cde3, type: 'glass' }
};

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function woodPatch(ctx, x, y, w, h, base, seed, vertical) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.translate(x + w / 2, y + h / 2); if (vertical) ctx.rotate(Math.PI / 2); ctx.translate(-w / 2, -h / 2);
  const R = mulberry(seed), b = hex(base);
  ctx.fillStyle = css(b); ctx.fillRect(-w, -h, w * 3, h * 3);
  const n = Math.floor(h / 1.6);
  for (let i = -8; i < n + 8; i++) {
    const yy = (i / n) * h, tone = fbm(i * 0.31, seed * 0.01, seed, 3), c = mix(b, tone > 0.5 ? [255, 235, 200] : [30, 15, 5], Math.abs(tone - 0.5) * 0.55 + R() * 0.05);
    ctx.strokeStyle = css(c, 0.22 + R() * 0.2); ctx.lineWidth = 0.5 + R() * 1.8; ctx.beginPath();
    for (let xx = -4; xx <= w + 4; xx += 6) { const wob = Math.sin(xx * 0.035 + i * 0.7 + seed) * 2.2 + (fbm(xx * 0.01, i * 0.2, seed, 3) - 0.5) * 7; xx === -4 ? ctx.moveTo(xx, yy + wob) : ctx.lineTo(xx, yy + wob); }
    ctx.stroke();
  }
  const kx = R() * w, ky = R() * h;                       // gentle figured patch
  const g = ctx.createRadialGradient(kx, ky, 2, kx, ky, w * 0.5); g.addColorStop(0, css(mix(b, [20, 8, 0], 0.25), 0.35)); g.addColorStop(1, css(b, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function paintSquares(theme, seed) {
  const S = 1024, sq = S / 8, c = canvas(S, S), ctx = c.getContext('2d');
  const L = hex(theme.light), D = hex(theme.dark);
  if (theme.type === 'wood') {
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const dark = ((col + (7 - row)) & 1) === 0; woodPatch(ctx, col * sq, row * sq, sq, sq, dark ? theme.dark : theme.light, seed + row * 8 + col, (row + col) % 3 === 0);
    }
  } else {
    const img = ctx.createImageData(S, S), d = img.data, VL = hex(theme.veinL || 0), VD = hex(theme.veinD || 0);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const col = x >> 7, row = y >> 7, dark = ((col + (7 - row)) & 1) === 0, base = dark ? D : L; let r, g, b;
      if (theme.type === 'marble') {
        const n = fbm(x * 0.006, y * 0.006, seed + (dark ? 5 : 0), 5), vein = Math.pow(1 - Math.abs(Math.sin((x * 0.5 + y * 0.8) * 0.011 + n * 8)), dark ? 9 : 7), fine = Math.pow(1 - Math.abs(Math.sin((x * 0.9 - y * 0.4) * 0.03 + n * 14)), 14);
        const vc = dark ? VD : VL, cl = fbm(x * 0.02, y * 0.02, seed + 9, 3) * 0.12;
        r = base[0] * (1 - vein * 0.55 - fine * 0.3) + vc[0] * (vein * 0.55 + fine * 0.3) + cl * 255 * 0.3; g = base[1] * (1 - vein * 0.55 - fine * 0.3) + vc[1] * (vein * 0.55 + fine * 0.3) + cl * 255 * 0.3; b = base[2] * (1 - vein * 0.55 - fine * 0.3) + vc[2] * (vein * 0.55 + fine * 0.3) + cl * 255 * 0.3;
      } else if (theme.type === 'felt') {
        const nz = (hash2(x, y, seed) - 0.5) * (dark ? 20 : 12), t = fbm(x * 0.02, y * 0.02, seed, 3) - 0.5; r = base[0] + nz + t * 22; g = base[1] + nz + t * 22; b = base[2] + nz + t * 18;
      } else { // glass-like: soft swirls + sparkle
        const t = fbm(x * 0.004, y * 0.004, seed + (dark ? 3 : 0), 4), sw = Math.sin((x + y) * 0.01 + t * 9) * 0.5 + 0.5, sp = hash2(x, y, seed) > 0.9985 ? 120 : 0;
        r = base[0] + (sw - 0.5) * (dark ? 40 : 20) + sp; g = base[1] + (sw - 0.5) * (dark ? 46 : 20) + sp; b = base[2] + (sw - 0.5) * (dark ? 56 : 20) + sp;
      }
      const lx = x & 127, ly = y & 127, edge = Math.min(lx, 127 - lx, ly, 127 - ly), e = edge < 3 ? 0.78 + edge * 0.07 : 1;  // soft bevel between squares
      const i = (y * S + x) * 4; d[i] = clamp255(r * e); d[i + 1] = clamp255(g * e); d[i + 2] = clamp255(b * e); d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  if (theme.type === 'wood') { ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2; for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(i * sq, 0); ctx.lineTo(i * sq, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * sq); ctx.lineTo(S, i * sq); ctx.stroke(); } }
  return c;
}

function paintFrame(theme, seed) {
  const S = 1536, c = canvas(S, S), ctx = c.getContext('2d'), unit = S / 10.6;   // slab is 10.6 wide
  const wood = theme.type === 'marble' ? 0x1b1a1c : theme.frame;
  woodPatch(ctx, 0, 0, S, S, wood, seed + 77, false);
  const inner = 4 * unit;      // board half width in px
  const cx = S / 2, cy = S / 2;
  ctx.strokeStyle = css(hex(theme.trim), 0.9); ctx.lineWidth = 5; ctx.strokeRect(cx - inner - 14, cy - inner - 14, inner * 2 + 28, inner * 2 + 28);
  ctx.strokeStyle = css(hex(theme.trim), 0.45); ctx.lineWidth = 2; ctx.strokeRect(cx - inner - 36, cy - inner - 36, inner * 2 + 72, inner * 2 + 72);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3; ctx.strokeRect(14, 14, S - 28, S - 28);
  ctx.fillStyle = css(hex(theme.label), 0.95); ctx.font = `700 ${unit * 0.34}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5;
  const off = inner + unit * 0.52;
  for (let i = 0; i < 8; i++) {
    const x = cx + (i - 3.5) * unit, y = cy + (3.5 - i) * unit, f = 'abcdefgh'[i], r = String(i + 1);
    ctx.fillText(f, x, cy + off);
    ctx.save(); ctx.translate(x, cy - off); ctx.rotate(Math.PI); ctx.fillText(f, 0, 0); ctx.restore();
    ctx.save(); ctx.translate(cx - off, y); ctx.rotate(-Math.PI / 2); ctx.fillText(r, 0, 0); ctx.restore();
    ctx.save(); ctx.translate(cx + off, y); ctx.rotate(Math.PI / 2); ctx.fillText(r, 0, 0); ctx.restore();
  }
  return c;
}

function paintTable(seed) {
  const c = canvas(1024, 1024), ctx = c.getContext('2d');
  woodPatch(ctx, 0, 0, 1024, 1024, 0x3b2314, seed + 301, false);
  const g = ctx.createRadialGradient(512, 512, 100, 512, 512, 720); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 1024);
  return c;
}

function tex(canvasEl, renderer, repeat) {
  const t = new THREE.CanvasTexture(canvasEl); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}

export function makeBoardTextures(key, renderer) {
  const theme = THEMES[key] || THEMES.wood, seed = 7;
  return { theme, squares: tex(paintSquares(theme, seed), renderer), frame: tex(paintFrame(theme, seed), renderer), table: tex(paintTable(seed), renderer, 4) };
}
export function glowTexture(color) {
  const c = canvas(128, 128), ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, color); g.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.35)')); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function softDot() {
  const c = canvas(64, 64), ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
