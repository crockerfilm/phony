import { domToCanvas } from 'https://cdn.jsdelivr.net/npm/modern-screenshot@4.7.0/dist/index.mjs';

/* Animations are built from a few DOM captures per step, then composited on a canvas
   frame by frame — so preview playback and export are fast and identical. */

// modern-screenshot awaits img.decode() on every image. In a hidden or covered tab that promise
// never settles, so each capture sat out the library's 30 s timeout. Images are already loaded
// by the time it asks and drawImage decodes synchronously, so skip decode() while capturing.
const nativeDecode = HTMLImageElement.prototype.decode;
let capturing = 0;
HTMLImageElement.prototype.decode = function decode() {
  return capturing ? Promise.resolve() : nativeDecode.call(this);
};
export async function noDecode(fn) {
  capturing++;
  try { return await fn(); } finally { capturing--; }
}

// Hidden tabs run toBlob on throttled ~1 s wake-ups; toDataURL is synchronous.
export async function encodePNG(cv) {
  if (!document.hidden) {
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    if (blob) return new Uint8Array(await blob.arrayBuffer());
  }
  const s = atob(cv.toDataURL('image/png').split(',')[1] || '');
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (p) => Math.max(0, Math.min(1, p));
const easeOut = (p) => 1 - (1 - clamp01(p)) ** 3;
const easeIn = (p) => clamp01(p) ** 2.4;
// damped spring: ~11.5% overshoot, settles by p = 1
const spring = (p) => (p >= 1 ? 1 : 1 - Math.exp(-7 * p) * Math.cos(9 * p));
const softSpring = (p) => (p >= 1 ? 1 : 1 - Math.exp(-6.5 * p) * Math.cos(6.5 * p));

function stale() { return Object.assign(new Error('stale'), { stale: true }); }

function newStage() {
  const d = document.createElement('div');
  document.getElementById('offscreen').appendChild(d);
  return d;
}

async function mountIn(stage, html) {
  stage.innerHTML = html;
  const el = stage.firstElementChild;
  const loaded = (img) => img.complete || new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 3000); });
  await Promise.all([...el.querySelectorAll('img')].map(loaded));
  return el;
}

async function capture(el, scale) {
  await document.fonts.ready;
  return noDecode(() => domToCanvas(el, { scale, backgroundColor: null }));
}

