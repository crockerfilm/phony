import { domToCanvas } from 'https://cdn.jsdelivr.net/npm/modern-screenshot@4.7.0/dist/index.mjs';
import { buildChatAnim, buildNotifAnim, buildSceneAnim, renderFrames, noDecode, encodePNG } from './anim.js';
import { createExtras, EXTRA_DEFAULTS } from './extras.js';
import { pngMov } from './mov.js';

/* ───────────── state ───────────── */

const STORE_KEY = 'phony.v1';
const uid = () => Math.random().toString(36).slice(2, 9);

const msg = (from, text, extra = {}) => ({ id: uid(), type: 'msg', from, text, tapback: '', image: null, ...extra });
const stamp = (text) => ({ id: uid(), type: 'time', text });
const notifItem = (extra = {}) => ({
  id: uid(), app: 'messages', appName: '', icon: null, person: true, avatar: null,
  title: 'Mom', subtitle: '', body: 'are you coming to dinner tonight?', time: 'now', thumb: null, ...extra,
});

const defaults = () => ({
  mode: 'chat',
  theme: 'light',
  scale: 3,
  bg: 'transparent',
  anim: { on: false, fps: 30, speed: 1, endHold: 1.5, slideOut: false },
  ...EXTRA_DEFAULTS(),
  chat: {
    layout: 'phone',
    service: 'imessage',
    name: 'Mom',
    avatar: null,
    clock: '9:41',
    unread: '',
    showStatus: true,
    showHeader: true,
    showInput: true,
    width: 393,
    typing: false,
    receipt: 'read',
    receiptTime: '9:41 AM',
    anchor: 'bottom',
    seqTyping: true,
    items: [
      stamp('Today 9:41 AM'),
      msg('them', 'are you coming to dinner tonight?'),
      msg('them', 'dad is making his famous lasagna'),
      msg('me', 'omw!! 🍝', { tapback: '❤️' }),
    ],
  },
  notif: {
    layout: 'stack',
    width: 361,
    opacity: 0.9,
    items: [
      notifItem({ time: 'now' }),
      notifItem({ body: 'dad is making his famous lasagna', time: '1m ago' }),
    ],
  },
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = defaults();
      const s = JSON.parse(raw);
      const merged = { ...d, ...s };
      for (const k of ['anim', 'chat', 'notif', ...Object.keys(EXTRA_DEFAULTS())]) merged[k] = { ...d[k], ...s[k] };
      return merged;
    }
  } catch {}
  return defaults();
}

let saveTimer = 0;
let imagesUnsaved = false; // this tab holds photos its last save had to drop
let adoptPending = false; // another tab saved while this one was exporting
// photos/avatars/icons are dropped from the save when everything won't fit the ~5 MB quota
const IMG_KEYS = new Set(['image', 'avatar', 'icon', 'thumb', 'bgImage']);
const noImages = (k, v) => (IMG_KEYS.has(k) ? null : v);
function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    imagesUnsaved = false;
  } catch (err) {
    if (err?.name === 'SecurityError') return toast('Browser storage is blocked — work won’t be kept after reload');
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state, noImages)); } catch {}
    imagesUnsaved = true;
    toast('Images too large to keep after reload — text is saved');
  }
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 250);
}
// don't drop the last keystrokes on reload or close
addEventListener('pagehide', () => { if (saveTimer) flushSave(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) flushSave(); });

// Another Phony tab saved: adopt its work (not its view settings) rather than overwrite it later.
function adoptSaved() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  const next = load();
  const { mode, theme, scale, bg } = state, { on, fps } = state.anim;
  Object.assign(next, { mode, theme, scale, bg });
  Object.assign(next.anim, { on, fps });
  if (imagesUnsaved) { // the other tab never saw photos this one couldn't save — keep them
    const itemsOf = (st) => ['chat', 'notif', 'gpt', 'comment', 'mail'].flatMap((k) => st[k]?.items || []);
    const old = new Map(itemsOf(state).map((x) => [x.id, x]));
    for (const x of itemsOf(next)) {
      const o = old.get(x.id);
      if (o) for (const f of IMG_KEYS) if (x[f] == null && o[f]) x[f] = o[f];
    }
    next.chat.avatar ??= state.chat.avatar;
    next.call.avatar ??= state.call.avatar;
    next.call.bgImage ??= state.call.bgImage;
  }
  state = next;
  renderAll();
}
addEventListener('storage', (e) => {
  if (e.key !== STORE_KEY || e.newValue == null) return;
  if (exporting) { adoptPending = true; return; } // exports read state across awaits — adopt afterwards
  adoptSaved();
});

function getPath(path) { return path.split('.').reduce((o, k) => o?.[k], state); }
function setPath(path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], state)[last] = v;
}

/* ───────────── helpers ───────────── */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function initials(name = '') {
  const words = name.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w[0] || ''));
  if (!words.length) return '';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

// Graphemes shown as emoji: default-emoji characters, or ones forced via VS16 / keycap / flag / skin tone.
// Text-default symbols like ™ © ® ↔ ✔ stay as text, as on iOS.
// Pictographs above U+1F000 and a few hand gestures have no text glyph in SF, so they're emoji too.
const EMOJI_TEST = /\p{Emoji_Presentation}|\uFE0F|\u20E3|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\u261D\u26F9\u270C\u270D]|(?=\p{Emoji}|\p{Cn})(?=\p{Extended_Pictographic})[\u{1F000}-\u{1FAFF}]/u;
const isEmoji = (s) => !s.includes('\uFE0E') && EMOJI_TEST.test(s); // FE0E asks for text style
const segmenter = new Intl.Segmenter();
function isJumbo(text = '') {
  const segs = [...segmenter.segment(text.replace(/\s/g, ''))].map((s) => s.segment);
  return segs.length > 0 && segs.length <= 3 && segs.every(isEmoji);
}

