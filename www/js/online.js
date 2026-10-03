/* Royal Chess 3D – online play: backend-agnostic helpers + a local demo backend (two browser tabs) + backend loader.
   A backend implements:
     init() → user | signIn(provider) → user | signOut() | setName(name)
     createRoom({tc}) → code | joinRoom(code) → room | watchRoom(code, cb) → unsubscribe
     pushMove(code, uci, expectedLen) | finish(code, result, reason) | leaveRoom(code)
     quickMatch({tc}, onWait) → {code} | cancelQuick()
   room = { code, status:'waiting'|'playing'|'over', host:P, guest:P|null, hostColor:0|1, tc, moves:[uci], result:{result,reason}|null }   P = {uid,name,photo,rating} */
import { FIREBASE_CONFIG } from './firebase-config.js';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
export const makeCode = () => { let s = ''; const a = crypto.getRandomValues(new Uint8Array(6)); for (const v of a) s += ALPHA[v % ALPHA.length]; return s; };
export const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const AV = ['🦁', '🐯', '🦊', '🐼', '🐨', '🐸', '🦉', '🐙', '🦄', '🐲', '🦅', '🐺', '🐧', '🦈', '🐢', '🦋'];
export const avatarFor = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AV[h % AV.length]; };
export const guestName = () => 'Guest' + (1000 + Math.floor(Math.random() * 9000));
/** names/emojis for the decorative "finding opponent" reel */
export const REEL_NAMES = ['Aarav', 'Mia', 'Kabir', 'Zoe', 'Rohan', 'Lena', 'Vihaan', 'Sara', 'Arjun', 'Nora', 'Ishaan', 'Ella', 'Dev', 'Ava', 'Kian', 'Anaya', 'Leo', 'Riya', 'Omar', 'Maya'];
export const REEL_AVATARS = AV;