function rel(el, root) {
  const a = el.getBoundingClientRect(), b = root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

// Keep only rows [y, y + h) (pt) of a capture and free the full-size one straight away —
// long threads would otherwise hold several full-height canvases per step.
function crop(cv, scale, y, h) {
  const sy = Math.min(cv.height - 1, Math.max(0, Math.floor(y * scale)));
  const sh = Math.max(1, Math.min(cv.height, Math.ceil((y + h) * scale)) - sy);
  const out = document.createElement('canvas');
  out.width = cv.width;
  out.height = sh;
  out.getContext('2d').drawImage(cv, 0, sy, cv.width, sh, 0, 0, cv.width, sh);
  cv.width = cv.height = 0;
  return { img: out, y: sy };
}

/* ───────────── Messages ─────────────
   d = { layout, anchor, steps:[{count,typing,keepStamps,hold}], contentHTML(step), chromeHTML(), bgFill, speed, endHold } */
export async function buildChatAnim(d, scale, { onProgress, isStale } = {}) {
  const stage = newStage();
  try {
    // phone chrome first, so every capture can be cropped to what can scroll through the thread
    let W, H, clip = null, chrome = null;
    if (d.layout === 'phone') {
      const phone = await mountIn(stage, d.chromeHTML());
      clip = rel(phone.querySelector('.thread'), phone);
      chrome = await capture(phone, scale);
      W = phone.offsetWidth;
      H = phone.offsetHeight;
    }

    const all = [{ count: 0, typing: false, hold: 0.35 }, ...d.steps];
    const frames = [];
    let prevKeys = new Set(), prevRy = null, prevLastK = null, shared = null;

    for (let i = 0; i < all.length; i++) {
      if (isStale?.()) throw stale();
      onProgress?.(i, all.length);
      const root = await mountIn(stage, d.contentHTML(all[i]));
      root.classList.add('dots-off');
      const units = [...root.querySelectorAll('[data-k]')];
      const keys = new Set(units.map((e) => e.dataset.k));
      const fresh = units.filter((e) => !prevKeys.has(e.dataset.k) && e.dataset.k !== 'receipt');
      const bubbles = fresh.filter((e) => e.classList.contains('m')); // pop from the tail corner
      const stamps = fresh.filter((e) => !e.classList.contains('m')); // fade in place

      let anchor = null;
      const main = bubbles[bubbles.length - 1];
      if (main) {
        const r = rel(main.querySelector('.bub, .typing'), root);
        anchor = main.classList.contains('me') ? { x: r.x + r.w, y: r.y + r.h } : { x: r.x, y: r.y + r.h };
      }
      // the receipt waits for its bubble: when it's new or has moved it fades in after the pop
      const rcpt = root.querySelector('[data-k="receipt"]');
      const ry = rcpt ? rel(rcpt, root).y : null;
      const late = !!rcpt && ry !== prevRy;

      const dotEls = [...root.querySelectorAll('.typing span')];
      const dots = dotEls.map((s) => { const r = rel(s, root); return { x: r.x + r.w / 2, y: r.y + r.h / 2, r: r.w / 2 }; });
      const dotColor = dotEls.length ? getComputedStyle(dotEls[0]).backgroundColor : null;

      const h = root.offsetHeight;
      const y = clip ? (h <= clip.h ? 0 : clip.h - h) : 0; // bubbles layout is placed after the loop
      const prevY = frames.length ? frames[frames.length - 1].y : y;

      const only = async (set) => {
        units.forEach((e) => { e.style.visibility = set.includes(e) ? 'visible' : 'hidden'; });
        return capture(root, scale);
      };
      // layers keep just the rows around their units (tapbacks sit ~20pt above a row)
      const band = async (set) => {
        const rs = set.map((e) => rel(e, root));
        const y0 = Math.min(...rs.map((r) => r.y)) - 30, y1 = Math.max(...rs.map((r) => r.y + r.h)) + 30;
        return crop(await only(set), scale, y0, y1 - y0);
      };
      const hidden = new Set(late ? [...fresh, rcpt] : fresh);
      const baseCv = await only(units.filter((e) => !hidden.has(e)));
      let base;
      if (clip) {
        // phone: only the rows that can pass through the clip during this step
        base = crop(baseCv, scale, -Math.max(prevY, y), clip.h + Math.abs(prevY - y));
      } else {
        // bubbles: rows above the first unit that can still change match the final step, so keep
        // only the rows from there down and draw the top from one shared full capture
        const moving = [...fresh, rcpt, units.find((e) => e.dataset.k === prevLastK), root.querySelector('[data-k="typing"]')].filter(Boolean);
        const cut = moving.length ? Math.max(0, Math.min(...moving.map((e) => rel(e, root).y)) - 30) : 0;
        base = cut > 0 ? crop(baseCv, scale, cut, h - cut) : { img: baseCv, y: 0 };
        if (i === all.length - 1) shared = await only(units);
      }
      const layer = bubbles.length ? await band(bubbles) : null;
      const fade = stamps.length ? await band(stamps) : null;
      const receipt = late ? await band([rcpt]) : null;

      frames.push({
        base, layer, fade, receipt, anchor, dots, dotColor, y, h,
        w: root.offsetWidth,
        inDur: i === 0 ? 0 : 0.45 / d.speed,
        hold: all[i].hold / d.speed,
      });
      prevKeys = keys;
      prevRy = ry;
      const ms = units.filter((e) => e.classList.contains('m'));
      prevLastK = ms.length ? ms[ms.length - 1].dataset.k : null;
    }

    if (!clip) {
      W = frames[0].w;
      H = Math.max(...frames.map((f) => f.h));
      clip = { x: 0, y: 0, w: W, h: H };
      frames.forEach((f) => { f.y = d.anchor === 'bottom' ? H - f.h : 0; });
    }

    let t = 0;
    frames.forEach((f) => { f.start = t; t += f.inDur + f.hold; });
    const duration = Math.max(0.5, t + d.endHold);

    const at = (time) => {
      let k = frames.length - 1;
      for (let i = 0; i < frames.length; i++) {
        if (time < frames[i].start + frames[i].inDur + frames[i].hold) { k = i; break; }
      }
      const f = frames[k];
      return { k, p: f.inDur ? clamp01((time - f.start) / f.inDur) : 1 };
    };

    return {
      width: W, height: H, scale, duration,
      key(time) {
        const { k, p } = at(time);
        return p >= 1 && !frames[k].dots.length ? `c${k}` : null;
      },
      draw(ctx, time) {
        const { k, p } = at(time);
        const f = frames[k], prev = frames[k - 1] || f;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (d.bgFill && !chrome) { ctx.fillStyle = d.bgFill; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
        if (chrome) ctx.drawImage(chrome, 0, 0);
        ctx.save();
        // snap to device pixels: the header's .5px hairline makes clip.y fractional, and a
        // half-pixel offset would blur the whole thread
        const cx = Math.round(clip.x * scale), cy = Math.round(clip.y * scale);
        ctx.beginPath();
        ctx.rect(cx, cy, Math.round((clip.x + clip.w) * scale) - cx, Math.round((clip.y + clip.h) * scale) - cy);
        ctx.clip();
        const ox = cx;
        const oy = Math.round((clip.y + lerp(prev.y, f.y, easeOut(p))) * scale);
        const put = (l) => ctx.drawImage(l.img, ox, oy + l.y);
        const fadeIn = (l, a) => { ctx.save(); ctx.globalAlpha = a; put(l); ctx.restore(); };

        if (shared && f.base.y) ctx.drawImage(shared, 0, 0, shared.width, f.base.y, ox, oy, shared.width, f.base.y);
        put(f.base);
        if (f.fade) fadeIn(f.fade, Math.min(1, p * 2.5));
        if (f.layer) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, p * 2.5);
          const s = 0.4 + 0.6 * spring(p);
          const ax = ox + f.anchor.x * scale, ay = oy + f.anchor.y * scale;
          ctx.translate(ax, ay);
          ctx.scale(s, s);
          ctx.translate(-ax, -ay);
          put(f.layer);
          if (f.dots.length) {
            ctx.fillStyle = f.dotColor;
            const base = ctx.globalAlpha;
            f.dots.forEach((dot, i) => {
              const v = 0.5 + 0.5 * Math.sin(time * 2 * Math.PI / 1.2 - i * 0.9);
              ctx.globalAlpha = base * (0.35 + 0.65 * v);
              ctx.beginPath();
              ctx.arc(ox + dot.x * scale, oy + dot.y * scale, dot.r * scale * (0.9 + 0.12 * v), 0, Math.PI * 2);
              ctx.fill();
            });
          }
          ctx.restore();
        }
        if (f.receipt) fadeIn(f.receipt, clamp01((p - 0.6) / 0.4));
        ctx.restore();
      },
    };
  } finally {
    stage.remove();
  }
}

