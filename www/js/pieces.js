/* Procedural 3D chess pieces. Units: 1 board square = 1.0. Pieces face +Z in local space (y up). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

/* ---------- geometry helpers ---------- */
function clean(g) { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }
function lathe(profile, seg = 40) {
  seg = Math.max(18, Math.round(seg * 0.6));   // mobile-friendly triangle budget
  const pts = profile.map(p => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(pts, seg); g.computeVertexNormals(); return g;
}
function ellipsoid(rx, ry, rz, ws = 20, hs = 14) { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); return g; }
/** swept tube along a smooth curve with per-control-point radii (tapered limbs, necks, trunks, tails) */
function taper(points, radii, o = {}) {
  const radial = Math.max(8, Math.round((o.radial || 14) * 0.75)), segs = Math.round((o.segs || 28) * 0.8), ex = o.ex || 1, ez = o.ez || 1;
  const curve = new THREE.CatmullRomCurve3(points.map(p => V(p[0], p[1], p[2])), false, 'centripetal');
  const fr = curve.computeFrenetFrames(segs, false), pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, P = curve.getPointAt(t);
    const f = t * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(f)), u = f - k;
    const r = radii[k] + (radii[k + 1] - radii[k]) * (u * u * (3 - 2 * u));
    const N = fr.normals[i], Bn = fr.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU, c = Math.cos(a) * ex, s = Math.sin(a) * ez;
      pos.push(P.x + (N.x * c + Bn.x * s) * r, P.y + (N.y * c + Bn.y * s) * r, P.z + (N.z * c + Bn.z * s) * r);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c = (i + 1) * radial + j, d = (i + 1) * radial + (j + 1) % radial;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const parts = [g];
  if (o.caps !== false) {
    const s0 = ellipsoid(radii[0] * ex, radii[0], radii[0] * ez, 12, 8), s1 = ellipsoid(radii[radii.length - 1] * ex, radii[radii.length - 1], radii[radii.length - 1] * ez, 12, 8);
    s0.translate(points[0][0], points[0][1], points[0][2]); s1.translate(points[points.length - 1][0], points[points.length - 1][1], points[points.length - 1][2]);
    parts.push(clean(s0), clean(s1));
  }
  return mergeGeometries(parts.map(clean));
}

/** lofted body: explicit elliptical cross-sections [z, y, rx, ry] along Z, smooth (Catmull-Rom) between controls, rounded ends */
function loft(ctrl, o = {}) {
  const radial = Math.max(10, Math.round((o.radial || 22) * 0.7)), segs = Math.round((o.segs || 30) * 0.8), n = ctrl.length - 1, pos = [], idx = [];
  const sample = (t, k) => {
    const f = t * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
    const p0 = ctrl[Math.max(0, i - 1)][k], p1 = ctrl[i][k], p2 = ctrl[i + 1][k], p3 = ctrl[Math.min(n, i + 2)][k];
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  };
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, z = sample(t, 0), y = sample(t, 1), rx = Math.max(0.004, sample(t, 2)), ry = Math.max(0.004, sample(t, 3));
    for (let j = 0; j < radial; j++) { const a = (j / radial) * TAU; pos.push(Math.cos(a) * rx, y + Math.sin(a) * ry, z); }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c = (i + 1) * radial + j, d = (i + 1) * radial + (j + 1) % radial;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const f0 = ctrl[0], f1 = ctrl[n], e0 = ellipsoid(f0[2], f0[3], Math.min(f0[2], f0[3]) * 0.9, 12, 8), e1 = ellipsoid(f1[2], f1[3], Math.min(f1[2], f1[3]) * 0.9, 12, 8);
  e0.translate(0, f0[1], f0[0]); e1.translate(0, f1[1], f1[0]);
  return mergeGeometries([clean(g), clean(e0), clean(e1)]);
}

