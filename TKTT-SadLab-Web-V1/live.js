'use strict';
/* LIVE 9:16 renderer. Each subsystem is isolated: an error in one never stops the others. */
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const PREVIEW = params.get('preview');            // room id, 'current', or null for the real LIVE
const IS_MAIN = !PREVIEW;
const SHOW_GUIDES = params.get('guides') === '1';
const W = 1080, H = 1920;
var stageScale = 1;

addEventListener('error', e => TKTT.log('error', 'live', 'JS error: ' + e.message));
addEventListener('unhandledrejection', e => TKTT.log('error', 'live', 'Promise error: ' + (e.reason && e.reason.message || e.reason)));

function guard(name, fn) {
  return (...a) => { try { return fn(...a); } catch (e) { TKTT.log('error', 'live', `${name}: ${e.message}`); } };
}

/* ---------- Scale stage to window without distortion ---------- */
const fit = guard('fit', () => {
  let cover = false; try { cover = settings.fitMode === 'cover'; } catch (_) { /* settings not loaded yet */ }
  const s = (cover ? Math.max : Math.min)(innerWidth / W, innerHeight / H);
  $('stage').style.transform = `translate(-50%,-50%) scale(${s})`;
  stageScale = s;
  try { drawSeats(); } catch (_) {}
});
addEventListener('resize', fit); fit();
if (SHOW_GUIDES) $('guides').hidden = false;

let settings = { ...TKTT.DEFAULT_SETTINGS };
let layouts = {}, adjusts = {};

/* ---------- Rooms ---------- */
let currentRoom = null, activeLayer = 'bgA', roomReq = 0;
function roomToShow() { return (PREVIEW && PREVIEW !== 'current') ? PREVIEW : settings.roomId; }

async function applyRoom(force = false) {
  const id = roomToShow();
  const req = ++roomReq;
  const room = ROOMS.byId(id) || ROOMS.byId('neon');
  const img = await ROOMS.resolveImage(room.id);
  const vid = settings.useVideo !== false ? await ROOMS.resolveVideo(room.id) : { url: '', source: 'off' };
  if (req !== roomReq) return;
  const layout = ROOMS.layoutFor(room.id, layouts);
  const filter = ROOMS.filterCss(ROOMS.adjustFor(room.id, adjusts));

  if (!img.url && !vid.url) {
    if (IS_MAIN && room.id !== 'neon') {
      TKTT.log('warn', 'live', `ห้อง "${room.name}" ยังไม่มีภาพฉาก — ใช้ห้อง DJ นีออนแทน`);
      settings.roomId = 'neon';
      return applyRoom(true);
    }
    $('noImage').hidden = false; $('noImageName').textContent = room.name;
    placeUi(layout);
    currentRoom = room.id + '|none';
    return;
  }
  $('noImage').hidden = true;
  const key = [room.id, img.url.length, img.url.slice(-40), vid.url].join('|');
  const front = $(activeLayer);
  if (key === currentRoom && !force) { for (const el of front.children) el.style.filter = filter; placeUi(layout); return; }

  const backId = activeLayer === 'bgA' ? 'bgB' : 'bgA';
  const back = $(backId);
  const ok = await loadLayer(back, img, vid, filter, room);
  if (req !== roomReq || !ok) return;
  const fade = currentRoom ? Math.max(0, Number(settings.fadeMs) || 0) : 0;
  $('stage').style.setProperty('--fade', fade + 'ms');
  const ui = $('ui');
  if (currentRoom && fade) ui.classList.add('moving');
  back.classList.add('on'); front.classList.remove('on');
  activeLayer = backId; currentRoom = key;
  setTimeout(() => { placeUi(layout); ui.classList.remove('moving'); }, fade ? Math.min(fade, 450) : 0);
  setTimeout(() => releaseLayer(front), fade + 100);   // stop decoding the old video
  try { const bi = $('backdrop').querySelector('img'); if (img.url) bi.src = img.url; else bi.removeAttribute('src'); } catch (_) {}
  if (IS_MAIN) TKTT.log('info', 'live', 'เปลี่ยนฉากเป็น ' + room.name + (back.dataset.mode === 'video' ? ' (วิดีโอ)' : ''));
}