/* ───────────── Notifications ─────────────
   Cards drop in from the top one at a time (bottom of the list first), pushing earlier ones down.
   d = { layout, html, bgFill, speed, endHold, slideOut } */
export async function buildNotifAnim(d, scale, { onProgress, isStale } = {}) {
  const stage = newStage();
  try {
    const root = await mountIn(stage, d.html);
    const W = root.offsetWidth, H = root.offsetHeight;
    const pieceEls = d.layout === 'stack' ? [...root.querySelectorAll('.n-stack')] : [...root.querySelectorAll('.notif')];
    const pieces = [];
    for (let i = 0; i < pieceEls.length; i++) {
      if (isStale?.()) throw stale();
      onProgress?.(i, pieceEls.length);
      const r = rel(pieceEls[i], root);
      pieces.push({ ...r, img: await capture(pieceEls[i], scale) });
    }
    const n = pieces.length;
    const P = n ? pieces[0].y : 0;
    // the drop overshoots; without root padding (transparent bg) the bounce needs room below
    const over = n ? Math.ceil(0.12 * (P + Math.max(...pieces.map((pc) => pc.h)) + 12)) : 0;
    const pad = n ? Math.max(0, over - (H - (pieces[n - 1].y + pieces[n - 1].h))) : 0;
    const inDur = 0.6 / d.speed, hold = 0.9 / d.speed, lead = 0.3;
    const arrivals = pieces.map((_, i) => lead + i * (inDur + hold));
    const allIn = n ? arrivals[n - 1] + inDur : lead;
    const outStart = allIn + (d.slideOut ? Math.max(d.endHold, 0.2) : 0);
    const outDur = 0.45 / d.speed;
    const duration = Math.max(0.5, d.slideOut ? outStart + outDur + 0.3 : allIn + Math.max(d.endHold, 0.2));

    const state = (time) => {
      const a = arrivals.filter((s) => s <= time).length; // arrivals started
      const p = a ? clamp01((time - arrivals[a - 1]) / inDur) : 1;
      const q = d.slideOut ? clamp01((time - outStart) / outDur) : 0;
      return { a, p, q };
    };

    return {
      width: W, height: H + pad, scale, duration,
      key(time) {
        const { a, p, q } = state(time);
        return p >= 1 && (q === 0 || q === 1) ? `n${a}-${q}` : null;
      },
      draw(ctx, time) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (d.bgFill) { ctx.fillStyle = d.bgFill; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
        const { a, p, q } = state(time);
        if (!a || q >= 1) return;
        const j = n - a; // newest visible piece
        const top = (m) => pieces[m].y;
        const lift = -easeIn(q) * (H + 20);
        ctx.save();
        ctx.globalAlpha = 1 - easeIn(q) * 0.6;
        for (let m = n - 1; m >= j; m--) {
          const pc = pieces[m];
          let y;
          if (m === j) y = lerp(-pc.h - 12, P, spring(p));
          else y = lerp(P + top(m) - top(j + 1), P + top(m) - top(j), softSpring(p));
          y += lift;
          ctx.save();
          if (m === j) ctx.globalAlpha *= Math.min(1, p * 3);
          ctx.drawImage(pc.img, Math.round(pc.x * scale), Math.round(y * scale));
          ctx.restore();
        }
        ctx.restore();
      },
    };
  } finally {
    stage.remove();
  }
}