/** collects transformed geometries by material key, then merges them into one mesh per key */
class Kit {
  constructor() { this.parts = {}; }
  add(key, geom, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
    const g = clean(geom.clone ? geom.clone() : geom);
    const m = new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V(...s));
    g.applyMatrix4(m); (this.parts[key] ||= []).push(g); return this;
  }
  build(mats, castShadow = true) {
    const grp = new THREE.Group();
    for (const k in this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(this.parts[k]), mats[k]); mesh.name = k; mesh.castShadow = castShadow; mesh.receiveShadow = true; grp.add(mesh);
    }
    return grp;
  }
}

/* ---------- shared pieces ---------- */
function plinth(kit, R = 0.4, h = 0.11, key = 'body') {
  kit.add('ring', new THREE.TorusGeometry(R + 0.012, 0.021, 8, 56), { p: [0, 0.042, 0], r: [Math.PI / 2, 0, 0] });   // team ring: gold = White, red = Black
  kit.add(key, lathe([[0, 0], [R, 0], [R + 0.015, 0.02], [R + 0.015, 0.045], [R - 0.01, 0.065], [R - 0.05, 0.08], [R - 0.07, h], [0, h]], 48));
}

/* ---------- classic (Staunton-style) ---------- */
function pawn(kit) {
  plinth(kit, 0.31, 0.1);
  kit.add('body', lathe([[0, 0.08], [0.2, 0.1], [0.14, 0.2], [0.085, 0.34], [0.07, 0.42], [0.13, 0.47], [0.13, 0.5], [0.06, 0.52], [0, 0.52]], 36));
  kit.add('body', ellipsoid(0.115, 0.115, 0.115), { p: [0, 0.6, 0] });
}
function rookClassic(kit) {
  plinth(kit, 0.34, 0.1);
  kit.add('body', lathe([[0, 0.08], [0.25, 0.1], [0.2, 0.22], [0.15, 0.36], [0.14, 0.6], [0.2, 0.68], [0.22, 0.74], [0.2, 0.78], [0, 0.78]], 36));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; kit.add('body', new THREE.BoxGeometry(0.1, 0.12, 0.09), { p: [Math.cos(a) * 0.155, 0.84, Math.sin(a) * 0.155], r: [0, -a, 0] }); }
  kit.add('body', lathe([[0, 0.78], [0.17, 0.78], [0.17, 0.8], [0, 0.8]], 24));
}
function bishopClassic(kit) {
  plinth(kit, 0.34, 0.1);
  kit.add('body', lathe([[0, 0.08], [0.24, 0.1], [0.17, 0.22], [0.1, 0.4], [0.075, 0.6], [0.15, 0.68], [0.1, 0.74], [0, 0.74]], 36));
  const head = ellipsoid(0.115, 0.2, 0.115); kit.add('body', head, { p: [0, 0.9, 0] });
  kit.add('body', new THREE.SphereGeometry(0.04, 12, 8), { p: [0, 1.12, 0] });
  kit.add('accent', new THREE.BoxGeometry(0.015, 0.1, 0.16), { p: [0, 0.95, 0.07], r: [0.55, 0, 0] });
}
function queen(kit) {
  plinth(kit, 0.37, 0.1);
  kit.add('body', lathe([[0, 0.08], [0.28, 0.1], [0.2, 0.25], [0.12, 0.5], [0.09, 0.8], [0.14, 0.95], [0.22, 1.12], [0.17, 1.14], [0.1, 1.08], [0, 1.08]], 40));
  kit.add('accent', new THREE.TorusGeometry(0.15, 0.02, 8, 32), { p: [0, 0.9, 0], r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; kit.add('accent', new THREE.SphereGeometry(0.032, 10, 8), { p: [Math.cos(a) * 0.2, 1.15, Math.sin(a) * 0.2] }); }
  kit.add('accent', new THREE.SphereGeometry(0.06, 14, 10), { p: [0, 1.2, 0] });
  kit.add('accent2', new THREE.SphereGeometry(0.038, 12, 8), { p: [0, 1.27, 0] });   // jewel – the queen's crown is round & spiky, the king's is a cross
}
function king(kit) {
  plinth(kit, 0.38, 0.1);
  kit.add('body', lathe([[0, 0.08], [0.29, 0.1], [0.21, 0.25], [0.13, 0.5], [0.095, 0.85], [0.15, 1.0], [0.22, 1.12], [0.19, 1.2], [0.1, 1.22], [0, 1.22]], 40));
  kit.add('accent', new THREE.TorusGeometry(0.155, 0.022, 8, 32), { p: [0, 0.95, 0], r: [Math.PI / 2, 0, 0] });
  kit.add('accent', new THREE.BoxGeometry(0.085, 0.36, 0.085), { p: [0, 1.46, 0] });
  kit.add('accent', new THREE.BoxGeometry(0.28, 0.085, 0.085), { p: [0, 1.52, 0] });
  kit.add('accent', new THREE.SphereGeometry(0.06, 12, 8), { p: [0, 1.26, 0] });
}

/* ---------- Staunton horse-head knight ---------- */
function knightClassic(kit) {
  plinth(kit, 0.34, 0.1);
  kit.add('body', lathe([[0, 0.08], [0.25, 0.1], [0.2, 0.2], [0.17, 0.26], [0, 0.26]], 36));
  const s = new THREE.Shape();
  s.moveTo(-0.2, 0.2); s.bezierCurveTo(-0.24, 0.5, -0.18, 0.8, -0.04, 0.98);
  s.lineTo(-0.02, 1.12); s.lineTo(0.05, 1.02); s.lineTo(0.1, 1.1); s.lineTo(0.13, 0.98);
  s.bezierCurveTo(0.22, 0.9, 0.3, 0.72, 0.36, 0.56);
  s.bezierCurveTo(0.39, 0.5, 0.34, 0.45, 0.28, 0.47);
  s.bezierCurveTo(0.2, 0.52, 0.14, 0.56, 0.1, 0.5);
  s.bezierCurveTo(0.14, 0.4, 0.2, 0.3, 0.2, 0.2); s.lineTo(-0.2, 0.2);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 5, curveSegments: 18 });
  g.translate(0, 0, -0.07); g.rotateY(Math.PI / 2);   // profile u -> +Z (faces forward)
  kit.add('body', g, { p: [0, 0.04, -0.02], s: [1, 0.86, 1] });
  for (const sx of [-1, 1]) kit.add('dark', new THREE.SphereGeometry(0.022, 10, 8), { p: [sx * 0.12, 0.93, 0.2] });
  kit.add('mane', ellipsoid(0.028, 0.34, 0.08, 10, 14), { p: [0, 0.62, -0.17], r: [-0.18, 0, 0] });
}

