// Minimal QuickTime writer: one video track of PNG-coded frames (keeps alpha).
// Premiere and After Effects decode 'png ' natively. macOS AVFoundation doesn't, so
// QuickTime Player, Quick Look and Final Cut can't open it (the app offers PNG frames for those).

const enc = new TextEncoder();

function bytes(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const u8 = (v) => Uint8Array.of(v & 0xff);
const u16 = (v) => Uint8Array.of((v >>> 8) & 0xff, v & 0xff);
const u32 = (v) => Uint8Array.of((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
const fourcc = (s) => enc.encode(s);
const zeros = (n) => new Uint8Array(n);
const box = (type, ...parts) => {
  const body = bytes(...parts);
  return bytes(u32(body.length + 8), fourcc(type), body);
};
const pascal = (s, fixed) => {
  const b = enc.encode(s);
  const out = bytes(u8(b.length), b);
  return fixed ? bytes(out, zeros(fixed - out.length)) : out;
};
const MATRIX = bytes(...[0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32));

/**
 * @param {Uint8Array[]} frames PNG bytes per frame (the same array may repeat for held frames)
 * @returns {Blob} video/quicktime
 */
export function pngMov(frames, width, height, fps) {
  const n = frames.length;
  const timescale = fps * 1000;
  const delta = 1000;
  const duration = n * delta;

  const ftyp = box('ftyp', fourcc('qt  '), u32(0x20050300), fourcc('qt  '));
  const dataLen = frames.reduce((s, f) => s + f.length, 0);
  if (ftyp.length + 8 + dataLen > 0xffffffff) throw new Error('Video over 4 GB — lower the size or frame rate');
  const mdatHead = bytes(u32(dataLen + 8), fourcc('mdat'));

  const offsets = [];
  let off = ftyp.length + mdatHead.length;
  for (const f of frames) { offsets.push(off); off += f.length; }

  const sampleEntry = box('png ',
    zeros(6), u16(1),             // reserved, data ref index
    u16(0), u16(0), u32(0),       // version, revision, vendor
    u32(0), u32(0x400),           // temporal / spatial quality (lossless)
    u16(width), u16(height),
    u32(0x00480000), u32(0x00480000), // 72 dpi
    u32(0), u16(1),               // data size, frames per sample
    pascal('PNG', 32),
    u16(32), u16(0xffff));        // depth 32 = alpha, no color table

  const stbl = box('stbl',
    box('stsd', u32(0), u32(1), sampleEntry),
    box('stts', u32(0), u32(1), u32(n), u32(delta)),
    box('stsc', u32(0), u32(1), u32(1), u32(1), u32(1)),
    box('stsz', u32(0), u32(0), u32(n), ...frames.map((f) => u32(f.length))),
    box('stco', u32(0), u32(n), ...offsets.map(u32)));

  const minf = box('minf',
    box('vmhd', u32(1), u16(0x40), u16(0x8000), u16(0x8000), u16(0x8000)),
    box('hdlr', u32(0), fourcc('dhlr'), fourcc('alis'), u32(0), u32(0), u32(0), pascal('DataHandler')),
    box('dinf', box('dref', u32(0), u32(1), box('alis', u32(1)))),
    stbl);

  const mdia = box('mdia',
    box('mdhd', u32(0), u32(0), u32(0), u32(timescale), u32(duration), u16(0), u16(0)),
    box('hdlr', u32(0), fourcc('mhlr'), fourcc('vide'), u32(0), u32(0), u32(0), pascal('VideoHandler')),
    minf);

  const tkhd = box('tkhd', u32(3), u32(0), u32(0), u32(1), u32(0), u32(duration), zeros(8),
    u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width * 65536), u32(height * 65536));

  const mvhd = box('mvhd', u32(0), u32(0), u32(0), u32(timescale), u32(duration),
    u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2));

  const moov = box('moov', mvhd, box('trak', tkhd, mdia));
  return new Blob([ftyp, mdatHead, ...frames, moov], { type: 'video/quicktime' });
}