/* ───────────── Scenes (search, ChatGPT, comments, calls, mail) ─────────────
   The final state is laid out once; elements tagged by a layer selector are captured separately
   and brought in on a timeline. Times are seconds, speed already applied by the caller.
   d = { html, bgFill, intro: 'none'|'fade'|'drop', outro: null|{ start, dur }, duration,
         layers: [{ sel, fx: 'show'|'fade'|'pop'|'drop'|'rise'|'keys'|'stream'|'blink'|'pulse', start, dur, end, anchor, caret, caretAfter }] }
   'keys' types one character at a time with a caret; 'stream' brings words in one by one with a quick fade.
   under: true draws a layer beneath the static base (e.g. a background that changes size). */
export async function buildSceneAnim(d, scale, { onProgress, isStale } = {}) {
  const stage = newStage();
  try {
    const root = await mountIn(stage, d.html);
    const W = root.offsetWidth, H = root.offsetHeight;
    const defs = d.layers.map((l) => ({ ...l, els: [...root.querySelectorAll(l.sel)] })).filter((l) => l.els.length);
    const all = defs.flatMap((l) => l.els);
    // a layer capture holds only that layer: everything else (incl. backgrounds) is hidden
    const only = async (set) => {
      root.style.visibility = 'hidden';
      all.forEach((e) => { e.style.visibility = set.includes(e) ? 'visible' : 'hidden'; });
      const cv = await capture(root, scale);
      root.style.visibility = '';
      return cv;
    };
    const union = (els) => {
      const rs = els.map((e) => rel(e, root));
      const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
      return { x: x0, y: y0, w: Math.max(...rs.map((r) => r.x + r.w)) - x0, h: Math.max(...rs.map((r) => r.y + r.h)) - y0 };
    };
    // Characters (or words) of an element in reading order, each with its on-screen box(es),
    // grouped into visual lines — so typing can reveal exactly one character/word at a time.
    const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const wordsSeg = new Intl.Segmenter(undefined, { granularity: 'word' });
    const textUnits = (el, byWord) => {
      const b = root.getBoundingClientRect();
      const units = [], lines = [];
      const lineOf = (top, bottom) => {
        const mid = (top + bottom) / 2;
        let i = lines.findIndex((l) => Math.abs(l.mid - mid) < Math.max(4, (bottom - top) / 3));
        if (i < 0) { lines.push({ top, bottom, mid, right: 0 }); i = lines.length - 1; }
        const l = lines[i];
        l.top = Math.min(l.top, top); l.bottom = Math.max(l.bottom, bottom);
        return i;
      };
      const add = (rects, text) => {
        const boxes = rects.filter((x) => x.width > 0 && x.height > 0).map((x) => {
          const top = x.top - b.top, bottom = x.bottom - b.top;
          return { line: lineOf(top, bottom), x: x.left - b.left, right: x.right - b.left };
        });
        units.push({ boxes, space: !text.trim() && text !== 'img', end: /[.!?:]$/.test(text) });
      };
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = walk.currentNode; n; n = walk.nextNode()) {
        if (n.nodeType === 3) {
          for (const { segment, index } of (byWord ? wordsSeg : graphemes).segment(n.textContent)) {
            const r = document.createRange();
            r.setStart(n, index);
            r.setEnd(n, index + segment.length);
            add([...r.getClientRects()], segment);
          }
        } else if (n.tagName === 'IMG') add([n.getBoundingClientRect()], 'img');
      }
      // drop leading/trailing whitespace-only text (template indentation) so timing isn't wasted on it
      while (units.length && units[0].space) units.shift();
      while (units.length && units[units.length - 1].space) units.pop();
      return { units, lines };
    };
    // deterministic jitter so the rhythm feels human but every render matches
    const FADE = 0.12; // seconds a streamed word takes to fade in
    const jitter = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    const schedule = (units, byWord) => {
      const w = units.map((u, i) => {
        if (byWord) return u.space ? 0.12 : 0.7 + 0.6 * jitter(i) + (u.end ? 1.6 : 0);
        return 0.55 + 0.9 * jitter(i) + (u.space ? 0.7 : 0); // a small beat before each new word
      });
      const total = w.reduce((a, v) => a + v, 0) || 1;
      let acc = 0;
      return w.map((v) => { acc += v; return (acc - v) / total; }); // start fraction of each unit
    };

    all.forEach((e) => { e.style.visibility = 'hidden'; });
    // with 'under' layers the root's own fill would cover them — bgFill paints that colour instead
    const under = defs.some((l) => l.under);
    if (under) root.style.setProperty('background', 'none', 'important');
    const base = await capture(root, scale);
    if (under) root.style.removeProperty('background');
    const layers = [];
    for (let i = 0; i < defs.length; i++) {
      if (isStale?.()) throw stale();
      onProgress?.(i, defs.length);
      const l = defs[i];
      const u = union(l.els);
      const cv = await only(l.els);
      const img = crop(cv, scale, u.y - 30, u.h + 60);
      const ax = { tl: u.x, bl: u.x, tr: u.x + u.w, br: u.x + u.w }[l.anchor] ?? u.x + u.w / 2;
      const ay = { tl: u.y, tr: u.y, bl: u.y + u.h, br: u.y + u.h }[l.anchor] ?? u.y + u.h / 2;
      let text = null;
      if (l.fx === 'keys' || l.fx === 'stream') {
        text = textUnits(l.els[0], l.fx === 'stream');
        text.at = schedule(text.units, l.fx === 'stream');
      }
      layers.push({ ...l, img, u, ax, ay, text, dur: l.dur || 0.001 });
    }
    // a typing layer can step through backgrounds as its text wraps: grow = [one line, two lines, …, full]
    for (const l of layers) {
      if (!l.grow || !l.text) continue;
      const bgs = l.grow.map((id) => layers.find((x) => x.id === id)).filter(Boolean);
      if (!bgs.length) continue;
      bgs.forEach((b) => { b.start = Infinity; b.end = undefined; });
      const lineCount = l.text.lines.length || 1;
      const startOf = (k) => {
        if (k === 0) return 0;
        const i = l.text.units.findIndex((u) => u.boxes.some((bx) => bx.line >= k));
        return i < 0 ? Infinity : l.start + l.text.at[i] * l.dur;
      };
      for (let k = 0; k < lineCount; k++) {
        const b = k === lineCount - 1 ? bgs[bgs.length - 1] : bgs[Math.min(k, bgs.length - 2)];
        b.start = Math.min(b.start, startOf(k));
        if (k < lineCount - 1) b.end = startOf(k + 1);
      }
    }

    const introDur = d.intro === 'drop' ? 0.6 : d.intro === 'fade' ? 0.35 : 0;
    const duration = Math.max(0.5, d.duration);
    const moving = (l, t) => {
      if (t < l.start || (l.end != null && t >= l.end)) return false;
      if (l.fx === 'blink' || l.fx === 'pulse') return true;
      if (l.fx === 'keys' && l.caretAfter && l.caret) return true; // caret keeps blinking
      return t < l.start + l.dur + (l.fx === 'stream' ? FADE : 0); // the last word is still fading in
    };

    return {
      width: W, height: H, scale, duration,
      key(t) {
        if (t < introDur) return null;
        if (d.outro && t >= d.outro.start && t < d.outro.start + d.outro.dur) return null;
        if (layers.some((l) => moving(l, t))) return null;
        const vis = layers.map((l) => (t >= l.start && (l.end == null || t < l.end) ? 1 : 0)).join('');
        return `s${vis}${d.outro && t >= d.outro.start ? 'o' : ''}`;
      },
      draw(ctx, t) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (d.bgFill) { ctx.fillStyle = d.bgFill; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
        ctx.save();
        // whole-frame intro / outro
        let alpha = 1, dy = 0;
        if (d.intro === 'fade') alpha = clamp01(t / introDur);
        if (d.intro === 'drop') { const p = clamp01(t / introDur); dy = lerp(-H - 20, 0, spring(p)); alpha = Math.min(1, p * 3); }
        if (d.outro && t >= d.outro.start) {
          const q = easeIn((t - d.outro.start) / d.outro.dur);
          dy += -q * (H + 20);
          alpha *= 1 - q * 0.6;
          if (q >= 1) { ctx.restore(); return; }
        }
        ctx.globalAlpha = alpha;
        ctx.translate(0, Math.round(dy * scale));
        // 'under' layers (backgrounds) go beneath the static base, the rest on top
        const order = [...layers.filter((l) => l.under), { isBase: true }, ...layers.filter((l) => !l.under)];
        for (const l of order) {
          if (l.isBase) { ctx.drawImage(base, 0, 0); continue; }
          if (t < l.start || (l.end != null && t >= l.end)) continue;
          const p = clamp01((t - l.start) / l.dur);
          const put = () => ctx.drawImage(l.img.img, 0, l.img.y);
          ctx.save();
          if (l.fx === 'fade') ctx.globalAlpha *= p;
          else if (l.fx === 'blink') { if (Math.floor((t - l.start) * 2) % 2) { ctx.restore(); continue; } }
          else if (l.fx === 'pulse') {
            const v = 0.5 + 0.5 * Math.sin((t - l.start) * 2 * Math.PI / 1.1);
            const s = 0.82 + 0.22 * v;
            ctx.globalAlpha *= 0.55 + 0.45 * v;
            ctx.translate(l.ax * scale, l.ay * scale); ctx.scale(s, s); ctx.translate(-l.ax * scale, -l.ay * scale);
          } else if (l.fx === 'pop') {
            const s = 0.4 + 0.6 * spring(p);
            ctx.globalAlpha *= Math.min(1, p * 2.5);
            ctx.translate(l.ax * scale, l.ay * scale); ctx.scale(s, s); ctx.translate(-l.ax * scale, -l.ay * scale);
          } else if (l.fx === 'drop') {
            ctx.globalAlpha *= Math.min(1, p * 3);
            ctx.translate(0, Math.round(lerp(-(l.u.y + l.u.h) - 12, 0, spring(p)) * scale));
          } else if (l.fx === 'rise') {
            ctx.globalAlpha *= easeOut(p);
            ctx.translate(0, Math.round(lerp(14, 0, easeOut(p)) * scale));
          } else if ((l.fx === 'keys' || l.fx === 'stream') && l.text.units.length) {
            const { units, lines, at } = l.text;
            const tt = t - l.start;
            const shownAt = (i) => at[i] * l.dur; // seconds after start when unit i appears
            // whole units revealed so far: per line, everything left of the furthest revealed box
            // (so list bullets / markers come in with their line)
            const reach = new Map();
            let last = -1;
            for (let i = 0; i < units.length && shownAt(i) <= tt; i++) {
              if (l.fx === 'stream' && tt < shownAt(i) + FADE) break;
              for (const bx of units[i].boxes) reach.set(bx.line, Math.max(reach.get(bx.line) ?? 0, bx.right));
              last = i;
            }
            const band = (li, x0, x1) => ctx.rect(Math.floor(x0 * scale), Math.floor((lines[li].top - 2) * scale), Math.ceil((x1 - x0) * scale) + 1, Math.ceil((lines[li].bottom - lines[li].top + 4) * scale));
            if (reach.size) {
              ctx.save();
              ctx.beginPath();
              for (const [li, r] of reach) band(li, 0, r);
              ctx.clip();
              put();
              ctx.restore();
            }
            if (l.fx === 'stream') {
              // the next few words fade in on top; only the first one on a fresh line brings its bullet
              const lit = new Set(reach.keys());
              for (let i = last + 1; i < units.length && shownAt(i) <= tt; i++) {
                const a = clamp01((tt - shownAt(i)) / FADE);
                ctx.save();
                ctx.globalAlpha *= a;
                ctx.beginPath();
                for (const bx of units[i].boxes) band(bx.line, lit.has(bx.line) ? bx.x : 0, bx.right);
                ctx.clip();
                put();
                ctx.restore();
                units[i].boxes.forEach((bx) => lit.add(bx.line));
              }
            }
            if (l.fx === 'keys' && l.caret) {
              const done = tt >= l.dur;
              const on = !done || (l.caretAfter && Math.floor((tt - l.dur) * 2) % 2 === 0);
              // caret sits after the last visible character (or before the first one)
              let box = null;
              for (let i = last; i >= 0 && !box; i--) box = units[i].boxes[units[i].boxes.length - 1];
              const first = units.find((u) => u.boxes.length)?.boxes[0];
              const cx = box ? box.right : first?.x;
              const ln = lines[(box || first)?.line];
              if (on && ln) {
                const h = ln.bottom - ln.top;
                ctx.fillStyle = l.caret;
                ctx.fillRect(Math.round((cx + 1) * scale), Math.round(ln.top * scale), Math.max(1, Math.round(2 * scale)), Math.round(h * scale));
              }
            }
            ctx.restore();
            continue;
          }
          put();
          ctx.restore();
        }
        ctx.restore();
      },
    };
  } finally {
    stage.remove();
  }
}

/* ───────────── rendering frames ───────────── */

export async function renderFrames(anim, fps, onProgress) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(anim.width * anim.scale);
  cv.height = Math.round(anim.height * anim.scale);
  const ctx = cv.getContext('2d');
  const total = Math.max(1, Math.round(anim.duration * fps));
  const frames = [];
  let prevKey = null, prev = null;
  for (let i = 0; i < total; i++) {
    const t = i / fps;
    const key = anim.key(t);
    if (key && key === prevKey && prev) {
      frames.push(prev); // held frame: reuse the bytes
    } else {
      anim.draw(ctx, t);
      prev = await encodePNG(cv);
      if (prev.length < 8) throw new Error('Frame encode failed');
      frames.push(prev);
    }
    prevKey = key;
    if (i % 5 === 0) onProgress?.(i + 1, total);
  }
  return { frames, width: cv.width, height: cv.height };
}
