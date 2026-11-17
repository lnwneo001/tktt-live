'use strict';
/* TKTT SadLab Web — same API as the other TKTT cores, but everything is stored in this
   browser (localStorage). No server, no app: just open the page. */
const TKTT = (() => {
  const VERSION = 'W1.0.0';
  const EQ_BANDS = 36, CH_EQ = 'tktt-eq-v4', CH_STATUS = 'tktt-status-v4';
  const LS = 'tktt-web-v1';
  const DEFAULT_DJ = { title: '', artist: '', album: '', cover: '', current: 0, duration: 0, playing: false, connected: false, lastYtUpdate: 0 };
  const DEFAULT_SETTINGS = {
    roomId: 'cafe-neon', fadeMs: 900,
    eqMode: 'demo', eqSensitivity: 1.4, eqAttackMs: 45, eqReleaseMs: 260,
    musicDemo: false, showNames: false, showRankCaption: false, useVideo: true, showEqBadge: false,
    fitMode: 'contain', boothTitle: 'TKTT SadLab DJ LIVE', boothSubtitle: 'ฟังเพลงไปด้วยกัน', showCover: true,
    autoRotate: { enabled: false, minutes: 10, rooms: [] }
  };
  const FIXED = {
    roomFiles: { 'neon': 'assets/rooms/neon.jpg', 'cafe-neon': 'assets/rooms/cafe-neon.jpg', 'cafe': 'assets/rooms/cafe.jpg', 'beach-sunset': 'assets/rooms/beach-sunset.jpg' },
    roomVideoFiles: { 'cafe-neon': 'assets/rooms/cafe-neon.mp4' }
  };
  let store = {};
  try { store = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (_) { store = {}; }
  const subs = [];
  function persist() { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (_) {} }
  function emit(d) { for (const cb of subs) { try { cb(d); } catch (e) { console.error('[TKTT]', e); } } }
  addEventListener('storage', e => { if (e.key !== LS) return; try { store = JSON.parse(e.newValue || '{}') || {}; emit(store); } catch (_) {} });

  async function get(keys) { const out = {}; for (const k of [].concat(keys || [])) { if (k in FIXED) out[k] = FIXED[k]; else if (k in store) out[k] = store[k]; } return out; }
  async function set(obj) { Object.assign(store, obj); persist(); emit(obj); }
  async function remove(keys) { for (const k of [].concat(keys)) delete store[k]; persist(); }
  function subscribe(cb) { subs.push(cb); }
  async function getSettings() { return { ...DEFAULT_SETTINGS, ...(store.settings || {}) }; }
  async function patchSettings(p) { const s = { ...(await getSettings()), ...p }; await set({ settings: s }); return s; }
  async function getDJ() { return { ...DEFAULT_DJ }; }
  function fmtTime(t) { const n = Math.max(0, Math.floor(Number(t) || 0)); return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
  function log(level, source, msg) { try { console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[TKTT]', source, msg); } catch (_) {} }
  function channel(name) { try { return new BroadcastChannel(name); } catch (_) { return null; } }
  const isValidImageData = v => typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(v);
  return { VERSION, MOBILE: true, WEB: true, EQ_BANDS, CH_EQ, CH_STATUS, DEFAULT_DJ, DEFAULT_SETTINGS, DEFAULT_CONNECTOR: '', KEY: '',
    hasChrome: false, get, set, remove, subscribe, getSettings, patchSettings, getDJ, fmtTime, log, send: async () => ({ ok: false }),
    channel, isValidImageData, setRole() {}, onConnection(f) { f(true); }, withKey: p => p, FIXED };
})();
self.TKTT = TKTT;
