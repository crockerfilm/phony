# Phony

Free browser tool for making iOS **iMessage chats** and **notifications** as transparent PNGs for video edits.
No build step, no accounts — static files.

## Run

```bash
python3 -m http.server 5178
```

Then open http://localhost:5178 (needs a server, not `file://`, because `app.js` is an ES module).

## What it makes

**Messages**
- Full-screen iPhone (status bar, contact header, input bar) or bubbles-only on a transparent canvas
- iMessage blue / SMS green, light / dark
- Reactions (any emoji), photo messages, timestamps, typing indicator, Delivered / Read receipt
- Big emoji-only messages, grouped bubbles with tails like the real app
- Paste a script (`me:` / `them:` / `#timestamp`) to build a thread fast

**Notifications**
- Lock-screen style cards: Messages, Mail, Phone, FaceTime, Calendar, Reminders, or a custom app/icon
- Contact-photo (message) style, subtitle, attachment thumbnail
- Stacked or list layout, adjustable material opacity

**Search · ChatGPT · Comments · Calls · Mail**
- Google / Safari search bar with suggestions (types out when animated)
- ChatGPT app or chat-only, with streaming answers (bold, bullets, lists)
- Instagram / TikTok comments and the TikTok "reply to comment" sticker
- Incoming call banner, full-screen call and FaceTime
- Mail inbox rows

## Exports (2×/3×/4×; transparent, theme color, or green screen)
- **Download PNG** — what you see
- **Build sequence .zip** — one same-size frame per message (optionally with typing frames) to drop on a timeline
- **Each bubble .zip** — every bubble as its own full-width PNG for animating pop-ins
- **Each notification .zip** — every card on its own

## Animation
Switch the export bar to **Animated** to preview and export motion:
- Messages: bubbles pop in from their tail one at a time, the thread scrolls up, typing dots pulse
- Notifications: cards drop in from the top one by one, optional slide-out
- Speed, end hold and 24/30/60 fps controls
- **Export .mov (alpha)** — QuickTime with the PNG codec (`mov.js`), imports with transparency into Premiere and After Effects. QuickTime Player / Quick Look can't preview it and Final Cut can't import it — use **PNG frames .zip**, or convert:
  `ffmpeg -i in.mov -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le out.mov`
- **PNG frames .zip** — the same frames as an image sequence

`anim.js` captures each step once, then composites frames on a canvas, so preview and export match.

Everything is saved in the browser (localStorage). Renders use the system font, so exports look most accurate on a Mac (SF Pro + Apple emoji).
