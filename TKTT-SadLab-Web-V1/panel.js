'use strict';
/* Settings panel for the web version. Open: "⚙ ตั้งค่า" on the start screen, or press and
   hold the screen for 1.5 seconds (viewers will see the panel if you are already live). */
(() => {
  const P = $('panel'), gear = $('gearBtn');
  let S = null;
  const avail = () => ({ ...TKTT.FIXED.roomFiles, ...TKTT.FIXED.roomVideoFiles });

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else if (k in e) e[k] = v; else e.setAttribute(k, v); }
    for (const k of kids) e.append(k);
    return e;
  }
  const save = p => TKTT.patchSettings(p).then(s => { S = s; render(); });

  function render() {
    if (P.hidden || !S) return;
    P.replaceChildren();
    const card = el('div', { className: 'pn-card' });
    card.append(el('div', { className: 'pn-head' }, el('b', { textContent: 'ตั้งค่า TKTT SadLab' }), el('button', { className: 'pn-x', textContent: '✕', on: { click: close } })));

    // rooms
    const grid = el('div', { className: 'pn-rooms' });
    for (const r of ROOMS.LIST) {
      const has = avail()[r.id];
      if (!has) continue;
      const img = TKTT.FIXED.roomFiles[r.id];
      const b = el('button', { className: 'pn-room' + (S.roomId === r.id ? ' on' : ''), on: { click: () => save({ roomId: r.id }) } },
        img ? el('img', { src: img, alt: '' }) : el('span', { textContent: '▶' }), el('span', { className: 'pn-lbl', textContent: r.short + (TKTT.FIXED.roomVideoFiles[r.id] ? ' ▶' : '') }));
      grid.append(b);
    }
    card.append(el('h4', { textContent: 'ห้อง' }), grid);

    const ar = { enabled: false, minutes: 10, rooms: [], ...(S.autoRotate || {}) };
    card.append(el('label', { className: 'pn-row' },
      el('input', { type: 'checkbox', checked: !!ar.enabled, on: { change: e => save({ autoRotate: { ...ar, enabled: e.target.checked } }) } }),
      'เปลี่ยนห้องอัตโนมัติทุก',
      el('input', { type: 'number', min: 1, max: 240, value: ar.minutes, className: 'pn-num', on: { change: e => save({ autoRotate: { ...ar, minutes: Math.max(1, Math.min(240, Number(e.target.value) || 10)) } }) } }),
      'นาที'));

    // EQ
    const seg = el('div', { className: 'pn-seg' });
    for (const [m, t] of [['demo', 'จำลองจังหวะ'], ['audio', 'ไมโครโฟน'], ['off', 'ปิด']]) seg.append(el('button', { className: S.eqMode === m ? 'on' : '', textContent: t, on: { click: () => save({ eqMode: m }) } }));
    card.append(el('h4', { textContent: 'EQ' }), seg,
      el('p', { className: 'pn-hint', textContent: '"จำลองจังหวะ" ไม่ได้ขยับตามเพลงจริง • "ไมโครโฟน" ฟังเพลงจากลำโพงมือถือ (ต้องกดอนุญาตไมค์ และอาจแย่งไมค์กับ TikTok — ทดสอบก่อน)' }),
      el('label', { className: 'pn-row' }, 'ความไว', el('input', { type: 'range', min: .5, max: 3, step: .1, value: S.eqSensitivity, on: { change: e => save({ eqSensitivity: Number(e.target.value) }) } })));

    // booth text
    card.append(el('h4', { textContent: 'ข้อความบนแท่น DJ' }),
      el('input', { className: 'pn-text', value: S.boothTitle || '', maxLength: 60, placeholder: 'บรรทัดใหญ่', on: { change: e => save({ boothTitle: e.target.value.trim() }) } }),
      el('input', { className: 'pn-text', value: S.boothSubtitle || '', maxLength: 60, placeholder: 'บรรทัดเล็ก (เว้นว่างได้)', on: { change: e => save({ boothSubtitle: e.target.value.trim() }) } }),
      el('label', { className: 'pn-row' }, el('input', { type: 'checkbox', checked: S.showCover !== false, on: { change: e => save({ showCover: e.target.checked }) } }), 'แสดงรูปปกบนแท่น'));

    // display
    const fit = el('select', { on: { change: e => save({ fitMode: e.target.value }) } },
      el('option', { value: 'contain', textContent: 'เห็นฉากครบ + ขอบเบลอ' }), el('option', { value: 'cover', textContent: 'ขยายเต็มจอ (ตัดขอบซ้าย-ขวา)' }));
    fit.value = S.fitMode || 'contain';
    card.append(el('h4', { textContent: 'การแสดงผล' }), el('label', { className: 'pn-row' }, fit),
      el('label', { className: 'pn-row' }, el('input', { type: 'checkbox', checked: S.useVideo !== false, on: { change: e => save({ useVideo: e.target.checked }) } }), 'เล่นวิดีโอพื้นหลัง (ปิดถ้าเครื่องร้อน/กระตุก)'));

    card.append(el('button', { className: 'pn-go', textContent: 'ปิดตั้งค่า', on: { click: close } }),
      el('p', { className: 'pn-hint', textContent: 'ระหว่างไลฟ์ เปิดหน้านี้ได้โดยกดค้างที่หน้าจอ 1.5 วินาที (ผู้ชมจะเห็นหน้าตั้งค่า) • ค่าทั้งหมดเก็บในเครื่องนี้' }));
    P.append(card);
  }
  async function open() { S = await TKTT.getSettings(); P.hidden = false; render(); }
  function close() { P.hidden = true; }
  TKTT.subscribe(d => { if (d.settings) { S = { ...TKTT.DEFAULT_SETTINGS, ...d.settings }; render(); } });

  gear.hidden = false;
  gear.addEventListener('click', e => { e.stopPropagation(); open(); });
  $('tapStart').addEventListener('click', () => { gear.hidden = true; });

  let holdT = null;
  const stage = $('viewport');
  stage.addEventListener('pointerdown', () => { clearTimeout(holdT); holdT = setTimeout(open, 1500); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) stage.addEventListener(ev, () => clearTimeout(holdT));
  stage.addEventListener('contextmenu', e => e.preventDefault());
})();