// Chrome mis-measures color emoji when rasterising DOM through SVG, so emoji are
// drawn once to a canvas and inlined as images (preview and export match).
const emojiCache = new Map();
// 128px covers inline/tapback/notification emoji at 4x; jumbo passes 256 (48px × 1.12em × 4x ≈ 215px)
function emojiURL(ch, F = 128) {
  const key = `${F}:${ch}`;
  if (!emojiCache.has(key)) {
    const font = `${F}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    const m = probe.measureText(ch);
    const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || F;
    const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || F;
    const side = Math.max(w, h) + 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = side;
    const ctx = cv.getContext('2d');
    ctx.font = font;
    ctx.fillText(ch, (side - w) / 2 + m.actualBoundingBoxLeft, (side - h) / 2 + m.actualBoundingBoxAscent);
    emojiCache.set(key, cv.toDataURL('image/png'));
  }
  return emojiCache.get(key);
}
function rich(text = '', F = 128) {
  let out = '';
  for (const { segment } of segmenter.segment(String(text ?? ''))) {
    out += isEmoji(segment) ? `<img class="emo" src="${emojiURL(segment, F)}" alt="${esc(segment)}">` : esc(segment);
  }
  return out;
}

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

const filePicker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
function pickImage(maxDim, cb) {
  filePicker.value = '';
  filePicker.onchange = () => {
    const file = filePicker.files[0];
    if (!file) return;
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      toast(/hei[cf]/i.test(`${file.type} ${file.name}`)
        ? 'HEIC photos don’t open in this browser — export as JPG/PNG or use Safari'
        : 'Couldn’t read that image');
    };
    img.onload = () => {
      const svg = file.type === 'image/svg+xml';
      const w = img.width || maxDim, h = img.height || maxDim;
      // SVGs rasterise at the target size; bitmaps only ever shrink
      const s = svg ? maxDim / Math.max(w, h) : Math.min(1, maxDim / Math.max(w, h));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * s));
      cv.height = Math.max(1, Math.round(h * s));
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      // PNG only when there's real transparency — JPEG is far smaller in localStorage
      let png = svg;
      if (!svg && file.type !== 'image/jpeg') {
        try {
          const a = ctx.getImageData(0, 0, cv.width, cv.height).data;
          for (let i = 3; i < a.length; i += 4) if (a[i] < 255) { png = true; break; }
        } catch { png = true; }
      }
      if (exporting) return toast('Finish the export first, then add the image');
      cb(cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9));
    };
    img.src = URL.createObjectURL(file);
  };
  filePicker.click();
}

/* ───────────── icons ───────────── */

let gid = 0;
const grad = (a, b) => {
  const id = `g${++gid}`;
  return [`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`, `url(#${id})`];
};
const PHONE_PATH = 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z';
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const APPS = {
  messages: {
    name: 'Messages',
    svg() {
      const [d, f] = grad('#5df779', '#0bbd29');
      return `<svg viewBox="0 0 60 60">${d}<rect width="60" height="60" fill="${f}"/><path fill="#fff" d="M30 13.5c-11.3 0-20.5 7.4-20.5 16.5 0 5.3 3.1 10 7.9 13-.4 2.5-1.7 4.8-3.9 6.5 3.5.2 7-1 9.6-3.3 2.2.6 4.5.9 6.9.9 11.3 0 20.5-7.4 20.5-16.6S41.3 13.5 30 13.5z"/></svg>`;
    },
  },
  mail: {
    name: 'Mail',
    svg() {
      const [d, f] = grad('#21c2ff', '#1a5ff2');
      return `<svg viewBox="0 0 60 60">${d}<rect width="60" height="60" fill="${f}"/><rect x="11" y="18" width="38" height="25" rx="3" fill="#fff"/><path d="M12 19.5 30 33.5 48 19.5" fill="none" stroke="#2a86f4" stroke-width="2" stroke-linejoin="round"/></svg>`;
    },
  },
  phone: {
    name: 'Phone',
    svg() {
      const [d, f] = grad('#5df779', '#0bbd29');
      return `<svg viewBox="0 0 60 60">${d}<rect width="60" height="60" fill="${f}"/><path fill="#fff" transform="translate(14 14) scale(1.35)" d="${PHONE_PATH}"/></svg>`;
    },
  },
  facetime: {
    name: 'FaceTime',
    svg() {
      const [d, f] = grad('#5df779', '#0bbd29');
      return `<svg viewBox="0 0 60 60">${d}<rect width="60" height="60" fill="${f}"/><rect x="10" y="20" width="27" height="20" rx="5" fill="#fff"/><path fill="#fff" d="M39 27.5 48.5 21.5c.7-.4 1.5.1 1.5.9v15.2c0 .8-.8 1.3-1.5.9L39 32.5z"/></svg>`;
    },
  },
  calendar: {
    name: 'Calendar',
    svg() {
      const now = new Date();
      return `<svg viewBox="0 0 60 60"><rect width="60" height="60" fill="#fff"/><text x="30" y="18" text-anchor="middle" font-size="9.5" font-weight="600" fill="#f2382c" font-family="-apple-system, Helvetica, sans-serif">${WEEKDAYS[now.getDay()]}</text><text x="30" y="47" text-anchor="middle" font-size="30" font-weight="300" fill="#111" font-family="-apple-system, Helvetica, sans-serif">${now.getDate()}</text></svg>`;
    },
  },
  reminders: {
    name: 'Reminders',
    svg() {
      const row = (y, c) => `<circle cx="17" cy="${y}" r="4.2" fill="${c}"/><rect x="24" y="${y - 1}" width="22" height="2" rx="1" fill="#d6d6db"/>`;
      return `<svg viewBox="0 0 60 60"><rect width="60" height="60" fill="#fff"/>${row(18, '#0a84ff')}${row(30, '#ff3b30')}${row(42, '#ff9500')}</svg>`;
    },
  },
  custom: { name: 'Custom app', svg: null },
};

function appName(it) {
  return it.app === 'custom' ? (it.appName || 'App') : APPS[it.app].name;
}

function appIcon(it, size) {
  const style = `width:${size}px;height:${size}px`;
  if (it.app === 'custom') {
    if (it.icon) return `<span class="appicon" style="${style};background-image:url(${it.icon})"></span>`;
    const letter = esc((it.appName || '').match(/[\p{L}\p{N}]/u)?.[0].toUpperCase() || 'A');
    return `<span class="appicon" style="${style};background:linear-gradient(#7d8bff,#4b5bdc);display:grid;place-items:center;color:#fff;font-weight:600;font-size:${size * 0.5}px">${letter}</span>`;
  }
  return `<span class="appicon" style="${style}">${APPS[it.app].svg()}</span>`;
}

const PERSON_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="7.6" r="4.6"/><path d="M2.6 23c0-5.3 4.2-8.6 9.4-8.6s9.4 3.3 9.4 8.6z"/></svg>';
function avatar(img, name, size, cls = '') {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (img) return `<div class="avatar ${cls}" style="${style};background-image:url(${img})"></div>`;
  const ini = initials(name);
  return ini
    ? `<div class="avatar ${cls}" style="${style}">${esc(ini)}</div>`
    : `<div class="avatar person ${cls}" style="${style}">${PERSON_SVG}</div>`;
}

function wifiSVG() {
  const cx = 8.5, cy = 11.8;
  const a0 = (-135 * Math.PI) / 180, a1 = (-45 * Math.PI) / 180;
  const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const sector = (r) => `M${cx} ${cy}L${pt(r, a0)}A${r} ${r} 0 0 1 ${pt(r, a1)}Z`;
  const band = (r0, r1) => `M${pt(r1, a0)}A${r1} ${r1} 0 0 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z`;
  return `<svg width="17" height="12" viewBox="0 0 17 12"><path d="${sector(3.6)}${band(5.4, 7.7)}${band(9.5, 11.8)}"/></svg>`;
}
const SIGNAL_SVG = '<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="7.6" width="3.2" height="4.4" rx="1"/><rect x="4.9" y="5.2" width="3.2" height="6.8" rx="1"/><rect x="9.8" y="2.6" width="3.2" height="9.4" rx="1"/><rect x="14.7" y="0" width="3.2" height="12" rx="1"/></svg>';
const BATTERY_SVG = '<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" stroke-opacity=".35"/><rect x="2" y="2" width="20" height="9" rx="2.5"/><path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2z" fill-opacity=".4"/></svg>';
const TAIL_SVG = '<svg class="tail" viewBox="0 0 24 20"><path d="M0 0H18C18 9 19.5 15.5 24 20C19.5 20.6 15 19.6 12 17.3C9 19.3 5 20 0 20Z"/></svg>';
const CHEVRON_BACK = '<svg viewBox="0 0 13 22"><path d="M11 2 2 11l9 9"/></svg>';
const CHEVRON_SMALL = '<svg viewBox="0 0 5 9"><path d="M.8.8 4.2 4.5.8 8.2"/></svg>';
const VIDEO_SVG = '<svg class="fc" viewBox="0 0 30 20"><rect x="0" y="1.5" width="20" height="17" rx="4.5"/><path d="M22 7.2 28.4 3c.7-.4 1.6.1 1.6.9v12.2c0 .8-.9 1.3-1.6.9L22 12.8z"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 16 16"><path d="M8 1.5v13M1.5 8h13"/></svg>';
const MIC_SVG = '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>';

/* ───────────── mock rendering: Messages ───────────── */

// Visible slice of the conversation for build-sequence frames.
// count = number of message items shown; trailing timestamps only when a next message is about to appear.
function sliceItems(items, count, keepTrailingStamps) {
  if (count == null) return items;
  const out = [];
  let n = 0;
  for (const it of items) {
    if (it.type === 'msg') {
      if (n === count) break;
      n++;
    }
    out.push(it);
  }
  if (!keepTrailingStamps) while (out.length && out[out.length - 1].type === 'time') out.pop();
  return out;
}

function stampHTML(text, key = '') {
  const m = text.match(/^(.*?)(\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)$/i);
  const inner = m && m[1] ? `<b>${esc(m[1])}</b>${esc(m[2])}` : esc(text);
  return `<div class="stamp" data-k="${key}">${inner}</div>`;
}

// Expand items into render units (a photo with a caption becomes two bubbles) and work out grouping.
function units(items) {
  const out = [];
  for (const it of items) {
    if (it.type === 'time') { out.push({ kind: 'time', it }); continue; }
    if (it.image) {
      out.push({ kind: 'img', it, from: it.from, tapback: it.tapback });
      if (it.text.trim()) out.push({ kind: 'text', it, from: it.from, text: it.text, tapback: '' });
    } else {
      out.push({ kind: 'text', it, from: it.from, text: it.text, tapback: it.tapback });
    }
  }
  out.forEach((u, i) => {
    if (u.kind === 'time') return;
    const prev = out[i - 1], next = out[i + 1];
    u.first = !prev || prev.kind === 'time' || prev.from !== u.from;
    u.last = !next || next.kind === 'time' || next.from !== u.from;
  });
  return out;
}

function tapbackHTML(u) {
  if (!u.tapback) return '';
  const by = u.from === 'me' ? 'them' : 'me';
  const glyph = /^[!?‼⁉]+$/u.test(u.tapback) || /^ha/i.test(u.tapback) ? ' glyph' : '';
  return `<div class="tapback by-${by}${glyph}">${rich(u.tapback)}<i></i><i></i></div>`;
}

function unitHTML(u) {
  const key = `${u.kind}:${u.it.id}`;
  if (u.kind === 'time') return stampHTML(u.it.text, key);
  const cls = ['m', u.from, u.first ? 'first' : '', u.tapback ? 'tb' : ''].join(' ');
  if (u.kind === 'img') {
    return `<div class="${cls}" data-k="${key}"><div class="bub img"><img src="${u.it.image}" alt="">${tapbackHTML(u)}</div></div>`;
  }
  const jumbo = isJumbo(u.text);
  const tail = u.last && !jumbo ? TAIL_SVG : '';
  return `<div class="${cls}" data-k="${key}"><div class="bub${jumbo ? ' jumbo' : ''}" dir="auto">${rich(u.text, jumbo ? 256 : 128)}${tail}${tapbackHTML(u)}</div></div>`;
}

const TYPING_HTML = '<div class="m them first" data-k="typing"><div class="typing"><span></span><span></span><span></span><i></i><i></i></div></div>';

function threadHTML(items, typing) {
  const c = state.chat;
  const us = units(items);
  // the receipt sits right under the last bubble, even when a timestamp follows it
  const li = us.findLastIndex((u) => u.kind !== 'time');
  const receipt = c.receipt === 'none' || us[li]?.from !== 'me' ? ''
    : c.receipt === 'read'
      ? `<div class="receipt" data-k="receipt"><b>Read</b> ${esc(c.receiptTime)}</div>`
      : '<div class="receipt" data-k="receipt">Delivered</div>';
  let html = us.map((u, i) => unitHTML(u) + (i === li ? receipt : '')).join('');
  if (typing) html += TYPING_HTML;
  return html;
}

function rootClasses(kind) {
  const cls = ['mock', kind, state.theme === 'dark' ? 'dark' : ''];
  if (kind === 'phone') return cls;
  if (state.bg === 'theme') cls.push('solid');
  if (state.bg === 'green') cls.push('green');
  return cls;
}

function renderChat({ count, typing = state.chat.typing, keepStamps = false, height, inner } = {}) {
  const c = state.chat;
  const items = sliceItems(c.items, count, keepStamps);
  const body = inner ?? threadHTML(items, typing);
  const cls = rootClasses(c.layout === 'phone' ? 'phone' : 'bubbles');
  if (c.service === 'sms') cls.push('sms');
  const maxw = Math.round((c.layout === 'phone' ? 393 : c.width) * 0.68);

  if (c.layout === 'phone') {
    const status = c.showStatus
      ? `<div class="statusbar"><span class="clock">${esc(c.clock)}</span><span class="sys">${SIGNAL_SVG}${wifiSVG()}${BATTERY_SVG}</span></div>`
      : '';
    const head = c.showHeader
      ? `<div class="chat-head">
          <div class="back">${CHEVRON_BACK}${c.unread ? `<span class="count">${esc(c.unread)}</span>` : ''}</div>
          ${avatar(c.avatar, c.name, 54, 'av')}
          <div class="name">${rich(c.name)}${CHEVRON_SMALL}</div>
          ${VIDEO_SVG}
        </div>`
      : '';
    const top = c.showHeader ? `<div class="topchrome">${status}${head}</div>` : status;
    const input = c.showInput
      ? `<div class="inputbar"><div class="plus">${PLUS_SVG}</div><div class="field-ios"><span>${c.service === 'sms' ? 'Text Message' : 'iMessage'}</span>${MIC_SVG}</div></div>`
      : '';
    return `<div class="${cls.join(' ')}" style="--maxw:${maxw}px">${top}<div class="thread"><div class="thread-inner">${body}</div></div>${input}<div class="homebar"><span></span></div></div>`;
  }

  if (height) cls.push('fixed', `anchor-${c.anchor}`);
  const style = `width:${c.width}px;--maxw:${maxw}px${height ? `;height:${height}px` : ''}`;
  return `<div class="${cls.join(' ')}" style="${style}"><div class="thread-inner">${body}</div></div>`;
}

/* ───────────── mock rendering: Notifications ───────────── */

function notifCardHTML(it) {
  const lead = it.person
    ? `<div class="n-ic">${avatar(it.avatar, it.title, 38)}<span class="badge">${appIcon(it, 17)}</span></div>`
    : `<div class="n-ic">${appIcon(it, 38)}</div>`;
  const title = it.title || appName(it);
  return `<div class="notif">${lead}<div class="n-main">
    <div class="n-head"><span class="n-title" dir="auto">${rich(title)}</span><span class="n-time">${esc(it.time)}</span></div>
    ${it.subtitle ? `<div class="n-sub" dir="auto">${rich(it.subtitle)}</div>` : ''}
    <div class="n-row"><div class="n-text" dir="auto">${rich(it.body)}</div>${it.thumb ? `<img class="n-thumb" src="${it.thumb}" alt="">` : ''}</div>
  </div></div>`;
}

function renderNotifs({ only } = {}) {
  const n = state.notif;
  const cls = rootClasses('notif-wrap');
  const style = `width:${n.width}px;--n-op:${n.opacity}`;
  let body;
  if (only) {
    body = notifCardHTML(only);
  } else if (n.layout === 'stack' && n.items.length) {
    const ghosts = Math.min(n.items.length - 1, 2);
    body = `<div class="n-stack has-${ghosts}">${ghosts > 1 ? '<div class="n-ghost g2"></div>' : ''}${ghosts > 0 ? '<div class="n-ghost g1"></div>' : ''}${notifCardHTML(n.items[0])}</div>`;
  } else {
    body = n.items.map(notifCardHTML).join('');
  }
  return `<div class="${cls.join(' ')}" style="${style}">${body}</div>`;
}

/* ───────────── preview ───────────── */

const host = $('#mockHost');
const scaler = $('#scaler');
const canvas = $('#canvas');

function renderPreview() {
  document.body.classList.toggle('animated', animOn());
  if (animOn()) return scheduleAnimBuild();
  host.innerHTML = renderMode();
  fitPreview();
  // Safari decodes data: URLs async, so photos can still be 0×0 here — re-fit once they arrive
  host.querySelectorAll('img:not(.emo)').forEach((i) => { if (!i.complete) i.addEventListener('load', fitPreview, { once: true }); });
}

function fitPreview() {
  const el = host.firstElementChild;
  if (!el) return;
  const w = el.offsetWidth, h = el.offsetHeight;
  const availW = canvas.clientWidth - 64, availH = canvas.clientHeight - 64;
  const s = Math.min(1.6, availW / w, availH / h);
  host.style.transform = `scale(${s})`;
  scaler.style.width = `${w * s}px`;
  scaler.style.height = `${h * s}px`;
  const dur = animOn() && anim ? ` · ${anim.duration.toFixed(1)}s @ ${state.anim.fps}fps` : '';
  // a full-screen ChatGPT thread taller than the screen gets cut off at the bottom
  const body = el.querySelector?.('.gp-body');
  const cut = body && body.scrollHeight > body.clientHeight + 1 ? ' · ⚠ chat is taller than the screen — shorten it or use Chat only' : '';
  $('#dims').textContent = `${Math.round(w * state.scale)} × ${Math.round(h * state.scale)}px${dur}${cut}`;
}
new ResizeObserver(fitPreview).observe(canvas);

/* ───────────── panel UI ───────────── */

const panel = $('#panel');

const seg = (key, options) => `<div class="seg full" data-seg="${key}">${options
  .map(([v, label]) => `<button data-v="${v}" class="${getPath(key) === v ? 'on' : ''}">${label}</button>`).join('')}</div>`;
const text = (key, label, ph = '') => `<label class="field">${label}<input type="text" data-k="${key}" value="${esc(getPath(key))}" placeholder="${esc(ph)}"></label>`;
const check = (key, label) => `<label class="check"><input type="checkbox" data-k="${key}" ${getPath(key) ? 'checked' : ''}>${label}</label>`;
const FMT = { pt: (v) => `${v}pt`, pct: (v) => `${Math.round(v * 100)}%`, x: (v) => `${v}×`, s: (v) => `${v}s` };
const range = (key, label, min, max, step, fmt) => `<label class="field">${label} <span data-out="${key}">${FMT[fmt](getPath(key))}</span><input type="range" data-k="${key}" data-fmt="${fmt}" min="${min}" max="${max}" step="${step}" value="${getPath(key)}"></label>`;
const area = (key, label, rows = 3) => `<label class="field">${label}<textarea class="txt" data-k="${key}" rows="${rows}">${esc(getPath(key))}</textarea></label>`;
const select = (key, label, options) => `<label class="field">${label}<select data-k="${key}">${options
  .map(([v, l]) => `<option value="${v}" ${getPath(key) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;

const ICON_IMG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><circle cx="5.5" cy="6.5" r="1.3"/><path d="m2 12 4-4 3 3 2-2 3.5 3.5"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>';
const TAPBACKS = ['❤️', '👍', '👎', '😂', '‼️', '❓', '🔥', '😭'];

function msgRowHTML(it, i, total) {
  const sms = state.chat.service === 'sms' ? ' sms' : '';
  const acts = `<div class="row-acts">
      <button class="icon-btn" data-act="up" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon-btn" data-act="down" title="Move down" ${i === total - 1 ? 'disabled' : ''}>↓</button>
      ${it.type === 'msg' ? `<button class="icon-btn ${it.tapback || it.image ? 'on' : ''}" data-act="more" title="Reaction & photo">${ICON_MORE}</button>` : ''}
      <button class="icon-btn" data-act="del" title="Delete">✕</button>
    </div>`;
  if (it.type === 'time') {
    return `<div class="msg-row" data-id="${it.id}"><button class="side time" title="Timestamp divider">time</button><input class="txt" data-f="text" value="${esc(it.text)}">${acts}</div>`;
  }
  const more = `<div class="row-more">
      <div class="picks">
        <span class="hint" style="margin:0 4px 0 0">Reaction</span>
        ${TAPBACKS.map((t) => `<button data-act="tb" data-v="${t}" class="${it.tapback === t ? 'on' : ''}">${t}</button>`).join('')}
        <input class="txt" data-f="tapback" value="${esc(it.tapback)}" placeholder="any" maxlength="16">
      </div>
      <div class="picks">
        <span class="hint" style="margin:0 4px 0 0">Photo</span>
        ${it.image ? `<img class="mini-thumb" src="${it.image}"><button data-act="img-clear">Remove</button>` : `<button data-act="img">${ICON_IMG}</button>`}
        ${it.image ? '<span class="hint" style="margin:0">Text becomes a caption bubble</span>' : ''}
      </div>
    </div>`;
  return `<div class="msg-row ${openRows.has(it.id) ? 'open' : ''}" data-id="${it.id}">
      <button class="side ${it.from}${sms}" data-act="side" title="Switch sender">${it.from === 'me' ? 'Me' : 'Them'}</button>
      <textarea data-f="text" rows="1" placeholder="${it.image ? 'Caption (optional)' : 'Message'}">${esc(it.text)}</textarea>
      ${acts}${more}
    </div>`;
}

const openRows = new Set();
let scriptDraft = '', scriptOpen = false;

const EXTRAS = createExtras({
  S: () => state, esc, rich, avatar, seg, text, check, range, area, rootClasses,
  ICONS: { PHONE_PATH, MIC_SVG, SIGNAL_SVG, BATTERY_SVG, wifiSVG },
});
const extra = () => EXTRAS[state.mode];
const canAnimate = () => !extra() || !!extra().scene;
const animOn = () => state.anim.on && canAnimate();
const renderMode = () => (state.mode === 'chat' ? renderChat() : state.mode === 'notif' ? renderNotifs() : extra().render());

function animSection() {
  if (!animOn()) return '';
  return `<div class="sec">
    <h3>Animation</h3>
    <div class="row">${range('anim.speed', 'Speed', 0.5, 2, 0.1, 'x')}${range('anim.endHold', 'Hold at end', 0, 5, 0.1, 's')}</div>
    ${extra() ? extra().animControls() : state.mode === 'chat'
      ? `<div class="row">${check('chat.seqTyping', 'Typing bubble before received messages')}</div>
         ${state.chat.layout === 'phone' ? '' : `<div class="row">${seg('chat.anchor', [['bottom', 'Grow upward (anchor bottom)'], ['top', 'Grow downward (anchor top)']])}</div>`}
         <p class="hint">Bubbles pop in one at a time and the thread scrolls like the real app. Turn on “Typing indicator at end” to finish on someone typing.</p>`
      : `<div class="row">${check('anim.slideOut', 'Slide out at end')}</div>
         <p class="hint">Cards drop in from the top one at a time, bottom of the list first.</p>`}
    <p class="hint">Exports a QuickTime .mov with alpha (PNG codec) for Premiere and After Effects. QuickTime Player, Quick Look and Final Cut can’t play it — use “PNG frames .zip” there.</p>
  </div>`;
}

function chatPanel() {
  const c = state.chat;
  const phone = c.layout === 'phone';
  return `${animSection()}
  <div class="sec">
    <h3>Layout</h3>
    <div class="row">${seg('chat.layout', [['phone', 'Full screen'], ['bubbles', 'Bubbles only']])}</div>
    <div class="row">${seg('chat.service', [['imessage', 'iMessage (blue)'], ['sms', 'SMS (green)']])}</div>
    ${phone ? `
      <div class="row">${text('chat.name', 'Contact name')}${text('chat.clock', 'Clock')}</div>
      <div class="row">
        <div class="avatar-pick">${avatar(c.avatar, c.name, 40, 'thumb')}
          <button class="btn sm" data-act="avatar">Upload photo</button>
          ${c.avatar ? '<button class="btn sm ghost" data-act="avatar-clear">Remove</button>' : ''}
        </div>
        <label class="field" style="max-width:90px">Back badge<input type="text" data-k="chat.unread" value="${esc(c.unread)}" placeholder="e.g. 3"></label>
      </div>
      <div class="row" style="gap:16px">${check('chat.showStatus', 'Status bar')}${check('chat.showHeader', 'Header')}${check('chat.showInput', 'Input bar')}</div>
    ` : `
      <div class="row">${range('chat.width', 'Canvas width', 320, 600, 1, 'pt')}</div>
    `}
  </div>
  <div class="sec">
    <h3>Conversation</h3>
    <div class="msgs" id="msgList">${c.items.map((it, i) => msgRowHTML(it, i, c.items.length)).join('')}</div>
    <div class="add-row">
      <button class="btn sm" data-act="add" data-v="them">+ Them</button>
      <button class="btn sm" data-act="add" data-v="me">+ Me</button>
      <button class="btn sm ghost" data-act="add-time">+ Timestamp</button>
      <button class="btn sm ghost" data-act="clear-all" style="margin-left:auto">Clear</button>
    </div>
    <p class="hint">Enter = new bubble · Shift+Enter = line break · Alt+Enter = new bubble, other side</p>
    <details class="script" ${scriptOpen ? 'open' : ''}>
      <summary>Paste a script</summary>
      <textarea class="txt" id="scriptIn" placeholder="me: hey are you up?&#10;them: yeah why&#10;them: what happened&#10;me: you won't believe this&#10;# Today 9:41 AM">${esc(scriptDraft)}</textarea>
      <div class="add-row"><button class="btn sm primary" data-act="script-replace">Replace conversation</button><button class="btn sm" data-act="script-append">Append</button></div>
      <p class="hint">Lines starting with <b>me:</b> or <b>&gt;</b> are sent; any other <b>Name:</b> or <b>&lt;</b> is received. Lines without a prefix continue the previous sender. <b>#</b> makes a timestamp.</p>
    </details>
  </div>
  <div class="sec">
    <h3>Extras</h3>
    <div class="row">${check('chat.typing', 'Typing indicator at end')}</div>
    <div class="row">${select('chat.receipt', 'Receipt under last sent', [['none', 'None'], ['delivered', 'Delivered'], ['read', 'Read']])}
      ${c.receipt === 'read' ? text('chat.receiptTime', 'Read time') : '<div class="field"></div>'}</div>
  </div>
  <div class="sec" ${animOn() ? 'hidden' : ''}>
    <h3>Build sequence export</h3>
    <div class="row">${check('chat.seqTyping', 'Add typing frame before each received message')}</div>
    ${phone ? '' : `<div class="row">${seg('chat.anchor', [['bottom', 'Grow upward (anchor bottom)'], ['top', 'Grow downward (anchor top)']])}</div>`}
    <p class="hint">One PNG per step, all the same size — drop them on a timeline in order to animate the conversation.</p>
  </div>`;
}

function notifRowHTML(it, i, total) {
  const custom = it.app === 'custom';
  return `<div class="n-edit" data-id="${it.id}">
    <div class="n-edit-head">
      <span class="ttl">#${i + 1}${i === 0 && state.notif.layout === 'stack' ? ' · front of stack' : ''}</span>
      <button class="icon-btn" data-act="up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon-btn" data-act="down" ${i === total - 1 ? 'disabled' : ''}>↓</button>
      <button class="icon-btn" data-act="dup" title="Duplicate">⧉</button>
      <button class="icon-btn" data-act="del" title="Delete">✕</button>
    </div>
    <div class="row">
      <label class="field">App<select data-f="app">${Object.entries(APPS)
        .map(([k, a]) => `<option value="${k}" ${it.app === k ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>
      <label class="field" style="max-width:110px">Time<input type="text" data-f="time" value="${esc(it.time)}"></label>
    </div>
    ${custom ? `<div class="row">
      <label class="field">App name<input type="text" data-f="appName" value="${esc(it.appName)}"></label>
      <div class="avatar-pick" style="align-self:flex-end">${appIcon(it, 34)}
        <button class="btn sm" data-act="icon">Icon</button>${it.icon ? '<button class="btn sm ghost" data-act="icon-clear">✕</button>' : ''}</div>
    </div>` : ''}
    <div class="row">
      <label class="check"><input type="checkbox" data-f="person" ${it.person ? 'checked' : ''}>Contact photo (message style)</label>
    </div>
    ${it.person ? `<div class="row"><div class="avatar-pick">${avatar(it.avatar, it.title, 34, 'thumb')}
      <button class="btn sm" data-act="avatar">Upload photo</button>${it.avatar ? '<button class="btn sm ghost" data-act="avatar-clear">Remove</button>' : ''}</div></div>` : ''}
    <label class="field">Title<input type="text" data-f="title" value="${esc(it.title)}" placeholder="${esc(appName(it))}"></label>
    <label class="field">Subtitle<input type="text" data-f="subtitle" value="${esc(it.subtitle)}" placeholder="optional (e.g. email subject)"></label>
    <label class="field">Body<textarea class="txt" data-f="body" rows="2">${esc(it.body)}</textarea></label>
    <div class="row"><div class="avatar-pick"><span class="hint" style="margin:0">Attachment</span>
      ${it.thumb ? `<img class="mini-thumb" src="${it.thumb}"><button class="btn sm ghost" data-act="thumb-clear">Remove</button>` : '<button class="btn sm" data-act="thumb">Add image</button>'}
    </div></div>
  </div>`;
}

function notifPanel() {
  const n = state.notif;
  return `${animSection()}
  <div class="sec">
    <h3>Layout</h3>
    <div class="row">${seg('notif.layout', [['stack', 'Stacked'], ['list', 'List']])}</div>
    <div class="row">${range('notif.width', 'Card width', 300, 440, 1, 'pt')}</div>
    <div class="row">${range('notif.opacity', 'Material opacity', 0.5, 1, 0.01, 'pct')}</div>
    <p class="hint">Real notifications blur the wallpaper behind them. Over footage, ~85–95% reads closest.</p>
  </div>
  <div class="sec">
    <h3>Notifications</h3>
    <div class="msgs">${n.items.map((it, i) => notifRowHTML(it, i, n.items.length)).join('')}</div>
    <div class="add-row"><button class="btn sm" data-act="add">+ Notification</button></div>
  </div>`;
}

let focusAfterRender = null;
function renderPanel() {
  const top = panel.scrollTop;
  panel.innerHTML = state.mode === 'chat' ? chatPanel() : state.mode === 'notif' ? notifPanel() : animSection() + extra().panel();
  const grow = () => panel.querySelectorAll('textarea').forEach(autoGrow);
  grow();
  panel.scrollTop = top; // heights were collapsed while the rows rebuilt
  requestAnimationFrame(grow); // first paint can lay out before widths settle
  if (focusAfterRender) {
    const el = panel.querySelector(`[data-id="${focusAfterRender}"] [data-f="text"]`);
    el?.focus();
    focusAfterRender = null;
  }
  renderExportButtons();
}

const nativeAutoSize = CSS.supports('field-sizing', 'content');
function autoGrow(t) {
  if (nativeAutoSize && getComputedStyle(t).fieldSizing === 'content') return;
  const top = panel.scrollTop;
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight + t.offsetHeight - t.clientHeight}px`; // + borders
  panel.scrollTop = top; // collapsing to auto can clamp the panel scroll near the bottom
}

function renderAll() {
  document.querySelectorAll('#modeTabs button').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode));
  document.querySelectorAll('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.theme === state.theme));
  document.querySelectorAll('#animSeg button').forEach((b) => b.classList.toggle('on', (b.dataset.anim === 'on') === state.anim.on));
  $('#animSeg').style.display = canAnimate() ? '' : 'none'; // comments, calls and mail are stills only
  $('#scaleSel').value = String(state.scale);
  $('#bgSel').value = state.bg;
  $('#fpsSel').value = String(state.anim.fps);
  anim = null; // mode/theme may have changed — rebuild from scratch
  if (animOn() && !$('#animCanvas')) host.innerHTML = '';
  renderPanel();
  renderPreview();
}

const commit = (rerenderPanel = false) => {
  save();
  if (rerenderPanel) renderPanel();
  renderPreview();
};

const list = () => (state.mode === 'chat' ? state.chat.items : state.mode === 'notif' ? state.notif.items : extra().items?.() || []);
const findItem = (el) => {
  const id = el.closest('[data-id]')?.dataset.id;
  return id && list().find((x) => x.id === id);
};

/* panel events */

panel.addEventListener('input', (e) => {
  const t = e.target;
  if (t.tagName === 'TEXTAREA') autoGrow(t);
  if (t.id === 'scriptIn') { scriptDraft = t.value; return; }
  if (t.dataset.k) {
    const v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value;
    setPath(t.dataset.k, v);
    const out = panel.querySelector(`[data-out="${t.dataset.k}"]`);
    if (out) out.textContent = FMT[t.dataset.fmt](v);
    if (t.dataset.k === 'chat.name' || t.dataset.k === 'call.name') {
      const who = t.dataset.k === 'chat.name' ? state.chat : state.call;
      const th = panel.querySelector('.avatar-pick .thumb');
      if (th) th.outerHTML = avatar(who.avatar, who.name, 40, 'thumb');
    }
    commit(t.tagName === 'SELECT' || t.type === 'checkbox'); // these can change which controls are visible
    return;
  }
  if (t.dataset.f) {
    const it = findItem(t);
    if (!it) return;
    it[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
    const structural = t.tagName === 'SELECT' || t.type === 'checkbox';
    // keep controls that mirror this text in sync without a re-render (which would drop focus)
    const row = t.closest('[data-id]');
    if (t.dataset.f === 'tapback') {
      row.querySelectorAll('[data-act="tb"]').forEach((b) => b.classList.toggle('on', b.dataset.v === t.value));
      row.querySelector('[data-act="more"]')?.classList.toggle('on', !!(it.tapback || it.image));
    }
    if (['title', 'user', 'from'].includes(t.dataset.f)) { // fields that drive a row's initials
      const th = row.querySelector('.avatar-pick .thumb');
      if (th) th.outerHTML = avatar(it.avatar, t.value, 34, 'thumb');
    }
    if (t.dataset.f === 'appName') {
      const ic = row.querySelector('.avatar-pick .appicon');
      if (ic) ic.outerHTML = appIcon(it, 34);
      const ti = row.querySelector('[data-f="title"]');
      if (ti) ti.placeholder = appName(it);
    }
    commit(structural);
  }
});

// 'toggle' doesn't bubble
panel.addEventListener('toggle', (e) => {
  if (e.target.matches?.('details.script')) scriptOpen = e.target.open;
}, true);

panel.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.isComposing || e.keyCode === 229) return; // Enter that commits an IME composition
  if (state.mode !== 'chat' || t.dataset.f !== 'text' || e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  const items = state.chat.items;
  const it = findItem(t);
  const idx = items.indexOf(it);
  const prevFrom = it.type === 'msg' ? it.from : ([...items.slice(0, idx)].reverse().find((x) => x.type === 'msg')?.from || 'them');
  const from = e.altKey ? (prevFrom === 'me' ? 'them' : 'me') : prevFrom;
  const n = msg(from, '');
  items.splice(idx + 1, 0, n);
  focusAfterRender = n.id;
  commit(true);
});

panel.addEventListener('click', (e) => {
  const segBtn = e.target.closest('[data-seg] button');
  if (segBtn) {
    setPath(segBtn.closest('[data-seg]').dataset.seg, segBtn.dataset.v);
    commit(true);
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const items = list();
  const it = findItem(b);
  const idx = it ? items.indexOf(it) : -1;
  const c = state.chat;

  switch (act) {
    case 'side': it.from = it.from === 'me' ? 'them' : 'me'; break;
    case 'up': if (idx > 0) [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]; break;
    case 'down': if (idx < items.length - 1) [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]]; break;
    case 'del': items.splice(idx, 1); break;
    case 'dup': items.splice(idx + 1, 0, { ...structuredClone(it), id: uid() }); break;
    case 'more': openRows.has(it.id) ? openRows.delete(it.id) : openRows.add(it.id); break;
    case 'tb': it.tapback = it.tapback === b.dataset.v ? '' : b.dataset.v; break;
    case 'img': return pickImage(1200, (url) => { it.image = url; commit(true); });
    case 'img-clear': it.image = null; break;
    case 'avatar': {
      const target = it || (state.mode === 'call' ? state.call : c);
      return pickImage(400, (url) => { target.avatar = url; commit(true); });
    }
    case 'avatar-clear': (it || (state.mode === 'call' ? state.call : c)).avatar = null; break;
    case 'bg-img': return pickImage(1600, (url) => { state.call.bgImage = url; commit(true); });
    case 'role': it.role = b.dataset.v; break;
    case 'icon': return pickImage(256, (url) => { it.icon = url; commit(true); });
    case 'icon-clear': it.icon = null; break;
    case 'thumb': return pickImage(600, (url) => { it.thumb = url; commit(true); });
    case 'thumb-clear': it.thumb = null; break;
    case 'add':
      if (extra()) {
        items.push(extra().add(b.dataset.v));
      } else if (state.mode === 'chat') {
        const n = msg(b.dataset.v, '');
        items.push(n);
        focusAfterRender = n.id;
      } else {
        items.unshift(notifItem({ title: '', body: '', person: false, app: 'messages' }));
      }
      break;
    case 'add-time': items.push(stamp('Today 9:41 AM')); break;
    case 'clear-all':
      if (!confirm('Remove all messages?')) return;
      c.items = [];
      break;
    case 'script-replace':
    case 'script-append': {
      const lastFrom = [...c.items].reverse().find((x) => x.type === 'msg')?.from || 'them';
      const parsed = parseScript($('#scriptIn').value, act === 'script-append' ? lastFrom : 'them');
      if (!parsed.length) return toast('Nothing to import');
      c.items = act === 'script-replace' ? parsed : [...c.items, ...parsed];
      scriptDraft = ''; // a second Append would otherwise duplicate the import
      toast(`Imported ${parsed.length} lines`);
      break;
    }
    default: return;
  }
  commit(true);
});

// "Mom", "Mary Jane", "Sarah (work)", "Mom ❤️" — but not prose like "one more thing" or "7:30"
function isName(s) {
  const t = s.trim();
  const words = t.split(/\s+/);
  if (!/^\p{L}/u.test(t) || words.length > 3) return false;
  return words.length === 1 || /\p{Lu}/u.test(t); // multi-word names are capitalised; lowercase prose stays text
}

function parseScript(src, initialFrom = 'them') {
  const out = [];
  let from = initialFrom;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) { out.push(stamp(line.replace(/^#+\s*/, ''))); continue; }
    let m;
    if ((m = line.match(/^(?:>|me\s*:)\s*(.*)$/i))) { from = 'me'; out.push(msg(from, m[1])); continue; }
    if ((m = line.match(/^<(?!\d)\s*(.*)$/))) { from = 'them'; out.push(msg(from, m[1])); continue; }
    if ((m = line.match(/^([^:]{1,25}):(?=\s|$)\s*(.*)$/u)) && isName(m[1])) { from = 'them'; out.push(msg(from, m[2])); continue; }
    out.push(msg(from, line));
  }
  return out;
}

/* top bar */

$('#modeTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.mode = b.dataset.mode;
  save();
  renderAll();
});
$('#themeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.theme = b.dataset.theme;
  save();
  renderAll();
});
$('#scaleSel').addEventListener('change', (e) => { state.scale = Number(e.target.value); save(); fitPreview(); });
$('#bgSel').addEventListener('change', (e) => { state.bg = e.target.value; save(); renderPreview(); });
$('#animSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.anim.on = b.dataset.anim === 'on';
  save();
  renderAll();
});
$('#fpsSel').addEventListener('change', (e) => { state.anim.fps = Number(e.target.value); save(); fitPreview(); });

/* ───────────── export ───────────── */

const offscreen = $('#offscreen');
const stillStage = offscreen.appendChild(document.createElement('div'));

async function mount(html) {
  stillStage.innerHTML = html;
  const el = stillStage.firstElementChild;
  const loaded = (img) => img.complete || new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 3000); });
  await Promise.all([...el.querySelectorAll('img')].map(loaded));
  return el;
}