/** Fill a background layer with the room's video (preferred) or its still image. */
async function loadLayer(layer, img, vid, filter, room) {
  const im = layer.querySelector('img'), v = layer.querySelector('video');
  im.style.filter = filter; v.style.filter = filter;
  if (vid.url) {
    try {
      if (img.url) { v.poster = img.url; im.src = img.url; }
      v.src = vid.url; v.muted = true; v.hidden = false; im.hidden = true;
      await Promise.race([
        new Promise((res, rej) => { v.oncanplay = res; v.onerror = () => rej(new Error('ไฟล์วิดีโอเปิดไม่ได้หรือไม่รองรับ')); }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('โหลดวิดีโอนานเกินไป')), 8000))
      ]);
      await v.play();
      v.onerror = () => fallbackToImage(layer, img, room, 'วิดีโอหยุดทำงานระหว่างเล่น');
      layer.dataset.mode = 'video';
      return true;
    } catch (e) {
      TKTT.log('warn', 'live', `วิดีโอห้อง ${room.name}: ${e.message} — ใช้ภาพนิ่งแทน`);
      v.removeAttribute('src'); v.load(); v.hidden = true;
      if (!img.url) return false;
    }
  }
  v.hidden = true; im.hidden = false;
  im.src = img.url;
  try { await im.decode(); } catch (e) { TKTT.log('error', 'live', 'โหลดภาพฉากไม่สำเร็จ: ' + room.name); return false; }
  layer.dataset.mode = 'image';
  return true;
}
function fallbackToImage(layer, img, room, why) {
  const v = layer.querySelector('video'), im = layer.querySelector('img');
  TKTT.log('warn', 'live', `${room.name}: ${why} — สลับเป็นภาพนิ่ง`);
  v.hidden = true; try { v.pause(); } catch (_) {}
  if (img.url) { im.src = img.url; im.hidden = false; layer.dataset.mode = 'image'; }
}
function releaseLayer(layer) {
  if (layer.classList.contains('on')) return;
  const v = layer.querySelector('video');
  try { v.pause(); v.onerror = null; v.removeAttribute('src'); v.load(); } catch (_) {}
}
// resume after the window was hidden/minimised (Chrome may pause muted video)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const v = $(activeLayer).querySelector('video');
  if (v && !v.hidden && v.paused) v.play().catch(() => {});
});

let currentLayout = null;
const placeUi = guard('placeUi', layout => {
  currentLayout = layout;
  const b = layout.booth, booth = $('booth');
  const bh = b.h / 100 * H;
  Object.assign(booth.style, { left: b.x + '%', top: b.y + '%', width: b.w + '%', height: b.h + '%' });
  booth.style.setProperty('--bh', bh + 'px');
  drawSeats();
});

/* ---------- Song info ---------- */
let dj = { ...TKTT.DEFAULT_DJ };
const SAMPLE = { title: 'ตัวอย่างเพลง (ไม่ใช่ข้อมูลจริง)', artist: 'TKTT SadLab • โหมดทดลอง', duration: 214 };
const drawSong = guard('drawSong', () => {
  const now = Date.now();
  const fresh = dj.connected && now - (dj.lastYtUpdate || 0) < 12000 && dj.title;
  const st = $('songStatus');
  let title, artist, cover = 'assets/default_cover.jpg', cur = 0, dur = 0;
  const ms = settings.manualSong || {};
  if (ms.enabled && ms.title) {
    title = String(ms.title).slice(0, 120); artist = String(ms.artist || '').slice(0, 120) || 'TKTT SadLab';
    st.hidden = true;
  } else if (fresh) {
    title = dj.title; artist = [dj.artist, dj.album].filter(Boolean).join(' • ') || '—';
    cover = dj.cover || cover;
    dur = dj.duration || 0;
    cur = dj.current + (dj.playing ? (now - dj.lastYtUpdate) / 1000 : 0);
    if (dur) cur = Math.min(cur, dur);
    st.hidden = true; // real data: no status line on the LIVE screen
  } else if (settings.musicDemo) {
    title = SAMPLE.title; artist = SAMPLE.artist; dur = SAMPLE.duration; cur = (now / 1000) % dur;
    st.hidden = false; st.textContent = '◉ โหมดตัวอย่าง (DEMO)'; st.classList.add('demo');
  } else {
    title = settings.boothTitle || 'TKTT SadLab DJ LIVE'; artist = settings.boothSubtitle || '';
    st.hidden = true;
  }
  if ($('songTitle').textContent !== title) $('songTitle').textContent = title;
  if ($('songArtist').textContent !== artist) $('songArtist').textContent = artist;
  $('songTime').textContent = TKTT.fmtTime(cur) + ' / ' + TKTT.fmtTime(dur);
  document.querySelector('#booth .progress-row').style.visibility = dur ? 'visible' : 'hidden'; // notification gives no timing
  $('progressFill').style.width = (dur ? Math.max(0, Math.min(100, cur / dur * 100)) : 0) + '%';
  const c = $('cover');
  c.parentElement.style.display = settings.showCover === false ? 'none' : '';
  if (c.dataset.src !== cover) { c.dataset.src = cover; c.src = cover; }
});
$('cover').addEventListener('error', () => { const c = $('cover'); if (!c.src.endsWith('default_cover.jpg')) c.src = 'assets/default_cover.jpg'; });