/* ---------------- local demo backend (localStorage + storage events: open the game in two tabs) ---------------- */
const LS = { rooms: 'rc3d_demo_rooms', queue: 'rc3d_demo_queue' };
const rd = k => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } };
const wr = (k, v) => localStorage.setItem(k, JSON.stringify(v));
export function localBackend() {
  let me = null; const subs = new Set(); let quickTimer = null;
  window.addEventListener('storage', e => { if (e.key === LS.rooms || e.key === LS.queue) subs.forEach(f => f()); });
  const notify = () => subs.forEach(f => f());
  const B = {
    name: 'demo',
    async init() {
      if (!me) { let u = sessionStorage.getItem('rc3d_demo_user'); u = u ? JSON.parse(u) : { uid: 'u' + Math.random().toString(36).slice(2, 10), name: guestName(), guest: true, provider: 'guest', rating: 800 }; u.photo = ''; me = u; sessionStorage.setItem('rc3d_demo_user', JSON.stringify(u)); }
      return me;
    },
    async signIn(p) { me = { ...me, name: (p === 'google' ? 'Demo Google' : 'Demo Facebook') + ' User', guest: false, provider: p }; sessionStorage.setItem('rc3d_demo_user', JSON.stringify(me)); return me; },
    async signOut() { me = { ...me, guest: true, provider: 'guest', name: guestName() }; sessionStorage.setItem('rc3d_demo_user', JSON.stringify(me)); return me; },
    async setRating(r) { me.rating = r; sessionStorage.setItem('rc3d_demo_user', JSON.stringify(me)); },
    async setName(n) { me.name = n; sessionStorage.setItem('rc3d_demo_user', JSON.stringify(me)); },
    _p() { return { uid: me.uid, name: me.name, photo: me.photo || '', rating: me.rating || 800 }; },
    async createRoom({ tc, bet = 0 }) {
      const rooms = rd(LS.rooms); let code; do code = makeCode(); while (rooms[code]);
      rooms[code] = { code, status: 'waiting', host: B._p(), guest: null, hostColor: Math.random() < 0.5 ? 0 : 1, tc, bet, moves: [], result: null, t: Date.now() }; wr(LS.rooms, rooms); notify(); return code;
    },
    async joinRoom(code, coins = 1e9) {
      const rooms = rd(LS.rooms), r = rooms[code]; if (!r) throw new Error('notfound');
      if (r.host.uid === me.uid) return r; if (!r.guest && (r.bet || 0) > coins) throw new Error('poor:' + r.bet); if (r.guest && r.guest.uid !== me.uid) throw new Error('full'); if (r.status === 'over') throw new Error('over');
      r.guest = B._p(); r.status = 'playing'; wr(LS.rooms, rooms); notify(); return r;
    },
    watchRoom(code, cb) { const f = () => { const r = rd(LS.rooms)[code]; cb(r || null); }; subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
    async pushMove(code, uci, len) { const rooms = rd(LS.rooms), r = rooms[code]; if (!r || r.moves.length !== len) throw new Error('stale'); r.moves.push(uci); wr(LS.rooms, rooms); notify(); },
    async finish(code, result, reason) { const rooms = rd(LS.rooms), r = rooms[code]; if (!r || r.result) return; r.result = { result, reason }; r.status = 'over'; wr(LS.rooms, rooms); notify(); },
    async leaveRoom(code) { const rooms = rd(LS.rooms), r = rooms[code]; if (r && r.status === 'waiting' && r.host.uid === me.uid) { delete rooms[code]; wr(LS.rooms, rooms); notify(); } },
    quickMatch({ tc }) {
      return new Promise((resolve, reject) => {
        const q = rd(LS.queue), now = Date.now();
        for (const [uid, e] of Object.entries(q)) if (now - e.t > 30000) delete q[uid];
        const other = Object.values(q).find(e => e.uid !== me.uid && !e.room && e.tc === tc);
        if (other) {   // I am the seeker: create the room with the waiting player as host
          const rooms = rd(LS.rooms); let code; do code = makeCode(); while (rooms[code]);
          rooms[code] = { code, status: 'playing', host: { uid: other.uid, name: other.name, photo: '', rating: other.rating }, guest: B._p(), hostColor: Math.random() < 0.5 ? 0 : 1, tc, moves: [], result: null, t: now };
          q[other.uid].room = code; wr(LS.rooms, rooms); wr(LS.queue, q); notify(); return resolve({ code });
        }
        q[me.uid] = { uid: me.uid, name: me.name, rating: me.rating || 800, tc, t: now, room: null }; wr(LS.queue, q);
        const beat = () => { const qq = rd(LS.queue); if (qq[me.uid]) { qq[me.uid].t = Date.now(); wr(LS.queue, qq); } };
        const check = () => { const e = rd(LS.queue)[me.uid]; if (e && e.room) { stop(); const qq = rd(LS.queue); delete qq[me.uid]; wr(LS.queue, qq); resolve({ code: e.room }); } };
        const stop = () => { subs.delete(check); clearInterval(quickTimer); B._cancel = null; };
        subs.add(check); quickTimer = setInterval(beat, 8000);
        B._cancel = () => { stop(); const qq = rd(LS.queue); delete qq[me.uid]; wr(LS.queue, qq); reject(new Error('cancelled')); };
      });
    },
    cancelQuick() { if (B._cancel) B._cancel(); }
  };
  return B;
}

/* ---------------- loader ---------------- */
let backend = null;
/** returns a backend, or null when online play is not configured (phone without Firebase config) */
export async function getBackend() {
  if (backend) return backend;
  const demo = new URLSearchParams(location.search).get('online') === 'demo';
  if (FIREBASE_CONFIG && !demo) {
    const mod = await import('../vendor/online-firebase.js');
    backend = mod.firebaseBackend(FIREBASE_CONFIG);
  } else if (demo || (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform())) {
    backend = localBackend();
  } else return null;
  return backend;
}
export const isConfigured = () => !!FIREBASE_CONFIG;