/* ---------- horse (full animal, Indian-set knight) ---------- */
function legSet(mk, defs, thick, bend) {
  // defs: [x, z, hipY, front]. One continuous swept tube per leg (no ball joints) + hoof. Pivot = hip.
  const legs = [], u = thick / 0.04;
  for (const [x, z, hipY, front] of defs) {
    const k = new Kit(), g = hipY, kneeY = -(g - 0.34), fetY = -(g - 0.14);
    const kz = front ? 0.015 : -0.05, cz = front ? 0.0 : 0.035, fz = front ? 0.012 : 0.02;
    k.add('body', taper([[0, 0.09, 0.0], [0, -0.06, kz * 0.3], [0, kneeY, kz], [0, -(g - 0.22), cz], [0, fetY, fz]],
      [0.062 * u, 0.04 * u, 0.03 * u, 0.023 * u, 0.028 * u], { radial: 12, segs: 18, caps: true, ex: 0.92 }));
    k.add('dark', new THREE.CylinderGeometry(0.03 * u * 1.12, 0.036 * u * 1.15, 0.055, 14), { p: [0, fetY - 0.03, fz + 0.004] });
    const grp = k.build(mk); grp.position.set(x, hipY, z); grp.userData.leg = { front }; legs.push({ grp, front });
  }
  return legs;
}
function horse(kit, mk, out) {
  plinth(kit, 0.4, 0.1, 'base');
  const Y = 0.6;
  // one smooth lofted torso: rump -> barrel -> withers/chest
  kit.add('body', loft([[-0.31, Y + 0.03, 0.05, 0.06], [-0.27, Y + 0.04, 0.115, 0.125], [-0.17, Y + 0.035, 0.15, 0.168], [-0.02, Y + 0.0, 0.148, 0.168], [0.12, Y + 0.015, 0.145, 0.17], [0.24, Y + 0.05, 0.12, 0.15], [0.3, Y + 0.075, 0.07, 0.095]]));
  // arched neck blending into the withers
  kit.add('body', taper([[0, Y + 0.03, 0.2], [0, Y + 0.17, 0.3], [0, Y + 0.33, 0.37], [0, Y + 0.45, 0.4]], [0.115, 0.104, 0.086, 0.08], { radial: 18, segs: 22, ex: 0.8 }));
  // head: poll -> face -> muzzle (long wedge), cheek/jaw mass
  kit.add('body', taper([[0, Y + 0.48, 0.385], [0, Y + 0.42, 0.5], [0, Y + 0.31, 0.6], [0, Y + 0.255, 0.645]], [0.074, 0.066, 0.05, 0.043], { radial: 18, segs: 16, ex: 0.9 }));
  kit.add('body', ellipsoid(0.058, 0.07, 0.085), { p: [0, Y + 0.42, 0.445], r: [0.45, 0, 0] });
  for (const sx of [-1, 1]) {
    kit.add('dark', ellipsoid(0.011, 0.016, 0.016, 10, 8), { p: [sx * 0.062, Y + 0.46, 0.475] });                  // eyes (small, on the sides)
    kit.add('dark', new THREE.SphereGeometry(0.0125, 8, 6), { p: [sx * 0.027, Y + 0.262, 0.655] });                // nostrils
    kit.add('body', new THREE.ConeGeometry(0.02, 0.095, 8), { p: [sx * 0.04, Y + 0.57, 0.385], r: [-0.25, 0, sx * -0.14] }); // ears
  }
  // flowing mane: swept ribbon along the crest + a few strands, forelock
  for (const [ox, oz, w] of [[0, 0, 1], [0.012, -0.015, 0.8], [-0.012, -0.03, 0.7]]) {
    kit.add('mane', taper([[ox, Y + 0.54 + 0.0, 0.372 + oz], [ox, Y + 0.42, 0.33 + oz], [ox, Y + 0.27, 0.27 + oz - 0.01], [ox, Y + 0.12, 0.2 + oz - 0.03], [ox, Y + 0.06, 0.19 + oz - 0.07]],
      [0.03 * w, 0.044 * w, 0.042 * w, 0.034 * w, 0.014 * w], { radial: 8, segs: 20, ex: 0.45, ez: 1.3 }));
  }
  kit.add('mane', taper([[0, Y + 0.56, 0.4], [0, Y + 0.57, 0.45], [0, Y + 0.51, 0.485]], [0.026, 0.026, 0.01], { radial: 8, segs: 6 }));
  // tail: bushy, falling
  for (const [ox, w] of [[0, 1], [0.018, 0.75], [-0.018, 0.75]]) {
    kit.add('mane', taper([[ox, Y + 0.07, -0.3], [ox * 1.5, Y - 0.0, -0.42], [ox * 2, Y - 0.16, -0.47], [ox * 2.4, Y - 0.32, -0.45]], [0.024 * w, 0.042 * w, 0.038 * w, 0.01], { radial: 10, segs: 16 }));
  }
  const legs = legSet(mk, [[0.07, 0.19, 0.5, true], [-0.07, 0.19, 0.5, true], [0.07, -0.19, 0.5, false], [-0.07, -0.19, 0.5, false]], 0.04);
  out.legs = legs;
}