/* ---------- EQ ---------- */
const N = TKTT.EQ_BANDS, bars = [], level = new Float32Array(N), target = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const el = document.createElement('div');
  el.className = 'bar ' + (i < 10 ? 'bass' : i < 24 ? 'mid' : 'high');
  $('bars').append(el); bars.push(el);
}
let lastPacket = null;
const eqCh = TKTT.channel(TKTT.CH_EQ);
if (eqCh) eqCh.onmessage = e => { if (e.data && e.data.type === 'eq' && Array.isArray(e.data.bands)) lastPacket = e.data; };

let lastT = performance.now(), demoT = 0;
function eqFrame(now) {
  try {
    const dt = Math.min(120, Math.max(1, now - lastT)); lastT = now;
    const mode = (settings.eqMode === 'audio' && typeof micFailed !== 'undefined' && micFailed) ? 'demo' : settings.eqMode;
    const sens = Math.max(.3, Math.min(3, Number(settings.eqSensitivity) || 1.3));
    const badge = $('eqBadge');
    let label = 'EQ ปิด', cls = 'idle';
    if (mode === 'audio') {
      const fresh = lastPacket && Date.now() - lastPacket.at < 700;
      const silent = fresh && lastPacket.silentMs > 1500;
      for (let i = 0; i < N; i++) target[i] = fresh ? Math.min(1, Math.pow(lastPacket.bands[i] || 0, .8) * sens) : 0;
      if (!fresh) { label = 'EQ • รอเสียง'; cls = 'idle'; }
      else if (silent) { label = 'EQ • ไม่มีเสียง'; cls = 'idle'; }
      else { label = 'EQ AUDIO'; cls = ''; }
    } else if (mode === 'demo') {
      demoT += dt / 1000;
      for (let i = 0; i < N; i++) {
        const beat = .45 + .55 * Math.pow(Math.abs(Math.sin(demoT * 3.1)), 3) * (i < 10 ? 1 : .6);
        target[i] = Math.min(1, (.18 + .55 * Math.abs(Math.sin(demoT * 1.3 + i * .37)) * (1 - i / N * .45)) * beat);
      }
      label = 'EQ DEMO'; cls = 'demo';
    } else {
      target.fill(0);
    }
    const atk = 1 - Math.exp(-dt / Math.max(10, Number(settings.eqAttackMs) || 45));
    const rel = 1 - Math.exp(-dt / Math.max(40, Number(settings.eqReleaseMs) || 260));
    for (let i = 0; i < N; i++) {
      const t = target[i];
      level[i] += (t - level[i]) * (t > level[i] ? atk : rel);
      bars[i].style.transform = `scaleY(${Math.max(.03, level[i]).toFixed(3)})`;
    }
    if (mode === 'audio' && label === 'EQ AUDIO') label = 'EQ';
    if (badge.textContent !== label) badge.textContent = label;
    badge.className = 'eq-badge ' + cls;
    badge.hidden = !settings.showEqBadge;
  } catch (e) { /* keep animating */ }
  requestAnimationFrame(eqFrame);
}
requestAnimationFrame(eqFrame);

/* Mobile V2: no seat names / TOP 10 — background + music only */
const drawSeats = () => {};

/* ---------- Heartbeat to Control Center ---------- */
const statusCh = TKTT.channel(TKTT.CH_STATUS);
const instance = Math.random().toString(36).slice(2, 8);
if (IS_MAIN && statusCh) {
  const beat = () => { try { statusCh.postMessage({ type: 'live-alive', id: instance, at: Date.now(), room: settings.roomId, visible: !document.hidden, w: innerWidth, h: innerHeight }); } catch (_) {} };
  setInterval(beat, 2000); beat();
  document.addEventListener('visibilitychange', () => { beat(); if (document.hidden) TKTT.log('warn', 'live', 'หน้าต่าง LIVE ถูกย่อ/ซ่อน — ภาพ EQ อาจหยุดใน TikTok LIVE Studio'); });
}

