/* Firebase backend for Royal Chess 3D online play (bundled to www/vendor/online-firebase.js with `npm run build:online`).
   Auth: anonymous guest by default → upgrade to Google / Facebook (account linking keeps the same uid and rating).
   Data: Firestore (see firestore.rules): users/{uid}, rooms/{code}, queue/{uid}. */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, FacebookAuthProvider, linkWithCredential, linkWithPopup, signInWithCredential, signInWithPopup, signOut, updateProfile } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction, collection, query, where, limit, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => { let s = ''; for (const v of crypto.getRandomValues(new Uint8Array(6))) s += ALPHA[v % ALPHA.length]; return s; };
const guestName = () => 'Guest' + (1000 + Math.floor(Math.random() * 9000));
const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const nativeAuth = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication;

export function firebaseBackend(config) {
  const app = initializeApp(config), auth = getAuth(app);
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  let me = null, quick = null;
  const P = () => ({ uid: me.uid, name: me.name, photo: me.photo || '', rating: me.rating || 800 });

  async function loadProfile(fu) {
    const ref = doc(db, 'users', fu.uid); let d = null;
    try { const s = await getDoc(ref); d = s.exists() ? s.data() : null; } catch (e) { /* offline */ }
    const guest = fu.isAnonymous, provider = guest ? 'guest' : (fu.providerData[0] && fu.providerData[0].providerId.replace('.com', '')) || 'user';
    const name = (d && d.name) || fu.displayName || guestName();
    me = { uid: fu.uid, name, photo: guest ? '' : (fu.photoURL || (d && d.photo) || ''), guest, provider, rating: (d && d.rating) || 800 };
    try { await setDoc(ref, { name: me.name, photo: me.photo, rating: me.rating, provider, updatedAt: serverTimestamp() }, { merge: true }); } catch (e) { /* ignore */ }
    return me;
  }
  const B = {
    name: 'firebase',
    async init() {
      const fu = await new Promise(res => { const un = onAuthStateChanged(auth, u => { un(); res(u); }); });
      return loadProfile(fu || (await signInAnonymously(auth)).user);
    },
    /** provider: 'google' | 'facebook'. Upgrades the guest account in place when possible. */
    async signIn(p) {
      let cred;
      if (native()) {
        const plug = nativeAuth(); if (!plug) throw new Error('native-plugin-missing');
        const r = p === 'google' ? await plug.signInWithGoogle({ skipNativeAuth: true }) : await plug.signInWithFacebook({ skipNativeAuth: true });
        cred = p === 'google' ? GoogleAuthProvider.credential(r.credential.idToken, r.credential.accessToken) : FacebookAuthProvider.credential(r.credential.accessToken);
      }
      const cur = auth.currentUser;
      try {
        if (native()) { if (cur && cur.isAnonymous) await linkWithCredential(cur, cred); else await signInWithCredential(auth, cred); }
        else { const prov = p === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider(); if (cur && cur.isAnonymous) await linkWithPopup(cur, prov); else await signInWithPopup(auth, prov); }
      } catch (e) {
        if (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use') {   // this Google/Facebook account already has a profile → just sign into it
          const c2 = native() ? cred : (e.credential || (p === 'google' ? GoogleAuthProvider.credentialFromError(e) : FacebookAuthProvider.credentialFromError(e)));
          await signInWithCredential(auth, c2);
        } else throw e;
      }
      return loadProfile(auth.currentUser);
    },
    async signOut() { try { if (native() && nativeAuth()) await nativeAuth().signOut(); } catch (e) { /* ignore */ } await signOut(auth); return loadProfile((await signInAnonymously(auth)).user); },
    async setRating(r) { me.rating = r; await setDoc(doc(db, 'users', me.uid), { rating: r }, { merge: true }); },
    async setName(n) { me.name = n; try { await updateProfile(auth.currentUser, { displayName: n }); } catch (e) { /* ignore */ } await setDoc(doc(db, 'users', me.uid), { name: n }, { merge: true }); },

    async createRoom({ tc, bet = 0 }) {
      for (let i = 0; i < 6; i++) {
        const code = makeCode(), ref = doc(db, 'rooms', code);
        const ok = await runTransaction(db, async tx => { if ((await tx.get(ref)).exists()) return false; tx.set(ref, { code, status: 'waiting', host: P(), guest: null, hostColor: Math.random() < 0.5 ? 0 : 1, tc, bet, moves: [], result: null, t: Date.now(), players: [me.uid] }); return true; });
        if (ok) return code;
      }
      throw new Error('code-collision');
    },
    async joinRoom(code, coins = 1e9) {
      const ref = doc(db, 'rooms', code);
      return runTransaction(db, async tx => {
        const s = await tx.get(ref); if (!s.exists()) throw new Error('notfound'); const r = s.data();
        if (r.host.uid === me.uid || (r.guest && r.guest.uid === me.uid)) return r;
        if (r.guest) throw new Error('full'); if (r.status === 'over') throw new Error('over'); if ((r.bet || 0) > coins) throw new Error('poor:' + r.bet);
        tx.update(ref, { guest: P(), status: 'playing', players: [r.host.uid, me.uid] }); return { ...r, guest: P(), status: 'playing' };
      });
    },
    watchRoom(code, cb) { return onSnapshot(doc(db, 'rooms', code), s => cb(s.exists() ? s.data() : null), () => cb(null)); },
    async pushMove(code, uci, len) {
      const ref = doc(db, 'rooms', code);
      await runTransaction(db, async tx => { const r = (await tx.get(ref)).data(); if (!r || r.moves.length !== len) throw new Error('stale'); tx.update(ref, { moves: [...r.moves, uci], t: Date.now() }); });
    },
    async finish(code, result, reason) {
      const ref = doc(db, 'rooms', code);
      await runTransaction(db, async tx => { const r = (await tx.get(ref)).data(); if (!r || r.result) return; tx.update(ref, { result: { result, reason }, status: 'over' }); });
    },
    async leaveRoom(code) { try { const ref = doc(db, 'rooms', code), s = await getDoc(ref); if (s.exists() && s.data().status === 'waiting' && s.data().host.uid === me.uid) await deleteDoc(ref); } catch (e) { /* ignore */ } },

    /** random opponent: look for a waiting player; otherwise wait in the queue until someone picks us. */
    quickMatch({ tc }) {
      return new Promise(async (resolve, reject) => {
        let done = false, unsub = null, beat = null; const qref = doc(db, 'queue', me.uid);
        const cleanup = async () => { done = true; if (unsub) unsub(); clearInterval(beat); quick = null; try { await deleteDoc(qref); } catch (e) { /* ignore */ } };
        quick = () => { if (done) return; cleanup(); reject(new Error('cancelled')); };
        try {
          const snap = await getDocs(query(collection(db, 'queue'), where('tc', '==', tc), limit(12))), now = Date.now();
          const cands = snap.docs.map(d => d.data()).filter(e => e.uid !== me.uid && !e.room && now - e.t < 25000).sort((a, b) => a.t - b.t);
          for (const c of cands) {   // seeker: claim a waiting player and create the room
            const code = makeCode(), rref = doc(db, 'rooms', code), cref = doc(db, 'queue', c.uid);
            const ok = await runTransaction(db, async tx => {
              const cs = await tx.get(cref); if (!cs.exists() || cs.data().room) return false;
              tx.update(cref, { room: code });
              tx.set(rref, { code, status: 'playing', host: { uid: c.uid, name: c.name, photo: c.photo || '', rating: c.rating || 800 }, guest: P(), hostColor: Math.random() < 0.5 ? 0 : 1, tc, moves: [], result: null, t: Date.now(), players: [c.uid, me.uid] }); return true;
            }).catch(() => false);
            if (ok) { done = true; quick = null; return resolve({ code }); }
          }
          await setDoc(qref, { uid: me.uid, name: me.name, photo: me.photo || '', rating: me.rating || 800, tc, t: Date.now(), room: null });
          beat = setInterval(() => updateDoc(qref, { t: Date.now() }).catch(() => {}), 8000);
          unsub = onSnapshot(qref, s => { const d = s.exists() ? s.data() : null; if (d && d.room && !done) { cleanup().then(() => resolve({ code: d.room })); } });
        } catch (e) { await cleanup(); reject(e); }
      });
    },
    cancelQuick() { if (quick) quick(); }
  };
  return B;
}

/** public remote config document `config/app` (no sign-in needed) – used for the force-update switch */
export async function fetchAppConfig(config) {
  const app = initializeApp(config, 'cfg'), db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  const s = await getDoc(doc(db, 'config', 'app')); return s.exists() ? s.data() : null;
}