/* ---------- elephant (Indian-set rook) ---------- */
function elephant(kit, mk, out) {
  plinth(kit, 0.4, 0.1, 'base');
  const Y = 0.6;
  kit.add('body', ellipsoid(0.235, 0.215, 0.33), { p: [0, Y, -0.02] });
  kit.add('body', ellipsoid(0.2, 0.2, 0.2), { p: [0, Y + 0.02, -0.17] });
  kit.add('body', ellipsoid(0.185, 0.2, 0.19), { p: [0, Y + 0.08, 0.2] });
  kit.add('body', ellipsoid(0.17, 0.18, 0.175), { p: [0, Y + 0.17, 0.35] });             // head
  kit.add('body', ellipsoid(0.1, 0.1, 0.09), { p: [0, Y + 0.3, 0.33] });                 // forehead dome
  kit.add('body', taper([[0, Y + 0.08, 0.48], [0, Y - 0.06, 0.56], [0, Y - 0.22, 0.58], [0, Y - 0.33, 0.52], [0, Y - 0.3, 0.45]], [0.092, 0.075, 0.056, 0.04, 0.032], { radial: 14, segs: 26 })); // trunk
  for (const sx of [-1, 1]) {
    kit.add('body', ellipsoid(0.028, 0.19, 0.16), { p: [sx * 0.2, Y + 0.2, 0.27], r: [0, sx * 0.55, sx * 0.06] });            // ears
    kit.add('accent2', ellipsoid(0.012, 0.15, 0.125), { p: [sx * 0.206 + sx * 0.0, Y + 0.2, 0.283], r: [0, sx * 0.55, sx * 0.06] }); // inner ear tint
    kit.add('ivory', taper([[sx * 0.075, Y + 0.08, 0.46], [sx * 0.12, Y - 0.02, 0.56], [sx * 0.13, Y - 0.04, 0.68], [sx * 0.1, Y + 0.05, 0.76]], [0.028, 0.022, 0.014, 0.004], { radial: 10, segs: 14 })); // tusks
    kit.add('dark', new THREE.SphereGeometry(0.02, 10, 8), { p: [sx * 0.11, Y + 0.22, 0.46] });                                   // eyes
  }
  kit.add('body', taper([[0, Y + 0.0, -0.33], [0, Y - 0.12, -0.38], [0, Y - 0.26, -0.36]], [0.022, 0.016, 0.01], { radial: 8, segs: 8 }));
  // decorated blanket + howdah (tower) – the "rook" of the army
  kit.add('accent', new THREE.BoxGeometry(0.4, 0.035, 0.48), { p: [0, Y + 0.215, -0.02] });
  kit.add('accent', new THREE.BoxGeometry(0.03, 0.2, 0.46), { p: [0.225, Y + 0.12, -0.02], r: [0, 0, 0.18] });
  kit.add('accent', new THREE.BoxGeometry(0.03, 0.2, 0.46), { p: [-0.225, Y + 0.12, -0.02], r: [0, 0, -0.18] });
  kit.add('accent', new THREE.BoxGeometry(0.3, 0.2, 0.34), { p: [0, Y + 0.34, -0.03] });
  kit.add('body', new THREE.BoxGeometry(0.26, 0.17, 0.3), { p: [0, Y + 0.355, -0.03] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add('accent', new THREE.BoxGeometry(0.075, 0.06, 0.075), { p: [sx * 0.115, Y + 0.475, -0.03 + sz * 0.12] });
  kit.add('accent', new THREE.CylinderGeometry(0.0, 0.1, 0.1, 4), { p: [0, Y + 0.51, -0.03], r: [0, Math.PI / 4, 0] });
  const legs = legSet(mk, [[0.13, 0.2, 0.48, true], [-0.13, 0.2, 0.48, true], [0.13, -0.2, 0.48, false], [-0.13, -0.2, 0.48, false]], 0.075);
  out.legs = legs;
}

/* ---------- camel (Indian-set bishop) ---------- */
function camel(kit, mk, out) {
  plinth(kit, 0.4, 0.1, 'base');
  const Y = 0.62;
  kit.add('body', loft([[-0.31, Y + 0.03, 0.05, 0.06], [-0.27, Y + 0.04, 0.11, 0.12], [-0.17, Y + 0.03, 0.14, 0.16], [-0.02, Y + 0.0, 0.145, 0.165], [0.12, Y + 0.015, 0.138, 0.165], [0.24, Y + 0.05, 0.115, 0.145], [0.3, Y + 0.075, 0.07, 0.09]]));
  kit.add('body', ellipsoid(0.115, 0.14, 0.19), { p: [0, Y + 0.15, -0.04], r: [0.1, 0, 0] });               // hump
  kit.add('accent2', new THREE.BoxGeometry(0.3, 0.03, 0.3), { p: [0, Y + 0.165, -0.05], r: [0, 0, 0] });  // saddle blanket (cloth)
  kit.add('accent', new THREE.BoxGeometry(0.305, 0.012, 0.05), { p: [0, Y + 0.185, 0.05] });
  kit.add('accent2', new THREE.BoxGeometry(0.03, 0.18, 0.32), { p: [0.165, Y + 0.05, -0.05], r: [0, 0, 0.12] });
  kit.add('accent2', new THREE.BoxGeometry(0.03, 0.18, 0.32), { p: [-0.165, Y + 0.05, -0.05], r: [0, 0, -0.12] });
  // S-curved neck
  kit.add('body', taper([[0, Y + 0.04, 0.2], [0, Y + 0.14, 0.32], [0, Y + 0.26, 0.34], [0, Y + 0.36, 0.39], [0, Y + 0.41, 0.43]], [0.13, 0.1, 0.082, 0.072, 0.07], { radial: 16, segs: 24, ex: 0.9 }));
  kit.add('body', taper([[0, Y + 0.43, 0.42], [0, Y + 0.42, 0.52], [0, Y + 0.37, 0.61]], [0.068, 0.056, 0.042], { radial: 14, segs: 12 }));
  kit.add('body', ellipsoid(0.04, 0.036, 0.05), { p: [0, Y + 0.365, 0.62] });
  for (const sx of [-1, 1]) {
    kit.add('dark', ellipsoid(0.01, 0.015, 0.015, 8, 6), { p: [sx * 0.062, Y + 0.45, 0.47] });
    kit.add('body', new THREE.ConeGeometry(0.017, 0.06, 8), { p: [sx * 0.045, Y + 0.5, 0.4], r: [-0.2, 0, sx * -0.2] });
  }
  kit.add('mane', ellipsoid(0.04, 0.05, 0.04, 8, 6), { p: [0, Y + 0.5, 0.41] });
  kit.add('mane', taper([[0, Y + 0.0, -0.34], [0, Y - 0.1, -0.4], [0, Y - 0.2, -0.38]], [0.016, 0.014, 0.022], { radial: 8, segs: 8 }));
  const legs = legSet(mk, [[0.085, 0.2, 0.52, true], [-0.085, 0.2, 0.52, true], [0.085, -0.2, 0.52, false], [-0.085, -0.2, 0.52, false]], 0.034);
  out.legs = legs;
}

/* ---------- public API ---------- */
export const SETS = {
  royal: { name: 'Royal Animals', desc: 'Horse · Elephant · Camel' },
  staunton: { name: 'Classic Staunton', desc: 'Tournament style' }
};

/** returns {root, legs:[{grp,front}], height, rearPivot?, kind} */
/* Each animal gets its own body hue so the three look-alike quadrupeds are told apart at a glance:
   horse = ivory/black · camel = sandy gold / brown · elephant = steel blue-grey (White team lighter, Black team darker) */
const HUES = { // [white-team tint, black-team tint, mix]
  n: [0xf7f1e2, 0x1f1c1b, 0.55], b: [0xe0a84a, 0x7a4a1c, 0.8], r: [0x9fb4d4, 0x3b4c6e, 0.82]
};
function animalMats(type, mats, color) {
  const h = HUES[type]; if (!h) return mats; const cache = mats._tint || (mats._tint = {});
  if (!cache[type]) { const m = mats.body.clone(); m.color = mats.body.color.clone().lerp(new THREE.Color(h[color]), h[2]); cache[type] = { ...mats, body: m }; }
  return cache[type];
}
export function buildPiece(type, set, mats, color = 0) {
  const kit = new Kit(), out = { legs: [], kind: type };
  if (set !== 'staunton') mats = animalMats(type, mats, color);
  const staunton = set === 'staunton';
  switch (type) {
    case 'p': pawn(kit); break;
    case 'q': queen(kit); break;
    case 'k': king(kit); break;
    case 'r': staunton ? rookClassic(kit) : elephant(kit, mats, out); break;
    case 'b': staunton ? bishopClassic(kit) : camel(kit, mats, out); break;
    case 'n': staunton ? knightClassic(kit) : horse(kit, mats, out); break;
  }
  const root = new THREE.Group(), body = kit.build(mats);
  if (staunton && type === 'n') body.rotation.y = 0.75;   // Staunton knights are carved in profile – turn them to show it
  root.add(body);
  for (const l of out.legs) { root.add(l.grp); }
  if (!staunton && (type === 'n' || type === 'r' || type === 'b')) { const s = type === 'r' ? 0.9 : 0.95; body.scale.setScalar(s); body.position.z = -0.02; for (const l of out.legs) { l.grp.scale.setScalar(s); l.grp.position.z = l.grp.position.z * s - 0.02; l.grp.position.y *= s; } }
  const heights = { p: 0.75, n: 1.05, b: 1.1, r: 0.95, q: 1.3, k: 1.6 };
  out.root = root; out.height = heights[type];
  return out;
}

export function makeMaterials(scheme, color) {
  // scheme: {white:{color,rough,metal,clear}, black:{...}, accent, accent2, mane}
  const c = scheme[color === 0 ? 'white' : 'black'];
  const body = new THREE.MeshPhysicalMaterial({ color: c.color, roughness: c.rough, metalness: c.metal || 0, clearcoat: c.clear ?? 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.65 });
  return {
    body, base: body,
    ring: new THREE.MeshStandardMaterial({ color: color === 0 ? 0xe9b93c : 0xc4252e, metalness: 0.55, roughness: 0.32, emissive: color === 0 ? 0x6b4c0a : 0x5a0a10, emissiveIntensity: 0.55 }),
    accent: new THREE.MeshPhysicalMaterial({ color: scheme.accent[color], roughness: 0.34, metalness: 0.85, clearcoat: 0.2, envMapIntensity: 0.9 }),
    accent2: new THREE.MeshStandardMaterial({ color: scheme.accent2[color], roughness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 0.25 }),
    ivory: new THREE.MeshPhysicalMaterial({ color: 0xf4ecd8, roughness: 0.35, clearcoat: 0.5 }),
    mane: new THREE.MeshStandardMaterial({ color: scheme.mane[color], roughness: 0.55 })
  };
}
export const SCHEMES = {
  ivory: {
    name: 'Ivory & Ebony',
    white: { color: 0xd8c7a1, rough: 0.46, clear: 0.3 }, black: { color: 0x23201f, rough: 0.28, clear: 0.7 },
    accent: [0xd4a63a, 0xc9a24a], accent2: [0x9c2f2f, 0x6a1f2a], mane: [0x8a5a2e, 0x0e0c0c]
  },
  gold: {
    name: 'Gold & Silver',
    white: { color: 0xdfe3ea, rough: 0.22, metal: 1, clear: 0.2 }, black: { color: 0xd0a233, rough: 0.2, metal: 1, clear: 0.2 },
    accent: [0x3b5a9a, 0x7a1f2b], accent2: [0x2d4a7a, 0x5a1620], mane: [0x6b6f78, 0x6b4a10]
  },
  rosewood: {
    name: 'Maple & Rosewood',
    white: { color: 0xe6c99a, rough: 0.45, clear: 0.35 }, black: { color: 0x5a2a20, rough: 0.4, clear: 0.5 },
    accent: [0xb87333, 0xd4a63a], accent2: [0x8c3b2e, 0x2e1410], mane: [0x6a4020, 0x1b0e0a]
  }
};
