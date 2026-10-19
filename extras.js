/* Extra mockup types: Google/Safari search, ChatGPT, comments, calls, Mail.
   Each mode supplies defaults, a panel, a still render and an animation scene
   (see buildSceneAnim in anim.js). Helpers come from app.js. */

const xid = () => Math.random().toString(36).slice(2, 9);
const gptTurn = (role, text) => ({ id: xid(), role, text });
const comment = (extra = {}) => ({ id: xid(), user: 'jessmakeup', text: 'wait does this actually work on fine hair??', likes: '2,341', time: '2d', avatar: null, verified: false, liked: false, ...extra });
const mailRow = (extra = {}) => ({ id: xid(), from: 'LegalZoom', subject: 'Your LLC filing is complete', preview: 'Congratulations! Your business is officially registered. Here’s what to do next…', time: '9:41 AM', unread: true, avatar: null, ...extra });

export const EXTRA_DEFAULTS = () => ({
  search: {
    style: 'google', logo: true, query: 'best hair extensions for thin hair',
    placeholder: 'Search', suggest: true,
    suggestions: 'best hair extensions for thin hair reddit\nbest hair extensions for thin hair clip in\nbest hair extensions for thin hair and fine hair',
    width: 361, typeSpeed: 1, intro: 'fade',
  },
  gpt: {
    layout: 'phone', model: 'ChatGPT', showActions: true, intro: 'none',
    items: [
      gptTurn('user', 'what are the best hair extensions for thin hair?'),
      gptTurn('assistant', 'For thin or fine hair, you want extensions that add volume **without weighing your hair down** or showing at the roots.\n\n- **Seamless clip-ins:** a flat silicone weft that lies flat, so it won’t show through thin hair\n- **Tape-ins:** lightweight and long-lasting, but need a stylist\n- **Halo extensions:** no clips at all, so zero stress on fine strands\n\nMatch the color and density to your own hair for the most natural look.'),
    ],
  },
  comment: {
    style: 'ig', width: 361, card: true,
    items: [comment(), comment({ user: 'hairbysam', text: 'been using these for 6 months and nobody can tell 😍', likes: '892', time: '1d', liked: true })],
  },
  call: { style: 'banner', name: 'Mom', label: '', avatar: null, bg: 'gray', bgImage: null, width: 361 },
  mail: {
    width: 393, avatars: false,
    items: [mailRow(), mailRow({ from: 'Chase', subject: 'Your statement is ready', preview: 'Your October statement for account ending in 4821 is now available to view online.', time: 'Yesterday', unread: false })],
  },
});

