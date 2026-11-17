'use strict';
/* Room catalogue. Each room needs its OWN artwork. A room without artwork is shown as
   "รอภาพฉาก" and cannot be selected until an image is added (folder file or upload).
   Layout values are percentages of the 1080x1920 stage. Seats are ordered by rank 1..10. */
const ROOMS = (() => {
  const LAYOUT_NEON = {
    booth: { x: 19.9, y: 36.75, w: 60.35, h: 6.7 },
    seats: [[34, 47.2], [66, 47.2], [13, 41.6], [87, 41.6], [10, 36.6], [90.5, 37.2], [8, 33.1], [92, 33.1], [14, 29.0], [88, 29.0]]
  };
  const LAYOUT_CAFE = {
    booth: { x: 19.6, y: 40.8, w: 60.6, h: 8.3 },
    seats: [[33, 52.2], [66, 52.2], [12, 48.6], [88, 48.6], [9, 41.0], [90.5, 41.2], [7, 36.6], [93, 36.4], [13, 31.0], [86, 31.0]]
  };
  const LAYOUT_BEACH = {
    booth: { x: 18.4, y: 40.2, w: 60.5, h: 7.7 },
    seats: [[32, 48.4], [65, 47.8], [12, 47.0], [86, 46.5], [8.5, 39.6], [89, 40.6], [6.5, 35.7], [93, 35.8], [11, 30.2], [84, 30.4]]
  };

  const LAYOUT_CAFE_NEON = {
    booth: { x: 19.9, y: 36.7, w: 61.2, h: 6.8 },
    seats: [[34, 48.3], [66, 47.0], [12, 43.0], [89, 43.3], [8.5, 37.3], [93, 37.0], [6, 33.5], [94, 32.8], [12.5, 28.3], [88, 28.6]]
  };

  const LIST = [
    { id: 'neon', name: 'ห้อง DJ นีออน', short: 'DJ นีออน', cat: 'night', bundled: true, layout: LAYOUT_NEON,
      note: 'ภาพต้นฉบับที่อนุมัติ (ลบข้อความเพลงเดิมที่ฝังในภาพแล้ว)' },
    { id: 'cafe-neon', name: 'คาเฟ่นีออน', short: 'คาเฟ่นีออน', cat: 'night', bundled: true, layout: LAYOUT_CAFE_NEON,
      note: 'ภาพจากผู้ใช้ + คลิปตัวอย่าง (ตัดตัวละครจากภาพเดิมแล้วโยกตามจังหวะ 120 BPM วนทุก 8 วินาที)' },
    { id: 'cafe', name: 'ร้านกาแฟสว่าง', short: 'ร้านกาแฟสว่าง', cat: 'day', bundled: true, layout: LAYOUT_CAFE,
      note: 'ภาพฉากคาเฟ่กลางวัน' },
    { id: 'beach-day', name: 'ร้านริมทะเลกลางวัน', short: 'ริมทะเลกลางวัน', cat: 'day', bundled: false, layout: LAYOUT_CAFE },
    { id: 'beach-sunset', name: 'ร้านริมทะเลยามเย็น', short: 'ริมทะเลยามเย็น', cat: 'night', bundled: true, layout: LAYOUT_BEACH,
      note: 'ภาพจาก v3.9 (ลบข้อความเพลงเดิมแล้ว) — แถบบนสุดของภาพเป็นส่วนเบลอที่ขยายมาจากต้นฉบับ' },
    { id: 'office', name: 'ออฟฟิศทำงาน', short: 'ออฟฟิศ', cat: 'day', bundled: false, layout: LAYOUT_CAFE },
    { id: 'studio', name: 'สตูดิโอเพลง', short: 'สตูดิโอเพลง', cat: 'night', bundled: false, layout: LAYOUT_CAFE },
    { id: 'living', name: 'ห้องนั่งเล่นสบาย ๆ', short: 'ห้องนั่งเล่น', cat: 'day', bundled: false, layout: LAYOUT_CAFE },
    { id: 'garden', name: 'สวนธรรมชาติ', short: 'สวนธรรมชาติ', cat: 'day', bundled: false, layout: LAYOUT_CAFE },
    { id: 'river', name: 'คาเฟ่ริมแม่น้ำ', short: 'คาเฟ่ริมแม่น้ำ', cat: 'day', bundled: false, layout: LAYOUT_CAFE },
    { id: 'rgb', name: 'ห้องเกม RGB', short: 'ห้องเกม RGB', cat: 'night', bundled: false, layout: LAYOUT_NEON },
    { id: 'custom', name: 'ห้องของฉัน (อัปโหลด)', short: 'ห้องของฉัน', cat: 'other', bundled: false, layout: LAYOUT_CAFE }
  ];

  const DEFAULT_ADJUST = { brightness: 100, saturation: 100, warmth: 0, blur: 0 };
  const EXT = ['jpg', 'png', 'webp'];

  function byId(id) { return LIST.find(r => r.id === id) || null; }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /** Layout = saved override (from layout editor) or built-in default. */
  function layoutFor(id, overrides) {
    const r = byId(id) || LIST[0];
    const o = overrides && overrides[id];
    const base = clone(r.layout);
    if (o && o.booth && Array.isArray(o.seats) && o.seats.length === 10) return clone(o);
    return base;
  }

  function adjustFor(id, all) {
    return { ...DEFAULT_ADJUST, ...((all && all[id]) || {}) };
  }

  function filterCss(a) {
    const w = Number(a.warmth) || 0; // -50..50
    const parts = [`brightness(${(Number(a.brightness) || 100) / 100})`, `saturate(${(Number(a.saturation) || 100) / 100})`];
    if (w > 0) parts.push(`sepia(${w / 160})`, `hue-rotate(${-w / 6}deg)`);
    if (w < 0) parts.push(`hue-rotate(${-w / 3}deg)`);
    if (Number(a.blur) > 0) parts.push(`blur(${Number(a.blur)}px)`);
    return parts.join(' ');
  }

  const imageCache = {};
  /** Resolve the artwork URL for a room: uploaded image > file in assets/rooms/ > none.
      Folder files are discovered by the service worker (see scanRoomFiles) so pages never
      probe missing files themselves (that would print network errors in the console). */
  async function resolveImage(id) {
    if (imageCache[id] !== undefined) return imageCache[id];
    try {
      const key = 'roomImage:' + id;
      const st = await TKTT.get([key, 'roomFiles']);
      if (TKTT.isValidImageData(st[key])) return (imageCache[id] = { url: st[key], source: 'upload' });
      const r = byId(id);
      const path = (st.roomFiles && st.roomFiles[id]) || (r && r.bundled ? `assets/rooms/${id}.jpg` : '');
      if (path) {
        const url = (typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? chrome.runtime.getURL(path) : path;
        return (imageCache[id] = { url, source: 'file' });
      }
    } catch (_) {}
    return (imageCache[id] = { url: '', source: 'none' });
  }
  /* ---------- Video backgrounds ---------- */
  const videoCache = {};
  /** Video for a room: uploaded (IndexedDB) > file in assets/rooms/<id>.mp4|webm > none. */
  async function resolveVideo(id) {
    if (videoCache[id] !== undefined) return videoCache[id];
    try {
      const st = await TKTT.get(['roomVideoMeta', 'roomVideoFiles']);
      if (st.roomVideoMeta && st.roomVideoMeta[id] && typeof TKTTMedia !== 'undefined') {
        const v = await TKTTMedia.getVideo(id);
        if (v) return (videoCache[id] = { url: URL.createObjectURL(v.blob), source: 'upload', size: v.size });
      }
      const path = st.roomVideoFiles && st.roomVideoFiles[id];
      if (path) {
        const url = (typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? chrome.runtime.getURL(path) : path;
        return (videoCache[id] = { url, source: 'file' });
      }
    } catch (_) {}
    return (videoCache[id] = { url: '', source: 'none' });
  }
  function clearVideoCache(id) {
    const ids = id ? [id] : Object.keys(videoCache);
    for (const k of ids) { const v = videoCache[k]; if (v && v.source === 'upload') { try { URL.revokeObjectURL(v.url); } catch (_) {} } delete videoCache[k]; }
  }

  function clearCache(id) { if (id) delete imageCache[id]; else for (const k in imageCache) delete imageCache[k]; }

  return { LIST, DEFAULT_ADJUST, byId, layoutFor, adjustFor, filterCss, resolveImage, clearCache, resolveVideo, clearVideoCache };
})();
if (typeof self !== 'undefined') self.ROOMS = ROOMS;