async function snap(html) {
  const el = await mount(html);
  await document.fonts.ready;
  const cv = await noDecode(() => domToCanvas(el, { scale: state.scale, backgroundColor: null }));
  const bytes = await encodePNG(cv);
  if (bytes.length < 100) throw new Error('Capture came back empty'); // never write an unreadable PNG
  return new Blob([bytes], { type: 'image/png' });
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const stampName = () => {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

async function zipAndDownload(files, name, store = false) {
  const zip = new JSZip();
  files.forEach(([fname, blob]) => zip.file(fname, blob));
  download(await zip.generateAsync({ type: 'blob', compression: store ? 'STORE' : 'DEFLATE' }), name);
}

// One entry per visible change in the conversation; shared by build sequences and animation.
function chatSteps() {
  const c = state.chat;
  const msgs = c.items.filter((x) => x.type === 'msg');
  const read = (m) => (m.image ? 1.6 : Math.min(3.2, Math.max(0.9, 0.7 + m.text.length * 0.03)));
  const steps = [];
  msgs.forEach((m, i) => {
    // typing shows once before each run of received messages, not between every bubble
    if (c.seqTyping && m.from === 'them' && msgs[i - 1]?.from !== 'them') steps.push({ count: i, typing: true, keepStamps: true, hold: 1.3 });
    steps.push({ count: i + 1, typing: false, hold: read(m) });
  });
  // a thread with only timestamps still gets a frame that shows them, like the still render
  if (!msgs.length && c.items.length) steps.push({ count: 0, typing: false, keepStamps: true, hold: 1 });
  if (c.typing) steps.push({ count: msgs.length, typing: true, keepStamps: true, hold: 1.3 });
  return steps;
}

const noNotifs = () => state.mode === 'notif' && !state.notif.items.length;
const emptyList = () => (state.mode === 'mail' && !state.mail.items.length)
  || (state.mode === 'comment' && !state.comment.items.length)
  || (state.mode === 'gpt' && !state.gpt.items.length);

async function exportPNG() {
  if (noNotifs()) return toast('Add a notification first');
  if (emptyList()) return toast('Add something first');
  const name = { chat: 'chat', notif: 'notification' }[state.mode] || state.mode;
  download(await snap(renderMode()), `phony-${name}-${stampName()}.png`);
}

async function exportSequence(progress) {
  const c = state.chat;
  const frames = chatSteps();
  if (!frames.length) return toast('Add some messages first');

  // bubbles layout: every frame shares the tallest frame's height so they line up on a timeline
  let height;
  if (c.layout !== 'phone') {
    height = 0;
    for (const f of frames) height = Math.max(height, (await mount(renderChat(f))).offsetHeight);
  }
  const files = [];
  const w = Math.max(2, String(frames.length).length);
  for (let i = 0; i < frames.length; i++) {
    progress(`${i + 1}/${frames.length}`);
    const f = frames[i];
    files.push([`frame_${pad(i + 1, w)}${f.typing ? '_typing' : ''}.png`, await snap(renderChat({ ...f, height }))]);
  }
  await zipAndDownload(files, `phony-chat-sequence-${stampName()}.zip`);
}

async function exportBubbles(progress) {
  const c = state.chat;
  const us = units(c.items).filter((u) => u.kind !== 'time');
  if (!us.length) return toast('Add some messages first');
  const files = [];
  const w = Math.max(2, String(us.length).length);
  for (let i = 0; i < us.length; i++) {
    progress(`${i + 1}/${us.length}`);
    const u = { ...us[i], first: true };
    // pieces always export as bubbles-only so they stay tight around the bubble
    const saved = c.layout, savedW = c.width;
    c.layout = 'bubbles';
    if (saved === 'phone') c.width = 393; // wrap like the full-screen bubble column
    const piece = renderChat({ inner: unitHTML(u) });
    c.layout = saved;
    c.width = savedW;
    files.push([`bubble_${pad(i + 1, w)}_${u.from}.png`, await snap(piece)]);
  }
  await zipAndDownload(files, `phony-chat-bubbles-${stampName()}.zip`);
}

async function exportEachNotif(progress) {
  const items = state.notif.items;
  if (!items.length) return toast('Add a notification first');
  const files = [];
  const w = Math.max(2, String(items.length).length);
  for (let i = 0; i < items.length; i++) {
    progress(`${i + 1}/${items.length}`);
    files.push([`notification_${pad(i + 1, w)}.png`, await snap(renderNotifs({ only: items[i] }))]);
  }
  await zipAndDownload(files, `phony-notifications-${stampName()}.zip`);
}

/* ───────────── animation ───────────── */

function bgFill() {
  if (state.bg === 'green') return '#00ff00';
  if (state.bg === 'theme') return state.theme === 'dark' ? '#000' : '#fff';
  return null;
}

function buildAnim(scale, opts) {
  const a = state.anim;
  if (extra()) {
    const sc = extra().scene(a.speed);
    const outro = sc.outro ? { start: sc.end + a.endHold, dur: sc.outro.dur } : null;
    const duration = outro ? outro.start + outro.dur + 0.3 : sc.end + a.endHold;
    return buildSceneAnim({ ...sc, outro, duration, bgFill: bgFill() }, scale, opts);
  }
  if (state.mode === 'chat') {
    const c = state.chat;
    const w = c.layout === 'phone' ? 393 : c.width;
    const ring = c.layout === 'phone' || state.bg === 'theme' ? 'ring' : '';
    const cls = ['mock', 'bubbles', ring, state.theme === 'dark' ? 'dark' : '', c.service === 'sms' ? 'sms' : ''].join(' ');
    return buildChatAnim({
      layout: c.layout,
      anchor: c.anchor,
      steps: chatSteps(),
      contentHTML: (f) => `<div class="${cls}" style="width:${w}px;--maxw:${Math.round(w * 0.68)}px"><div class="thread-inner">${threadHTML(sliceItems(c.items, f.count, f.keepStamps), f.typing)}</div></div>`,
      chromeHTML: () => renderChat({ inner: '' }),
      bgFill: bgFill(),
      speed: a.speed,
      endHold: a.endHold,
    }, scale, opts);
  }
  return buildNotifAnim({
    layout: state.notif.layout,
    html: renderNotifs(),
    bgFill: bgFill(),
    speed: a.speed,
    endHold: a.endHold,
    slideOut: a.slideOut,
  }, scale, opts);
}

const PREVIEW_SCALE = 2;
let anim = null, animToken = 0, buildTimer = null;
let playing = true, playT = 0, lastTs = 0, rafId = null;
const animStatus = (t) => { $('#animStatus').textContent = t; };

function scheduleAnimBuild() {
  clearTimeout(buildTimer);
  animStatus('Updating…');
  buildTimer = setTimeout(buildPreviewAnim, anim ? 450 : 0);
  if (!rafId) rafId = requestAnimationFrame(tick);
}

async function buildPreviewAnim() {
  if (!animOn()) return; // e.g. switched to a stills-only tab while a rebuild was queued
  const token = ++animToken;
  try {
    const a = await buildAnim(PREVIEW_SCALE, {
      isStale: () => token !== animToken,
      onProgress: (i, n) => animStatus(`Preparing ${i + 1}/${n}…`),
    });
    if (token !== animToken || !animOn()) return;
    anim = a;
    let cv = $('#animCanvas');
    if (!cv) {
      host.innerHTML = '<canvas id="animCanvas"></canvas>';
      cv = $('#animCanvas');
    }
    cv.width = Math.round(a.width * a.scale);
    cv.height = Math.round(a.height * a.scale);
    cv.style.width = `${a.width}px`;
    cv.style.height = `${a.height}px`;
    if (playT > a.duration) playT = 0;
    fitPreview();
    drawFrame();
    animStatus('');
  } catch (err) {
    if (err.stale) return;
    console.error(err);
    animStatus('Preview failed — see console');
  }
}

function drawFrame() {
  const cv = $('#animCanvas');
  if (!anim || !cv) return;
  anim.draw(cv.getContext('2d'), playT);
  $('#scrub').value = String(Math.round((playT / anim.duration) * 1000));
  $('#tLabel').textContent = `${playT.toFixed(1)} / ${anim.duration.toFixed(1)}s`;
}

function tick(ts) {
  if (!animOn()) { rafId = null; lastTs = 0; return; }
  const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
  lastTs = ts;
  if (anim && playing) {
    playT += dt;
    if (playT >= anim.duration) playT = 0;
  }
  drawFrame();
  rafId = requestAnimationFrame(tick);
}

const setPlaying = (on) => { playing = on; $('#playBtn').textContent = on ? '❚❚' : '▶'; };
$('#playBtn').addEventListener('click', () => setPlaying(!playing));
$('#restartBtn').addEventListener('click', () => { playT = 0; setPlaying(true); });
$('#scrub').addEventListener('input', (e) => {
  if (!anim) return;
  setPlaying(false);
  playT = (Number(e.target.value) / 1000) * anim.duration;
  drawFrame();
});

async function renderAnimFrames(progress) {
  const fps = state.anim.fps;
  clearTimeout(buildTimer); // a preview build queued just before the export would start mid-export
  anim = null; // release the preview's captures while the export builds its own
  ++animToken;
  try {
    const a = await buildAnim(state.scale, { onProgress: (i, n) => progress(`prep ${i + 1}/${n}`) });
    return { ...(await renderFrames(a, fps, (i, n) => progress(`frame ${i}/${n}`))), fps };
  } finally {
    scheduleAnimBuild();
  }
}

async function exportMov(progress) {
  if (noNotifs()) return toast('Add a notification first');
  const mode = state.mode;
  const { frames, width, height, fps } = await renderAnimFrames(progress);
  progress('writing');
  download(pngMov(frames, width, height, fps), `phony-${mode}-anim-${stampName()}.mov`);
}

async function exportFrames(progress) {
  if (noNotifs()) return toast('Add a notification first');
  const mode = state.mode;
  const { frames } = await renderAnimFrames(progress);
  progress('zipping');
  const w = Math.max(4, String(frames.length).length);
  await zipAndDownload(frames.map((f, i) => [`frame_${pad(i + 1, w)}.png`, f]), `phony-${mode}-frames-${stampName()}.zip`, true);
}

let exporting = null; // { k, text } while an export runs

function renderExportButtons() {
  const btns = animOn()
    ? [['mov', 'Export .mov (alpha)', true], ['frames', 'PNG frames .zip']]
    : extra()
      ? [['png', 'Download PNG', true]]
      : state.mode === 'chat'
      ? [['png', 'Download PNG', true], ['seq', 'Build sequence .zip'], ['bubbles', 'Each bubble .zip']]
      : [['png', 'Download PNG', true], ['each', 'Each notification .zip']];
  $('#exportBtns').innerHTML = btns
    .map(([k, l, primary]) => `<button class="btn ${primary ? 'primary' : ''}" data-export="${k}"${exporting ? ' disabled' : ''}>${exporting?.k === k ? exporting.text : l}</button>`)
    .join('');
}

// Exports read state across many awaits, so nothing that changes it may be touched mid-export.
const LOCKED = ['#panel', '.topbar', '#animSeg', '#scaleSel', '#bgSel', '#fpsSel'];
const lockUI = (on) => LOCKED.forEach((sel) => { $(sel).inert = on; });

$('#exportBtns').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-export]');
  if (!b || exporting) return;
  const k = b.dataset.export;
  exporting = { k, text: 'Rendering…' };
  renderExportButtons();
  lockUI(true);
  const progress = (p) => {
    exporting.text = `Rendering ${p}…`;
    const cur = $(`[data-export="${k}"]`);
    if (cur) cur.textContent = exporting.text;
  };
  try {
    const fn = { png: exportPNG, seq: exportSequence, bubbles: exportBubbles, each: exportEachNotif, mov: exportMov, frames: exportFrames }[k];
    await fn(progress);
  } catch (err) {
    console.error(err);
    toast(err.message?.includes('4 GB') ? err.message : 'Export failed — see console');
  } finally {
    stillStage.innerHTML = '';
    exporting = null;
    lockUI(false);
    if (adoptPending) {
      adoptPending = false;
      adoptSaved(); // re-renders the buttons too
    } else {
      renderExportButtons();
    }
  }
});

renderAll();