/* ---------- Data wiring ---------- */
TKTT.subscribe(guard('subscribe', ch => {
  if (ch.dj) { dj = { ...TKTT.DEFAULT_DJ, ...ch.dj }; drawSong(); }
  if (ch.settings) {
    const prev = settings; settings = { ...TKTT.DEFAULT_SETTINGS, ...ch.settings };
    if (prev.roomId !== settings.roomId) applyRoom();
    else if (prev.useVideo !== settings.useVideo) applyRoom(true);
    if (prev.eqMode !== settings.eqMode) syncMic();
    if (prev.fitMode !== settings.fitMode) fit();
    drawSong(); drawSeats();
  }
  if (ch.roomFiles) { ROOMS.clearCache(); applyRoom(true); }
  if (ch.roomVideoFiles || ch.roomVideoMeta) { ROOMS.clearVideoCache(); applyRoom(true); }
  if (ch.roomLayouts) { layouts = ch.roomLayouts || {}; applyRoom(); }
  if (ch.roomAdjust) { adjusts = ch.roomAdjust || {}; applyRoom(); }
  for (const k of Object.keys(ch)) if (k.startsWith('roomImage:')) { ROOMS.clearCache(k.slice(10)); if (k.slice(10) === roomToShow()) applyRoom(true); }
}));

(async () => {
  try {
    const st = await TKTT.get(['dj', 'settings', 'roomLayouts', 'roomAdjust']);
    settings = { ...TKTT.DEFAULT_SETTINGS, ...(st.settings || {}) };
    dj = { ...TKTT.DEFAULT_DJ, ...(st.dj || {}) };
    layouts = st.roomLayouts || {}; adjusts = st.roomAdjust || {};
  } catch (e) { TKTT.log('error', 'live', 'อ่านการตั้งค่าไม่สำเร็จ: ' + e.message); }
  await applyRoom(true);
  fit();
  drawSong();
  setInterval(drawSong, 500);
  if (IS_MAIN) { TKTT.log('info', 'live', 'เปิดหน้าจอ LIVE แล้ว'); startAutoRotate(); }
  syncMic();
})();

/* ---------- Mobile: microphone EQ, full screen, keep screen on ---------- */
const micOut = TKTT.channel(TKTT.CH_EQ);
let mic = null, unlocked = false, wakeLock = null;
var micFailed = false;
async function syncMic() {
  if (!IS_MAIN) return;
  const want = settings.eqMode === 'audio';
  if (want && !mic && unlocked) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      mic = new TKTTAudioEngine({
        playThrough: false, // never play the microphone back (no echo / feedback)
        onFrame: f => { try { micOut && micOut.postMessage({ ...f, source: 'mic' }); } catch (_) {} },
        onState: st => { if (st.status !== 'capturing') mic = null; }
      });
      await mic.start(stream); micFailed = false;
      TKTT.log('info', 'audio', 'เริ่ม EQ จากไมโครโฟนแล้ว');
    } catch (e) {
      mic = null; micFailed = true;
      TKTT.log('error', 'audio', 'เปิดไมโครโฟนไม่ได้: ' + (e.message || e) + ' — ใช้ EQ แบบจำลองแทน');
    }
  } else if (!want) { micFailed = false; if (!mic) return;
    const m = mic; mic = null; await m.stop(true);
    TKTT.log('info', 'audio', 'หยุด EQ ไมโครโฟน');
  }
}
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (_) {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { keepAwake(); if (mic && mic.ctx && mic.ctx.state !== 'running') mic.ctx.resume().catch(() => {}); } });
if (IS_MAIN) {
  const tap = $('tapStart');
  tap.hidden = false;
  tap.addEventListener('click', async () => {
    unlocked = true; tap.hidden = true;
    try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (_) {}
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('portrait'); } catch (_) {}
    keepAwake();
    const v = $(activeLayer).querySelector('video'); if (v && !v.hidden) v.play().catch(() => {});
    syncMic();
  });
}

/* ---------- Web: automatic room rotation (runs in this page) ---------- */
function startAutoRotate() {
  let last = Date.now();
  setInterval(() => {
    const ar = settings.autoRotate || {};
    if (!ar.enabled) { last = Date.now(); return; }
    if (Date.now() - last < Math.max(1, Number(ar.minutes) || 10) * 60000) return;
    last = Date.now();
    const avail = Object.keys({ ...TKTT.FIXED.roomFiles, ...TKTT.FIXED.roomVideoFiles });
    const pool = ROOMS.LIST.map(r => r.id).filter(id => avail.includes(id) && (!(ar.rooms || []).length || ar.rooms.includes(id)));
    if (pool.length < 2) return;
    const i = pool.indexOf(settings.roomId);
    TKTT.patchSettings({ roomId: pool[(i + 1) % pool.length] });
  }, 5000);
}