export function createExtras(h) {
  const { S, esc, rich, avatar, seg, text, check, range, area, rootClasses, ICONS } = h;
  const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

  /* ───────────── icons ───────────── */
  const MAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
  const LENS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3.2"/></svg>';
  const FILL_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17 7 7M7 15V7h8"/></svg>';
  const CLEAR = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8" stroke="var(--clear-x)" stroke-width="2" stroke-linecap="round"/></svg>';
  const G_LOGO = '<svg viewBox="0 0 48 48"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C8 41.1 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.9l7.3-5.7z"/><path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.3 5.7c1.7-5.2 6.6-9.1 12.3-9.1z"/></svg>';
  const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const MENU = `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 8h16M4 15h10"/></svg>`;
  const NEWCHAT = `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M18.4 3.6a2 2 0 0 1 2.8 2.8L13 14.6l-3.6.8.8-3.6z"/></svg>`;
  const COPY = `<svg viewBox="0 0 24 24" ${STROKE}><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`;
  const THUMB_UP = `<svg viewBox="0 0 24 24" ${STROKE}><path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1.2 2.2 2.7L12.7 10H18a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/></svg>`;
  const THUMB_DN = `<svg viewBox="0 0 24 24" ${STROKE} style="transform:scaleY(-1)"><path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1.2 2.2 2.7L12.7 10H18a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/></svg>`;
  const SPEAKER = `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 10v4h3l5 4V6L7 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>`;
  const REDO = `<svg viewBox="0 0 24 24" ${STROKE}><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>`;
  const PLUS = `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 5v14M5 12h14"/></svg>`;
  const WAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 10v4M10 7v10M14 9v6M18 11v2"/></svg>';
  const HEART = `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 20s-7.5-4.6-9-9.3C2 7.4 4.3 4.5 7.4 4.5c2 0 3.6 1.2 4.6 2.8 1-1.6 2.6-2.8 4.6-2.8 3.1 0 5.4 2.9 4.4 6.2C19.5 15.4 12 20 12 20z"/></svg>`;
  const HEART_F = '<svg viewBox="0 0 24 24"><path fill="#ff3040" d="M12 20s-7.5-4.6-9-9.3C2 7.4 4.3 4.5 7.4 4.5c2 0 3.6 1.2 4.6 2.8 1-1.6 2.6-2.8 4.6-2.8 3.1 0 5.4 2.9 4.4 6.2C19.5 15.4 12 20 12 20z"/></svg>';
  const VERIFIED = '<svg viewBox="0 0 24 24"><path fill="#0095f6" d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1L2.6 15.8l1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z"/><path d="m8 12.2 2.7 2.7L16.2 9.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const PHONE = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${ICONS.PHONE_PATH}"/></svg>`;
  const HANGUP = `<svg viewBox="0 0 24 24" style="transform:rotate(135deg)"><path fill="currentColor" d="${ICONS.PHONE_PATH}"/></svg>`;
  const VIDEO = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
  const ALARM = `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M5 4 2.5 6.5M19 4l2.5 2.5"/></svg>`;
  const BUBBLE = `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 4c-4.7 0-8.5 3.1-8.5 7 0 2.2 1.2 4.1 3.1 5.4-.2 1.3-.8 2.5-1.8 3.4 1.8.1 3.5-.6 4.7-1.6.8.2 1.6.3 2.5.3 4.7 0 8.5-3.1 8.5-7s-3.8-7.5-8.5-7.5z"/></svg>`;
  const CHEV = '<svg viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 1.5 6.5 7l-5 5.5"/></svg>';

  const statusbar = (light) => `<div class="statusbar${light ? ' sb-light' : ''}"><span class="clock">9:41</span><span class="sys">${ICONS.SIGNAL_SVG}${ICONS.wifiSVG()}${ICONS.BATTERY_SVG}</span></div>`;
  const homebar = (light) => `<div class="homebar${light ? ' hb-light' : ''}"><span></span></div>`;
  const root = (kind, style, inner, extra = []) => {
    // full-screen layouts paint their own background, so bg modes don't apply
    const cls = extra.includes('phone') ? [...rootClasses('phone'), kind, ...extra] : [...rootClasses(kind), ...extra];
    return `<div class="${cls.join(' ')}" style="${style}">${inner}</div>`;
  };
  const listRow = (it, i, total, body, opts = {}) => `<div class="n-edit" data-id="${it.id}">
    <div class="n-edit-head">
      <span class="ttl">${opts.title ?? `#${i + 1}`}</span>
      <button class="icon-btn" data-act="up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon-btn" data-act="down" ${i === total - 1 ? 'disabled' : ''}>↓</button>
      <button class="icon-btn" data-act="dup" title="Duplicate">⧉</button>
      <button class="icon-btn" data-act="del" title="Delete">✕</button>
    </div>${body}</div>`;
  const fText = (it, f, label, ph = '') => `<label class="field">${label}<input type="text" data-f="${f}" value="${esc(it[f])}" placeholder="${esc(ph)}"></label>`;
  const fArea = (it, f, label, rows = 2) => `<label class="field">${label}<textarea class="txt" data-f="${f}" rows="${rows}">${esc(it[f])}</textarea></label>`;
  const fCheck = (it, f, label) => `<label class="check"><input type="checkbox" data-f="${f}" ${it[f] ? 'checked' : ''}>${label}</label>`;
  const avatarPick = (img, name, size) => `<div class="avatar-pick">${avatar(img, name, size, 'thumb')}
      <button class="btn sm" data-act="avatar">Photo</button>${img ? '<button class="btn sm ghost" data-act="avatar-clear">✕</button>' : ''}</div>`;
  const introSeg = (key) => `<div class="row">${seg(key, [['none', 'No intro'], ['fade', 'Fade in'], ['drop', 'Drop in']])}</div>`;

  /* ───────────── Search ───────────── */
  const search = {
    label: 'Search',
    panel() {
      const s = S().search;
      return `<div class="sec"><h3>Search bar</h3>
        <div class="row">${seg('search.style', [['google', 'Google'], ['safari', 'Safari']])}</div>
        <div class="row">${text('search.query', 'Search text')}</div>
        <div class="row">${text('search.placeholder', 'Placeholder')}${s.style === 'google' ? `<div class="field" style="justify-content:flex-end">${check('search.logo', 'Google logo')}</div>` : ''}</div>
        <div class="row">${range('search.width', 'Width', 300, 440, 1, 'pt')}</div>
      </div>
      <div class="sec"><h3>Suggestions</h3>
        <div class="row">${check('search.suggest', 'Show suggestions')}</div>
        ${s.suggest ? `<div class="row">${area('search.suggestions', 'One per line — the part you typed stays regular, the rest is bold', 4)}</div>` : ''}
      </div>`;
    },
    animControls() {
      return `${introSeg('search.intro')}<div class="row">${range('search.typeSpeed', 'Typing speed', 0.5, 2, 0.1, 'x')}</div>
        <p class="hint">Blinking cursor → the search types out letter by letter → suggestions slide in.</p>`;
    },
    render({ anim = false } = {}) {
      const s = S().search;
      const g = s.style === 'google';
      const q = s.query.trim();
      const ph = `<span class="s-ph" data-l="ph"${!anim && q ? ' hidden' : ''}>${esc(s.placeholder)}</span>`;
      const caret0 = anim ? '<span class="s-caret" data-l="c0"></span>' : '';
      const typed = q ? `<span class="s-q" data-l="q">${rich(q)}</span>` : '';
      const field = `<div class="s-field">${ph}${caret0}${typed}</div>`;
      // the bar's background is its own element: one line tall until typing wraps, then full height
      const one = g ? 52 : 44;
      const bg = anim
        ? [1, 2, 3, 4, 5].map((k) => `<span class="s-bg one" data-l="bg${k}" style="height:${one + 24 * (k - 1)}px"></span>`).join('') + '<span class="s-bg" data-l="bgN"></span>'
        : '<span class="s-bg"></span>';
      const bar = g
        ? `<div class="s-bar g-bar">${bg}<span class="s-lead">${s.logo ? G_LOGO : MAG}</span>${field}<span class="s-ic">${ICONS.MIC_SVG}</span><span class="s-ic">${LENS}</span></div>`
        : `<div class="s-top"><div class="s-bar sf-bar">${bg}<span class="s-ic">${MAG}</span>${field}${q ? `<span class="s-clear"${anim ? ' data-l="clr"' : ''}>${CLEAR}</span>` : ''}</div><span class="sf-cancel">Cancel</span></div>`;
      const sugs = s.suggest ? lines(s.suggestions).slice(0, 8) : [];
      const sugHTML = sugs.length ? `<div class="s-sugs" data-l="sugs">${sugs.map((x) => {
        const low = x.toLowerCase(), pre = q.toLowerCase();
        const body = q && low.startsWith(pre) ? `${rich(x.slice(0, q.length))}<b>${rich(x.slice(q.length))}</b>` : rich(x);
        return `<div class="s-sug" data-l="sug"><span class="s-ic sm">${MAG}</span><span class="s-sug-t">${body}</span>${g ? `<span class="s-ic sm">${FILL_ARROW}</span>` : ''}</div>`;
      }).join('')}</div>` : '';
      return root('search-wrap', `width:${s.width}px`, bar + sugHTML, [`s-${s.style}`]);
    },
    scene(speed) {
      const s = S().search;
      const n = [...new Intl.Segmenter().segment(s.query.trim())].length;
      let t = s.intro === 'none' ? 0.2 : 0.55;
      const typeAt = t + 0.7 / speed; // a beat with the blinking cursor first
      const typeDur = Math.max(0.3, n * 0.1 / (s.typeSpeed * speed)); // ~10 characters a second
      const bgIds = ['bg1', 'bg2', 'bg3', 'bg4', 'bg5', 'bgN'];
      const layers = [
        ...bgIds.map((id) => ({ id, sel: `[data-l="${id}"]`, fx: 'show', start: id === 'bg1' ? 0 : Infinity, under: true })),
        // with nothing to type, the placeholder and cursor just stay
        { sel: '[data-l="ph"]', fx: 'show', start: 0, end: n ? typeAt : undefined },
        { sel: '[data-l="c0"]', fx: 'blink', start: t, end: n ? typeAt : undefined },
        { sel: '[data-l="clr"]', fx: 'show', start: typeAt },
        { sel: '[data-l="q"]', fx: 'keys', start: typeAt, dur: typeDur, caret: s.style === 'google' ? '#1a73e8' : '#007aff', caretAfter: true, grow: bgIds },
      ];
      t = typeAt + typeDur + 0.15 / speed;
      if (s.suggest) {
        layers.push({ sel: '[data-l="sugs"]', fx: 'rise', start: t, dur: 0.35 / speed });
        layers.push(...[...Array(8)].map((_, i) => ({ sel: `[data-l="sug"]:nth-child(${i + 1})`, fx: 'fade', start: t + (0.08 + i * 0.07) / speed, dur: 0.25 / speed })));
        t += 0.8 / speed;
      }
      return { html: this.render({ anim: true }), intro: s.intro, layers, end: t };
    },
  };

  /* ───────────── ChatGPT ───────────── */
  const md = (src) => {
    // tiny markdown: paragraphs, "- " bullets, "1." numbers, ### headings, **bold**
    const inline = (s) => {
      const p = s.split(/\*\*/);
      if (p.length % 2 === 0) { const tail = p.pop(); p[p.length - 1] += `**${tail}`; } // unmatched ** stays as typed
      return p.map((part, i) => (i % 2 ? `<b>${rich(part)}</b>` : rich(part))).join('');
    };
    const out = [];
    let list = null;
    for (const raw of String(src || '').split('\n')) {
      const ln = raw.trim();
      const ul = ln.match(/^[-•*]\s+(.*)$/), ol = ln.match(/^(\d+)[.)]\s+(.*)$/);
      if (ul || ol) {
        const tag = ul ? 'ul' : 'ol';
        if (!list || list.tag !== tag) { list = { tag, start: ol ? Number(ol[1]) : 1, items: [] }; out.push(list); }
        list.items.push(inline(ul ? ul[1] : ol[2]));
        continue;
      }
      if (!ln) continue; // blank lines between items keep the list going (ChatGPT pastes look like this)
      list = null;
      const hd = ln.match(/^#{1,4}\s+(.*)$/);
      out.push(hd ? `<h4>${inline(hd[1])}</h4>` : `<p>${inline(ln)}</p>`);
    }
    return out.map((b) => (typeof b === 'string' ? b : `<${b.tag}${b.start > 1 ? ` start="${b.start}"` : ''}>${b.items.map((x) => `<li>${x}</li>`).join('')}</${b.tag}>`)).join('');
  };
  const gpt = {
    label: 'ChatGPT',
    items: () => S().gpt.items,
    add: (v) => gptTurn(v, ''),
    panel() {
      const g = S().gpt;
      return `<div class="sec"><h3>Layout</h3>
        <div class="row">${seg('gpt.layout', [['phone', 'Full screen'], ['bubbles', 'Chat only']])}</div>
        <div class="row">${text('gpt.model', 'Header title')}<div class="field" style="justify-content:flex-end">${check('gpt.showActions', 'Copy/like icons')}</div></div>
      </div>
      <div class="sec"><h3>Conversation</h3>
        <div class="msgs">${g.items.map((it, i) => listRow(it, i, g.items.length,
          `<div class="row">${`<div class="seg full" data-seg-item="role">${[['user', 'You'], ['assistant', 'ChatGPT']].map(([v, l]) => `<button data-act="role" data-v="${v}" class="${it.role === v ? 'on' : ''}">${l}</button>`).join('')}</div>`}</div>
           ${fArea(it, 'text', it.role === 'user' ? 'Prompt' : 'Answer — supports **bold**, "- " bullets, "1." lists, ### headings', it.role === 'user' ? 2 : 6)}`,
          { title: it.role === 'user' ? 'You' : 'ChatGPT' })).join('')}</div>
        <div class="add-row"><button class="btn sm" data-act="add" data-v="user">+ Prompt</button><button class="btn sm" data-act="add" data-v="assistant">+ Answer</button></div>
      </div>`;
    },
    animControls: () => `${introSeg('gpt.intro')}<p class="hint">Prompts slide in, a thinking dot pulses, then the answer streams in word by word.</p>`,
    render({ anim = false } = {}) {
      const g = S().gpt;
      const phone = g.layout === 'phone';
      const turns = g.items.map((it, i) => (it.role === 'user'
        ? `<div class="gp-u" data-l="u${i}"><div class="gp-ub" dir="auto">${rich(it.text)}</div></div>`
        : `<div class="gp-a">${anim ? `<span class="gp-dot" data-l="d${i}"></span>` : ''}${it.text.trim() ? `<div class="gp-at" dir="auto" data-l="a${i}">${md(it.text)}</div>` : (anim ? '' : '<span class="gp-dot"></span>')}
            ${g.showActions && it.text.trim() ? `<div class="gp-act" data-l="x${i}">${COPY}${THUMB_UP}${THUMB_DN}${SPEAKER}${REDO}</div>` : ''}</div>`)).join('');
      const thread = `<div class="gp-thread">${turns}</div>`;
      if (!phone) return root('gpt', 'width:393px', thread, ['gpt-bubbles']);
      const head = `<div class="gp-head"><span class="gp-hi">${MENU}</span><span class="gp-title">${esc(g.model)} <span class="gp-chev">${CHEV}</span></span><span class="gp-hi">${NEWCHAT}</span></div>`;
      const composer = `<div class="gp-comp"><div class="gp-field"><span class="gp-ci">${PLUS}</span><span class="gp-ph">Ask anything</span><span class="gp-ci">${ICONS.MIC_SVG}</span><span class="gp-voice">${WAVE}</span></div></div>`;
      return root('gpt', '', `${statusbar()}${head}<div class="gp-body">${thread}</div>${composer}${homebar()}`, ['phone']);
    },
    scene(speed) {
      const g = S().gpt;
      let t = g.intro === 'none' ? 0.3 : 0.6;
      const layers = [];
      g.items.forEach((it, i) => {
        if (it.role === 'user') {
          layers.push({ sel: `[data-l="u${i}"]`, fx: 'rise', start: t, dur: 0.35 / speed });
          t += (0.35 + 0.5) / speed;
        } else {
          const think = 1.1 / speed;
          if (!it.text.trim()) { // an empty answer stays "thinking", like the still
            layers.push({ sel: `[data-l="d${i}"]`, fx: 'pulse', start: t, anchor: 'center' });
            t += 1.1 / speed;
            return;
          }
          const words = it.text.trim().split(/\s+/).filter(Boolean).length;
          const dur = Math.min(14, Math.max(0.5, words * 0.075)) / speed; // ~13 words a second
          layers.push({ sel: `[data-l="d${i}"]`, fx: 'pulse', start: t, end: t + think, anchor: 'center' });
          layers.push({ sel: `[data-l="a${i}"]`, fx: 'stream', start: t + think, dur });
          layers.push({ sel: `[data-l="x${i}"]`, fx: 'fade', start: t + think + dur + 0.1 / speed, dur: 0.3 / speed });
          t += think + dur + 0.9 / speed;
        }
      });
      return { html: this.render({ anim: true }), intro: g.intro, layers, end: t };
    },
  };

  /* ───────────── Comments ───────────── */
  const comments = {
    label: 'Comments',
    items: () => S().comment.items,
    add: () => comment({ user: 'username', text: '', likes: '0', time: '1h' }),
    panel() {
      const c = S().comment;
      const sticker = c.style === 'sticker';
      return `<div class="sec"><h3>Style</h3>
        <div class="row">${seg('comment.style', [['ig', 'Instagram'], ['tiktok', 'TikTok'], ['sticker', 'TikTok reply sticker']])}</div>
        ${sticker ? '<p class="hint">The sticker uses the first comment below.</p>' : `<div class="row">${range('comment.width', 'Width', 300, 440, 1, 'pt')}</div><div class="row">${check('comment.card', 'Background card')}</div>`}
      </div>
      <div class="sec"><h3>Comments</h3>
        <div class="msgs">${c.items.map((it, i) => listRow(it, i, c.items.length, `
          <div class="row">${avatarPick(it.avatar, it.user, 34)}${fText(it, 'user', 'Username')}</div>
          ${fArea(it, 'text', 'Comment')}
          ${sticker ? '' : `<div class="row">${fText(it, 'likes', 'Likes')}${fText(it, 'time', 'Time')}</div>
          <div class="row" style="gap:16px">${fCheck(it, 'verified', 'Verified')}${fCheck(it, 'liked', 'Liked')}</div>`}`)).join('')}</div>
        <div class="add-row"><button class="btn sm" data-act="add">+ Comment</button></div>
      </div>`;
    },
    render() {
      const c = S().comment;
      if (c.style === 'sticker') {
        const it = c.items[0] || comment({ text: '' });
        return root('cm-wrap', '', `<div class="tt-st" data-l="r0"><div class="tt-st-head">${avatar(it.avatar, it.user, 20)}<span>Reply to ${esc(it.user)}’s comment</span></div><div class="tt-st-text" dir="auto">${rich(it.text)}</div></div>`, ['cm-sticker']);
      }
      const ig = c.style === 'ig';
      const rows = c.items.map((it, i) => `<div class="cm-row" data-l="r${i}">
        ${avatar(it.avatar, it.user, ig ? 36 : 34)}
        <div class="cm-main">
          <div class="cm-head"><span class="cm-user">${esc(it.user)}</span>${it.verified ? `<span class="cm-ver">${VERIFIED}</span>` : ''}${ig ? `<span class="cm-time">${esc(it.time)}</span>` : ''}</div>
          <div class="cm-text" dir="auto">${rich(it.text)}</div>
          <div class="cm-meta">${ig ? 'Reply' : `${esc(it.time)}<span>Reply</span>`}</div>
        </div>
        <div class="cm-like">${it.liked ? HEART_F : HEART}<span>${esc(it.likes)}</span></div>
      </div>`).join('');
      return root('cm-wrap', `width:${c.width}px`, `<div class="cm-list${c.card ? ' cm-card' : ''}">${rows}</div>`, [`cm-${c.style}`]);
    },
  };

  /* ───────────── Calls ───────────── */
  const call = {
    label: 'Calls',
    panel() {
      const c = S().call;
      const full = c.style !== 'banner';
      return `<div class="sec"><h3>Style</h3>
        <div class="row">${seg('call.style', [['banner', 'Incoming banner'], ['full', 'Full screen'], ['facetime', 'FaceTime']])}</div>
        <div class="row">${text('call.name', 'Caller')}${text('call.label', 'Label', c.style === 'facetime' ? 'FaceTime Video' : 'mobile')}</div>
        <div class="row">${avatarPick(c.avatar, c.name, 40)}</div>
        ${full ? `<div class="row">${seg('call.bg', [['gray', 'Gray'], ['blue', 'Blue'], ['dusk', 'Dusk'], ['photo', 'Photo']])}</div>
          ${c.bg === 'photo' ? `<div class="row"><button class="btn sm" data-act="bg-img">${c.bgImage ? 'Change background photo' : 'Upload background photo'}</button></div>` : ''}`
        : `<div class="row">${range('call.width', 'Width', 300, 440, 1, 'pt')}</div>`}
      </div>`;
    },
    render() {
      const c = S().call;
      const ft = c.style === 'facetime';
      const label = c.label || (ft ? 'FaceTime Video' : 'mobile');
      if (c.style === 'banner') {
        return root('call-wrap', `width:${c.width}px`, `<div class="cb">
          ${avatar(c.avatar, c.name, 46)}
          <div class="cb-main"><div class="cb-name">${rich(c.name)}</div><div class="cb-sub">${esc(label)}</div></div>
          <span class="cb-btn red">${HANGUP}</span><span class="cb-btn green">${PHONE}</span></div>`);
      }
      const bg = c.bg === 'photo' && c.bgImage ? `<div class="cf-bg photo" style="background-image:url(${c.bgImage})"></div>` : `<div class="cf-bg ${c.bg}"></div>`;
      return root('call-full', '', `${bg}${statusbar(true)}
        <div class="cf-top">${c.avatar ? avatar(c.avatar, c.name, 96, 'cf-av') : ''}<div class="cf-label">${esc(label)}</div><div class="cf-name">${rich(c.name)}</div></div>
        <div class="cf-small" data-l="small"><div class="cf-sb"><span class="cf-si">${ALARM}</span>Remind Me</div><div class="cf-sb"><span class="cf-si">${BUBBLE}</span>Message</div></div>
        <div class="cf-btns" data-l="btns"><div class="cf-b"><span class="cf-circle red">${HANGUP}</span>Decline</div><div class="cf-b"><span class="cf-circle green">${ft ? VIDEO : PHONE}</span>Accept</div></div>
        ${homebar(true)}`, ['phone']);
    },
  };

  /* ───────────── Mail ───────────── */
  const mail = {
    label: 'Mail',
    items: () => S().mail.items,
    add: () => mailRow({ from: '', subject: '', preview: '', time: 'now' }),
    panel() {
      const m = S().mail;
      return `<div class="sec"><h3>Inbox rows</h3>
        <div class="row">${range('mail.width', 'Width', 320, 440, 1, 'pt')}</div>
        <div class="row">${check('mail.avatars', 'Sender photos')}</div>
        <p class="hint">For a Mail lock-screen notification, use Notifications → App: Mail.</p>
      </div>
      <div class="sec"><h3>Emails</h3>
        <div class="msgs">${m.items.map((it, i) => listRow(it, i, m.items.length, `
          ${m.avatars ? `<div class="row">${avatarPick(it.avatar, it.from, 34)}</div>` : ''}
          <div class="row">${fText(it, 'from', 'From')}${fText(it, 'time', 'Time')}</div>
          ${fText(it, 'subject', 'Subject')}
          ${fArea(it, 'preview', 'Preview')}
          <div class="row">${fCheck(it, 'unread', 'Unread')}</div>`)).join('')}</div>
        <div class="add-row"><button class="btn sm" data-act="add">+ Email</button></div>
      </div>`;
    },
    render() {
      const m = S().mail;
      const rows = m.items.map((it, i) => `<div class="ml-row" data-l="m${i}">
        <span class="ml-dot${it.unread ? ' on' : ''}"></span>
        ${m.avatars ? avatar(it.avatar, it.from, 40) : ''}
        <div class="ml-main">
          <div class="ml-top"><span class="ml-from">${rich(it.from)}</span><span class="ml-time">${esc(it.time)}<span class="ml-chev">${CHEV}</span></span></div>
          <div class="ml-sub" dir="auto">${rich(it.subject)}</div>
          <div class="ml-prev" dir="auto">${rich(it.preview)}</div>
        </div></div>`).join('');
      return root('ml-wrap', `width:${m.width}px`, `<div class="ml-list">${rows}</div>`);
    },
  };

  return { search, gpt, comment: comments, call, mail };
}
