import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// ============================================================================
// 1. PNG DECODER & ENCODER (Pure Node.js with built-in zlib)
// ============================================================================

export function decodePNG(buffer) {
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  let offset = 8;
  const idatChunks = [];
  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(offset + 8, offset + 8 + len));
    }
    offset += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(width * height * 4);
  const stride = width * 4;

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const outRow = y * stride;
    const prevRow = (y - 1) * stride;
    for (let i = 0; i < stride; i++) {
      const xByte = raw[rowStart + i];
      const a = i >= 4 ? pixels[outRow + i - 4] : 0;
      const b = y > 0 ? pixels[prevRow + i] : 0;
      const c = y > 0 && i >= 4 ? pixels[prevRow + i - 4] : 0;
      let val = xByte;
      if (filter === 1) val = (xByte + a) & 255;
      else if (filter === 2) val = (xByte + b) & 255;
      else if (filter === 3) val = (xByte + ((a + b) >> 1)) & 255;
      else if (filter === 4) val = (xByte + paeth(a, b, c)) & 255;
      pixels[outRow + i] = val;
    }
  }

  return { width, height, pixels };
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePNGChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

export function encodePNG(width, height, rgbaPixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // Filter type 0 (None)
    Buffer.from(rgbaPixels.buffer, rgbaPixels.byteOffset + y * stride, stride).copy(
      raw,
      rowStart + 1
    );
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 6; // color type 6 (RGBA)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    makePNGChunk('IHDR', ihdr),
    makePNGChunk('IDAT', compressed),
    makePNGChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ============================================================================
// 2. GIF89a ENCODER WITH CUSTOM PALETTE & OPTIONAL TRANSPARENCY
// ============================================================================

function buildMoonflipPalette() {
  const pal = new Uint8Array(256 * 3);
  let idx = 0;
  const add = (r, g, b) => {
    if (idx >= 256) return idx - 1;
    pal[idx * 3] = Math.max(0, Math.min(255, Math.round(r)));
    pal[idx * 3 + 1] = Math.max(0, Math.min(255, Math.round(g)));
    pal[idx * 3 + 2] = Math.max(0, Math.min(255, Math.round(b)));
    return idx++;
  };

  // 0: Exact server icon dark space background (#000311)
  add(0, 3, 17);
  // 1..15: Deep space & dark navy gradient
  for (let i = 1; i <= 15; i++) {
    const t = i / 15;
    add(t * 18, 3 + t * 28, 17 + t * 48);
  }
  // 16..63: Rich Neon Emerald / Mint gradient (core Moonflip brand color!)
  for (let i = 0; i < 48; i++) {
    const t = i / 47;
    if (t < 0.5) {
      const u = t * 2;
      add(u * 35, 25 + u * 210, 20 + u * 135);
    } else {
      const u = (t - 0.5) * 2;
      add(35 + u * 215, 235 + u * 20, 155 + u * 95);
    }
  }
  // 64..95: Grayscale / White / Silver ramp (for crisp "moon" wordmark & stars)
  for (let i = 0; i < 32; i++) {
    const v = Math.round((i / 31) * 255);
    add(v, v, Math.min(255, v + 6));
  }
  // 96..127: Casino Gold / Amber / Warm Yellow ramp
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    add(70 + t * 185, 45 + t * 195, 5 + Math.pow(t, 2) * 180);
  }
  // 128..159: Nitro Pink / Magenta / Cosmic Violet ramp
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    add(50 + t * 205, 15 + Math.pow(t, 1.5) * 160, 80 + t * 175);
  }
  // 160..191: Cyan Ice / Electric Blue ramp
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    add(10 + Math.pow(t, 1.6) * 200, 40 + t * 210, 80 + t * 175);
  }
  // 192..215: Crimson / Flame Orange ramp
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    add(80 + t * 175, 10 + Math.pow(t, 1.8) * 160, 15 + Math.pow(t, 2.2) * 90);
  }
  // Fill remaining up to 254 with a general RGB cube fallback
  while (idx < 255) {
    const rem = idx - 216;
    const r = ((rem * 53) % 256);
    const g = ((rem * 97) % 256);
    const b = ((rem * 193) % 256);
    add(r, g, b);
  }
  // 255: Reserved Transparent Key Color (Hot Magenta)
  pal[255 * 3] = 255;
  pal[255 * 3 + 1] = 0;
  pal[255 * 3 + 2] = 255;

  return pal;
}

const PALETTE = buildMoonflipPalette();

// Fast lookup cache (15-bit RGB -> palette index 0..254)
const COLOR_LUT = new Uint8Array(32768);
COLOR_LUT.fill(255);

export function rgbToPaletteIndex(r, g, b) {
  const r5 = (r >> 3) & 31;
  const g5 = (g >> 3) & 31;
  const b5 = (b >> 3) & 31;
  const key = (r5 << 10) | (g5 << 5) | b5;
  if (COLOR_LUT[key] !== 255) return COLOR_LUT[key];

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < 255; i++) {
    const dr = r - PALETTE[i * 3];
    const dg = g - PALETTE[i * 3 + 1];
    const db = b - PALETTE[i * 3 + 2];
    // Weighted perceptual distance (extra weight on green for emerald accuracy)
    const dist = dr * dr * 2 + dg * dg * 4 + db * db * 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
      if (dist === 0) break;
    }
  }
  COLOR_LUT[key] = bestIdx;
  return bestIdx;
}

export function rgbaToIndexedFrame(rgbaPixels, width, height, transparent = false) {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const a = rgbaPixels[i * 4 + 3];
    if (transparent && a < 110) {
      out[i] = 255; // Transparent index
    } else {
      out[i] = rgbToPaletteIndex(
        rgbaPixels[i * 4],
        rgbaPixels[i * 4 + 1],
        rgbaPixels[i * 4 + 2]
      );
    }
  }
  return out;
}

function lzwEncode(indexStream) {
  const minCodeSize = 8;
  const clearCode = 256;
  const eoiCode = 257;

  const outBytes = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const subBlock = [];

  const flushSubBlock = () => {
    if (subBlock.length > 0) {
      outBytes.push(subBlock.length);
      for (let i = 0; i < subBlock.length; i++) outBytes.push(subBlock[i]);
      subBlock.length = 0;
    }
  };

  const writeCode = (code, size) => {
    bitBuffer |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      subBlock.push(bitBuffer & 0xff);
      if (subBlock.length === 255) flushSubBlock();
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  let codeSize = 9;
  let nextCode = 258;
  const table = new Int32Array(4096 * 256);
  table.fill(-1);

  writeCode(clearCode, codeSize);
  let prefix = indexStream[0];

  for (let i = 1; i < indexStream.length; i++) {
    const k = indexStream[i];
    const key = (prefix << 8) | k;
    const found = table[key];
    if (found !== -1) {
      prefix = found;
    } else {
      writeCode(prefix, codeSize);
      if (nextCode < 4096) {
        table[key] = nextCode;
        if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
        nextCode++;
      } else {
        writeCode(clearCode, codeSize);
        table.fill(-1);
        codeSize = 9;
        nextCode = 258;
      }
      prefix = k;
    }
  }

  writeCode(prefix, codeSize);
  writeCode(eoiCode, codeSize);
  if (bitCount > 0) subBlock.push(bitBuffer & 0xff);
  flushSubBlock();
  return outBytes;
}

export function encodeMoonflipGIF(width, height, frames, transparent = false) {
  const bytes = [];
  const pushByte = (b) => bytes.push(b & 0xff);
  const pushShort = (s) => {
    bytes.push(s & 0xff);
    bytes.push((s >> 8) & 0xff);
  };
  const pushStr = (str) => {
    for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
  };

  pushStr('GIF89a');
  pushShort(width);
  pushShort(height);
  pushByte(0xf7);
  pushByte(transparent ? 255 : 0);
  pushByte(0);

  for (let i = 0; i < PALETTE.length; i++) pushByte(PALETTE[i]);

  // Infinite Loop Netscape Extension
  pushByte(0x21);
  pushByte(0xff);
  pushByte(0x0b);
  pushStr('NETSCAPE2.0');
  pushByte(0x03);
  pushByte(0x01);
  pushShort(0);
  pushByte(0x00);

  for (const frame of frames) {
    pushByte(0x21);
    pushByte(0xf9);
    pushByte(0x04);
    // If transparent: disposal method 2 (restore to bg/transparent) + transparent flag = (2 << 2) | 1 = 0x09
    pushByte(transparent ? 0x09 : 0x04);
    pushShort(frame.delayCs || 5);
    pushByte(transparent ? 255 : 0);
    pushByte(0x00);

    pushByte(0x2c);
    pushShort(0);
    pushShort(0);
    pushShort(width);
    pushShort(height);
    pushByte(0x00);

    pushByte(8);
    const compressed = lzwEncode(frame.pixels);
    for (let i = 0; i < compressed.length; i++) bytes.push(compressed[i]);
    pushByte(0x00);
  }

  pushByte(0x3b);
  return Buffer.from(bytes);
}

// ============================================================================
// 3. 32-BIT RGBA CANVAS & VECTOR / BITMAP DRAWING HELPERS
// ============================================================================

export class RGBACanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  clear(r = 0, g = 3, b = 17, a = 255) {
    for (let i = 0; i < this.width * this.height; i++) {
      this.data[i * 4] = r;
      this.data[i * 4 + 1] = g;
      this.data[i * 4 + 2] = b;
      this.data[i * 4 + 3] = a;
    }
  }

  blendPixel(x, y, r, g, b, alpha = 1.0) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height || alpha <= 0) return;
    const idx = (iy * this.width + ix) * 4;
    const a = Math.max(0, Math.min(1, alpha));
    const dstA = this.data[idx + 3] / 255;
    const outA = a + dstA * (1 - a);
    if (outA <= 0) return;
    this.data[idx] = Math.round((r * a + this.data[idx] * dstA * (1 - a)) / outA);
    this.data[idx + 1] = Math.round((g * a + this.data[idx + 1] * dstA * (1 - a)) / outA);
    this.data[idx + 2] = Math.round((b * a + this.data[idx + 2] * dstA * (1 - a)) / outA);
    this.data[idx + 3] = Math.round(outA * 255);
  }

  addGlowPixel(x, y, r, g, b, intensity = 1.0) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height || intensity <= 0) return;
    const idx = (iy * this.width + ix) * 4;
    this.data[idx] = Math.min(255, Math.round(this.data[idx] + r * intensity));
    this.data[idx + 1] = Math.min(255, Math.round(this.data[idx + 1] + g * intensity));
    this.data[idx + 2] = Math.min(255, Math.round(this.data[idx + 2] + b * intensity));
    this.data[idx + 3] = Math.min(255, Math.round(this.data[idx + 3] + 255 * intensity));
  }

  drawSoftCircle(cx, cy, radius, r, g, b, maxAlpha = 1.0, additive = false) {
    const x0 = Math.max(0, Math.floor(cx - radius - 1));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius + 1));
    const y0 = Math.max(0, Math.floor(cy - radius - 1));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= radius) {
          const t = 1 - d / radius;
          const a = maxAlpha * (t * t * (3 - 2 * t));
          if (additive) this.addGlowPixel(x, y, r, g, b, a);
          else this.blendPixel(x, y, r, g, b, a);
        }
      }
    }
  }

  drawCrispCircle(cx, cy, radius, r, g, b, alpha = 1.0) {
    const x0 = Math.max(0, Math.floor(cx - radius - 2));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius + 2));
    const y0 = Math.max(0, Math.floor(cy - radius - 2));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius + 2));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const cov = Math.max(0, Math.min(1, radius + 0.5 - d));
        if (cov > 0) this.blendPixel(x, y, r, g, b, alpha * cov);
      }
    }
  }

  drawSparkleStar(cx, cy, size, r, g, b, alpha = 1.0) {
    this.drawSoftCircle(cx, cy, size * 1.4, r, g, b, alpha * 0.45, true);
    const ir = Math.ceil(size);
    for (let dy = -ir; dy <= ir; dy++) {
      for (let dx = -ir; dx <= ir; dx++) {
        const ax = Math.abs(dx) / size;
        const ay = Math.abs(dy) / size;
        // 4-point diamond star curve: x^0.55 + y^0.55 <= 1
        const val = Math.pow(ax, 0.55) + Math.pow(ay, 0.55);
        if (val <= 1.0) {
          const a = Math.pow(1 - val, 1.3) * alpha;
          this.blendPixel(cx + dx, cy + dy, 255, 255, 255, a);
        }
      }
    }
  }

  /**
   * Blit a rectangular region from a source decoded PNG with bilinear filtering,
   * optional background removal (keying out dark #000311 background), and optional specular sweep!
   */
  blitFromSource(
    src,
    srcX,
    srcY,
    srcW,
    srcH,
    dstX,
    dstY,
    dstW,
    dstH,
    {
      keyOutDarkBg = true,
      sheenPos = -999, // -1..2 diagonal normalized coordinate for light sweep
      sheenWidth = 0.18,
      sheenIntensity = 0.55,
      opacity = 1.0,
    } = {}
  ) {
    for (let dy = 0; dy < dstH; dy++) {
      const py = Math.round(dstY + dy);
      if (py < 0 || py >= this.height) continue;
      const v = dy / Math.max(1, dstH - 1);
      const sy = srcY + v * (srcH - 1);
      const sy0 = Math.max(0, Math.min(src.height - 1, Math.floor(sy)));
      const sy1 = Math.max(0, Math.min(src.height - 1, sy0 + 1));
      const fy = sy - sy0;

      for (let dx = 0; dx < dstW; dx++) {
        const px = Math.round(dstX + dx);
        if (px < 0 || px >= this.width) continue;
        const u = dx / Math.max(1, dstW - 1);
        const sx = srcX + u * (srcW - 1);
        const sx0 = Math.max(0, Math.min(src.width - 1, Math.floor(sx)));
        const sx1 = Math.max(0, Math.min(src.width - 1, sx0 + 1));
        const fx = sx - sx0;

        const i00 = (sy0 * src.width + sx0) * 4;
        const i10 = (sy0 * src.width + sx1) * 4;
        const i01 = (sy1 * src.width + sx0) * 4;
        const i11 = (sy1 * src.width + sx1) * 4;

        const bilerp = (ch) =>
          (1 - fx) * (1 - fy) * src.pixels[i00 + ch] +
          fx * (1 - fy) * src.pixels[i10 + ch] +
          (1 - fx) * fy * src.pixels[i01 + ch] +
          fx * fy * src.pixels[i11 + ch];

        let r = bilerp(0);
        let g = bilerp(1);
        let b = bilerp(2);
        let a = (bilerp(3) / 255) * opacity;

        if (keyOutDarkBg) {
          // Distance from background (#000311 -> r=0, g=3, b=17)
          const distBg = Math.hypot(r - 0, g - 3, b - 17);
          if (distBg < 14) continue;
          const edgeAlpha = Math.min(1, (distBg - 14) / 26);
          a *= edgeAlpha;
        }

        // Specular light sheen sweep across bright elements
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luma > 35 && sheenPos > -2 && sheenPos < 3) {
          const diag = (u + v) * 0.5;
          const distSheen = Math.abs(diag - sheenPos);
          if (distSheen < sheenWidth) {
            const s = Math.pow(1 - distSheen / sheenWidth, 2) * sheenIntensity;
            r = Math.min(255, r + 220 * s);
            g = Math.min(255, g + 255 * s);
            b = Math.min(255, b + 235 * s);
          }
        }

        this.blendPixel(px, py, r, g, b, a);
      }
    }
  }
}

// ============================================================================
// 4. MINIMAL 5x7 BITMAP FONT FOR CRISP BADGE LABELS
// ============================================================================

const FONT_5X7 = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '•': ['00000', '00000', '00100', '01110', '00100', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
};

export function drawText(canvas, text, cx, cy, scale, r, g, b, alpha = 1.0, letterSpacing = 2) {
  const upper = text.toUpperCase();
  const charW = 5 * scale;
  const charH = 7 * scale;
  const gap = letterSpacing * scale;
  const totalW = upper.length * charW + Math.max(0, upper.length - 1) * gap;
  let startX = Math.round(cx - totalW / 2);
  const startY = Math.round(cy - charH / 2);

  for (let i = 0; i < upper.length; i++) {
    const glyph = FONT_5X7[upper[i]] || FONT_5X7[' '];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] === '1') {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              canvas.blendPixel(startX + gx * scale + sx, startY + gy * scale + sy, r, g, b, alpha);
            }
          }
        }
      }
    }
    startX += charW + gap;
  }
}

// ============================================================================
// 5. GENERATE ANIMATED MOONFLIP SERVER BANNER GIF (640x360, 24 FRAMES)
// ============================================================================

export function generateMoonBannerGIF(iconPng) {
  const W = 640;
  const H = 360;
  const numFrames = 24;
  const frames = [];

  // Pre-seed deterministic stars
  const stars = [];
  for (let i = 0; i < 85; i++) {
    stars.push({
      x: ((i * 173 + 29) % (W - 20)) + 10,
      y: ((i * 97 + 13) % (H - 20)) + 10,
      size: (i % 4 === 0) ? 2.2 : (i % 2 === 0 ? 1.4 : 0.9),
      phase: (i * 0.45) % (Math.PI * 2),
      tint: i % 5 === 0 ? [46, 255, 165] : i % 7 === 0 ? [244, 127, 255] : [230, 242, 255],
    });
  }

  // Floating particles around the moon
  const orbs = [];
  for (let i = 0; i < 18; i++) {
    orbs.push({
      angle: (i / 18) * Math.PI * 2,
      radiusX: 98 + (i % 3) * 18,
      radiusY: 92 + (i % 2) * 14,
      speed: i % 2 === 0 ? 1 : -1,
      size: 2.5 + (i % 3) * 1.2,
      color: i % 3 === 0 ? [255, 215, 0] : i % 4 === 0 ? [244, 127, 255] : [46, 255, 165],
    });
  }

  for (let f = 0; f < numFrames; f++) {
    const t = f / numFrames;
    const angle = t * Math.PI * 2;
    const canvas = new RGBACanvas(W, H);
    canvas.clear(0, 3, 17, 255);

    // 1. Deep Cosmic Nebula Glows
    const pulse = 0.85 + 0.15 * Math.sin(angle);
    // Left emerald moon nebula
    canvas.drawSoftCircle(175, 180, 210, 0, 190, 115, 0.22 * pulse, true);
    canvas.drawSoftCircle(175, 180, 135, 46, 255, 165, 0.25 * pulse, true);
    // Right wordmark & Nitro violet/emerald accent glow
    canvas.drawSoftCircle(445, 165, 180, 20, 140, 110, 0.14 * pulse, true);
    canvas.drawSoftCircle(520, 95, 130, 180, 60, 255, 0.12 * (1.1 - 0.15 * Math.sin(angle)), true);

    // 2. Subtle Horizon Cyber Grid Glow at Bottom
    for (let y = H - 55; y < H; y++) {
      const vt = (y - (H - 55)) / 55;
      const alpha = vt * vt * 0.22;
      for (let x = 0; x < W; x++) {
        canvas.addGlowPixel(x, y, 0, 220, 140, alpha);
      }
    }

    // 3. Twinkling Starfield & Shooting Star
    for (const s of stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(angle + s.phase));
      if (s.size > 1.8 && tw > 0.75) {
        canvas.drawSparkleStar(s.x, s.y, s.size * 1.8, s.tint[0], s.tint[1], s.tint[2], tw);
      } else {
        canvas.drawSoftCircle(s.x, s.y, s.size, s.tint[0], s.tint[1], s.tint[2], tw);
      }
    }

    // Animated shooting comet across top sky
    const cometProgress = (t * 1.6) % 1.0;
    if (cometProgress < 0.65) {
      const u = cometProgress / 0.65;
      const cx = 560 - u * 480;
      const cy = 28 + u * 95;
      for (let tail = 0; tail < 28; tail++) {
        const tu = tail / 28;
        canvas.addGlowPixel(
          cx + tail * 2.4,
          cy - tail * 0.48,
          120,
          255,
          210,
          (1 - tu) * 0.65
        );
      }
      canvas.drawSparkleStar(cx, cy, 3.5, 200, 255, 230, 0.9);
    }

    // 4. Orbital Energy Ring behind/around the Moon Emblem
    const moonCx = 175;
    const moonCy = 178 + Math.sin(angle) * 5;
    for (let deg = 0; deg < 360; deg += 2) {
      const rad = (deg * Math.PI) / 180 + angle;
      const rx = moonCx + Math.cos(rad) * 116;
      const ry = moonCy + Math.sin(rad) * 116;
      const wave = 0.5 + 0.5 * Math.sin(rad * 3 - angle * 2);
      if (wave > 0.3) {
        canvas.drawSoftCircle(rx, ry, 2.2, 46, 255, 165, wave * 0.45, true);
      }
    }

    // 5. Blit Official Moonflip Crescent Moon & Flipping Chip Emblem (y: 92..316, x: 130..382 of 512x512 icon)
    const sheenPos = -0.4 + t * 2.2;
    canvas.blitFromSource(iconPng, 128, 92, 256, 224, moonCx - 112, moonCy - 98, 224, 196, {
      keyOutDarkBg: true,
      sheenPos,
      sheenWidth: 0.22,
      sheenIntensity: 0.65,
    });

    // 6. Orbiting Sparkling Particles around the Moon
    for (const o of orbs) {
      const oa = o.angle + angle * o.speed;
      const ox = moonCx + Math.cos(oa) * o.radiusX;
      const oy = moonCy + Math.sin(oa) * o.radiusY;
      const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(angle * 2 + o.angle * 3));
      canvas.drawSparkleStar(ox, oy, o.size, o.color[0], o.color[1], o.color[2], twinkle);
    }

    // 7. Right Side: Official "moonflip" Wordmark (y: 325..416, x: 64..448 of 512x512 icon)
    const wordSheen = -0.6 + ((t + 0.35) % 1.0) * 2.2;
    canvas.blitFromSource(iconPng, 60, 324, 392, 92, 298, 112, 305, 72, {
      keyOutDarkBg: true,
      sheenPos: wordSheen,
      sheenWidth: 0.2,
      sheenIntensity: 0.5,
    });

    // 8. Glowing Neon Divider Bar under Wordmark
    const barY = 198;
    const barX0 = 315;
    const barX1 = 585;
    for (let x = barX0; x <= barX1; x++) {
      const u = (x - barX0) / (barX1 - barX0);
      const edgeFade = Math.sin(u * Math.PI);
      const shimmer = 0.65 + 0.35 * Math.sin(u * 8 - angle * 2);
      canvas.drawSoftCircle(x, barY, 2.0, 46, 255, 165, edgeFade * shimmer * 0.7, true);
    }

    // 9. Subtitle Text & Nitro Boost Badge Pill
    drawText(canvas, 'PROVABLY FAIR TOKEN GAMES', 450, 222, 2, 210, 235, 225, 0.92, 1);

    // Pill badge: "NITRO BOOSTED SERVER"
    const pillX0 = 342;
    const pillX1 = 558;
    const pillY0 = 246;
    const pillY1 = 274;
    for (let y = pillY0; y <= pillY1; y++) {
      for (let x = pillX0; x <= pillX1; x++) {
        const isBorder =
          x === pillX0 || x === pillX1 || y === pillY0 || y === pillY1 ||
          x === pillX0 + 1 || x === pillX1 - 1 || y === pillY0 + 1 || y === pillY1 - 1;
        if (isBorder) {
          canvas.blendPixel(x, y, 244, 127, 255, 0.85);
        } else {
          canvas.blendPixel(x, y, 32, 14, 48, 0.78);
        }
      }
    }
    drawText(canvas, '• NITRO BOOSTED •', 450, 260, 2, 255, 180, 255, 0.98, 1);

    frames.push({
      pixels: rgbaToIndexedFrame(canvas.data, W, H, false),
      delayCs: 5, // 20 FPS
    });
  }

  return encodeMoonflipGIF(W, H, frames, false);
}

// ============================================================================
// 6. GENERATE ANIMATED SERVER ICON GIF (256x256, 20 FRAMES)
// ============================================================================

export function generateAnimatedServerIconGIF(iconPng) {
  const W = 256;
  const H = 256;
  const numFrames = 20;
  const frames = [];

  const sparkles = [
    { x: 46, y: 52, phase: 0.0, color: [46, 255, 165] },
    { x: 210, y: 48, phase: 1.2, color: [255, 230, 120] },
    { x: 38, y: 145, phase: 2.4, color: [46, 255, 165] },
    { x: 218, y: 138, phase: 3.6, color: [244, 127, 255] },
    { x: 135, y: 34, phase: 4.8, color: [160, 255, 220] },
    { x: 192, y: 86, phase: 2.0, color: [46, 255, 165] },
  ];

  for (let f = 0; f < numFrames; f++) {
    const t = f / numFrames;
    const angle = t * Math.PI * 2;
    const canvas = new RGBACanvas(W, H);
    canvas.clear(0, 3, 17, 255);

    // Breathing emerald aura behind the moon
    const pulse = 0.5 + 0.5 * Math.sin(angle);
    canvas.drawSoftCircle(128, 104, 88, 0, 220, 130, 0.16 + 0.14 * pulse, true);

    // Blit full official 512x512 icon into 256x256 with diagonal specular light sweep
    const sheenPos = -0.35 + t * 1.9;
    canvas.blitFromSource(iconPng, 0, 0, 512, 512, 0, 0, W, H, {
      keyOutDarkBg: false,
      sheenPos,
      sheenWidth: 0.18,
      sheenIntensity: 0.55,
    });

    // Add twinkling cosmic stars around the moon emblem
    for (const s of sparkles) {
      const tw = Math.max(0, Math.sin(angle + s.phase));
      if (tw > 0.1) {
        canvas.drawSparkleStar(s.x, s.y, 4.5 * tw, s.color[0], s.color[1], s.color[2], tw * 0.95);
      }
    }

    frames.push({
      pixels: rgbaToIndexedFrame(canvas.data, W, H, false),
      delayCs: 5,
    });
  }

  return encodeMoonflipGIF(W, H, frames, false);
}

// ============================================================================
// 7. GENERATE HD INVITE SPLASH PNG (1280x720) & STATIC BANNER PNG (960x540)
// ============================================================================

export function generateInviteSplashPNG(iconPng, W = 1280, H = 720) {
  const canvas = new RGBACanvas(W, H);
  canvas.clear(0, 3, 17, 255);

  // Cosmic nebula layers
  canvas.drawSoftCircle(W * 0.5, H * 0.42, H * 0.55, 0, 180, 110, 0.24, true);
  canvas.drawSoftCircle(W * 0.3, H * 0.3, H * 0.38, 138, 43, 226, 0.15, true);
  canvas.drawSoftCircle(W * 0.72, H * 0.65, H * 0.4, 0, 210, 255, 0.14, true);

  // Starfield
  for (let i = 0; i < 160; i++) {
    const sx = ((i * 293 + 47) % (W - 20)) + 10;
    const sy = ((i * 179 + 31) % (H - 20)) + 10;
    const sz = i % 9 === 0 ? 4.5 : i % 3 === 0 ? 2.2 : 1.2;
    if (sz > 3) {
      canvas.drawSparkleStar(sx, sy, sz, 120, 255, 200, 0.85);
    } else {
      canvas.drawSoftCircle(sx, sy, sz, 220, 245, 255, 0.7);
    }
  }

  // Concentric decorative rings around center
  const cx = W * 0.5;
  const cy = H * 0.44;
  for (const rad of [210, 275, 340]) {
    for (let deg = 0; deg < 360; deg += 1) {
      const a = (deg * Math.PI) / 180;
      const rx = cx + Math.cos(a) * rad;
      const ry = cy + Math.sin(a) * rad * 0.55;
      canvas.addGlowPixel(rx, ry, 46, 255, 165, 0.22);
    }
  }

  // Center Official Moonflip Logo (500x500 centered slightly above middle)
  const logoSize = Math.round(H * 0.68);
  canvas.blitFromSource(
    iconPng,
    0,
    0,
    512,
    512,
    Math.round(cx - logoSize / 2),
    Math.round(H * 0.08),
    logoSize,
    logoSize,
    { keyOutDarkBg: true, sheenPos: 0.48, sheenWidth: 0.16, sheenIntensity: 0.35 }
  );

  // Subtitle at bottom
  drawText(
    canvas,
    'OFFICIAL MOONFLIP COMMUNITY • PROVABLY FAIR GAMES',
    cx,
    Math.round(H * 0.84),
    3,
    180,
    255,
    220,
    0.92,
    2
  );

  return encodePNG(W, H, canvas.data);
}

// ============================================================================
// 8. GENERATE CUSTOM ANIMATED & STATIC EMOJIS (128x128) & STICKERS (320x320)
// ============================================================================

export function generateCustomEmojis(iconPng) {
  const emojis = [];
  const S = 128;

  // --- 1. Animated Emoji: mf_moon (Official Moon & Chip in Glowing Cosmic Emblem) ---
  {
    const frames = [];
    for (let f = 0; f < 16; f++) {
      const t = f / 16;
      const angle = t * Math.PI * 2;
      const c = new RGBACanvas(S, S);
      c.clear(0, 0, 0, 0);
      // Outer glowing emerald ring & deep cosmic disc so it looks crisp on any Discord theme
      c.drawCrispCircle(64, 64, 60, 46, 255, 165, 1);
      c.drawCrispCircle(64, 64, 56, 0, 3, 17, 1);
      c.drawSoftCircle(64, 64, 48, 0, 200, 120, 0.25, true);
      c.blitFromSource(iconPng, 122, 88, 268, 232, 12, 12, 104, 104, {
        keyOutDarkBg: true,
        sheenPos: -0.3 + t * 1.8,
        sheenWidth: 0.25,
        sheenIntensity: 0.75,
      });
      c.drawSparkleStar(28, 28, 6 * (0.4 + 0.6 * Math.sin(angle)), 120, 255, 200, 0.95);
      c.drawSparkleStar(98, 32, 6 * (0.4 + 0.6 * Math.cos(angle)), 255, 230, 100, 0.95);
      frames.push({ pixels: rgbaToIndexedFrame(c.data, S, S, true), delayCs: 6 });
    }
    emojis.push({ name: 'mf_moon', buffer: encodeMoonflipGIF(S, S, frames, true), animated: true });
  }

  // --- 2. Animated Emoji: mf_coin (3D Rotating Gold & Emerald Moonflip Token) ---
  {
    const frames = [];
    for (let f = 0; f < 16; f++) {
      const t = f / 16;
      const angle = t * Math.PI * 2;
      const scaleX = Math.cos(angle);
      const absX = Math.max(0.14, Math.abs(scaleX));
      const isEmeraldSide = scaleX < 0;
      const c = new RGBACanvas(S, S);
      c.clear(0, 0, 0, 0);

      const R = 50;
      const thickness = 8 * (1 - absX);
      for (let y = 10; y < 118; y++) {
        for (let x = 10; x < 118; x++) {
          const dy = (y - 64) / R;
          const dx = (x - 64) / (R * absX);
          const dist = Math.hypot(dx, dy);
          if (dist <= 1.0) {
            if (dist > 0.82) {
              // Striped casino chip rim
              const stripe = Math.floor((Math.atan2(dy, dx) + Math.PI) * 4) % 2 === 0;
              if (isEmeraldSide) {
                c.blendPixel(x, y, stripe ? 46 : 15, stripe ? 255 : 90, stripe ? 165 : 65, 1);
              } else {
                c.blendPixel(x, y, stripe ? 255 : 180, stripe ? 215 : 125, stripe ? 40 : 10, 1);
              }
            } else {
              // Inner coin face
              if (isEmeraldSide) {
                c.blendPixel(x, y, 10, 45, 35, 1);
              } else {
                c.blendPixel(x, y, 245, 195, 25, 1);
              }
            }
          } else if (Math.abs((x - 64) - R * absX) < thickness && Math.abs(dy) < 0.95) {
            c.blendPixel(x, y, 140, 100, 20, 1);
          }
        }
      }
      // Center 4-point star emblem on coin face
      c.drawSparkleStar(64, 64, 22 * absX, 46, 255, 165, 0.95);
      frames.push({ pixels: rgbaToIndexedFrame(c.data, S, S, true), delayCs: 5 });
    }
    emojis.push({ name: 'mf_coin', buffer: encodeMoonflipGIF(S, S, frames, true), animated: true });
  }

  // --- 3. Animated Emoji: mf_boost (Pulsing Nitro Booster Gem) ---
  {
    const frames = [];
    for (let f = 0; f < 16; f++) {
      const t = f / 16;
      const angle = t * Math.PI * 2;
      const bob = Math.sin(angle) * 4;
      const c = new RGBACanvas(S, S);
      c.clear(0, 0, 0, 0);

      // Diamond crystal polygon
      const cy = 64 + bob;
      for (let y = 16; y <= 112; y++) {
        for (let x = 20; x <= 108; x++) {
          const dy = y - cy;
          const dx = Math.abs(x - 64);
          const maxW = dy < 0 ? (1 + dy / 44) * 40 : (1 - dy / 44) * 40;
          if (maxW > 0 && dx <= maxW) {
            const facet = (x < 64 ? 0.85 : 1.1) * (dy < 0 ? 1.15 : 0.85);
            const r = Math.min(255, Math.round(235 * facet));
            const g = Math.min(255, Math.round(95 * facet));
            const b = Math.min(255, Math.round(255 * facet));
            c.blendPixel(x, y, r, g, b, 1);
          }
        }
      }
      c.drawSparkleStar(30, 30, 7 * (0.5 + 0.5 * Math.sin(angle)), 255, 180, 255, 1);
      c.drawSparkleStar(98, 36, 7 * (0.5 + 0.5 * Math.cos(angle)), 120, 255, 220, 1);
      c.drawSparkleStar(64, 52 + bob, 9, 255, 255, 255, 0.85);
      frames.push({ pixels: rgbaToIndexedFrame(c.data, S, S, true), delayCs: 5 });
    }
    emojis.push({ name: 'mf_boost', buffer: encodeMoonflipGIF(S, S, frames, true), animated: true });
  }

  // --- 4. Animated Emoji: mf_777 (Flashing Golden Jackpot 777) ---
  {
    const frames = [];
    for (let f = 0; f < 14; f++) {
      const t = f / 14;
      const flash = f % 2 === 0;
      const c = new RGBACanvas(S, S);
      c.clear(0, 0, 0, 0);
      c.drawCrispCircle(64, 64, 56, 18, 24, 42, 1);
      c.drawCrispCircle(64, 64, 52, flash ? 255 : 46, flash ? 215 : 255, flash ? 0 : 165, 1);
      c.drawCrispCircle(64, 64, 46, 12, 18, 32, 1);
      drawText(c, '777', 64, 64, 5, 255, flash ? 235 : 200, flash ? 90 : 20, 1, 1);
      c.drawSparkleStar(26, 28, 7, 255, 255, 255, flash ? 1 : 0.4);
      c.drawSparkleStar(102, 96, 7, 46, 255, 165, flash ? 0.4 : 1);
      frames.push({ pixels: rgbaToIndexedFrame(c.data, S, S, true), delayCs: 7 });
    }
    emojis.push({ name: 'mf_777', buffer: encodeMoonflipGIF(S, S, frames, true), animated: true });
  }

  // --- 5. Animated Emoji: mf_rocket (Crash Rocket with Thruster Flame) ---
  {
    const frames = [];
    for (let f = 0; f < 14; f++) {
      const t = f / 14;
      const angle = t * Math.PI * 2;
      const c = new RGBACanvas(S, S);
      c.clear(0, 0, 0, 0);
      const jx = Math.round(Math.sin(angle * 2) * 2);
      const jy = Math.round(Math.cos(angle * 2) * 2);

      // Thruster flame
      const flameLen = 22 + (f % 3) * 7;
      c.drawCrispCircle(64 + jx, 92 + jy + flameLen * 0.35, 14, 255, 90, 20, 0.95);
      c.drawCrispCircle(64 + jx, 90 + jy + flameLen * 0.2, 9, 255, 230, 60, 1);

      // Fins
      c.drawCrispCircle(42 + jx, 82 + jy, 14, 231, 76, 60, 1);
      c.drawCrispCircle(86 + jx, 82 + jy, 14, 231, 76, 60, 1);

      // Rocket Fuselage
      for (let y = 20; y <= 90; y++) {
        const u = (y - 20) / 70;
        const halfW = Math.sin(u * Math.PI * 0.85) * 22;
        for (let x = Math.round(64 - halfW); x <= Math.round(64 + halfW); x++) {
          if (y < 38) c.blendPixel(x + jx, y + jy, 46, 255, 165, 1);
          else c.blendPixel(x + jx, y + jy, 235, 242, 252, 1);
        }
      }
      // Window porthole
      c.drawCrispCircle(64 + jx, 56 + jy, 10, 46, 255, 165, 1);
      c.drawCrispCircle(64 + jx, 56 + jy, 7, 15, 35, 55, 1);
      frames.push({ pixels: rgbaToIndexedFrame(c.data, S, S, true), delayCs: 5 });
    }
    emojis.push({ name: 'mf_rocket', buffer: encodeMoonflipGIF(S, S, frames, true), animated: true });
  }

  // --- 6. Animated Emoji: mf_crown (High Roller VIP Crown) ---
  {
    const frames = [];
    for (let f = 0; f < 16; f++) {
      const t = f / 16;
      const angle = t * Math.PI * 2;
      const bob = Math.sin(angle) * 3;
      const c = new RGBACanvas(S, S);
      c.clear(0, 0, 0, 0);

      // Crown base and 3 spikes
      for (let y = 34; y <= 96; y++) {
        for (let x = 20; x <= 108; x++) {
          const ny = y - bob;
          if (ny >= 78 && ny <= 94 && x >= 24 && x <= 104) {
            c.blendPixel(x, y, 255, 200, 20, 1);
          } else if (ny >= 38 && ny < 78) {
            const p1 = Math.abs(x - 32) < (ny - 38) * 0.45;
            const p2 = Math.abs(x - 64) < (ny - 34) * 0.5;
            const p3 = Math.abs(x - 96) < (ny - 38) * 0.45;
            if (p1 || p2 || p3) {
              c.blendPixel(x, y, 255, 215, 0, 1);
            }
          }
        }
      }
      // Crown jewels
      c.drawCrispCircle(32, 36 + bob, 6, 46, 255, 165, 1);
      c.drawCrispCircle(64, 30 + bob, 7, 244, 127, 255, 1);
      c.drawCrispCircle(96, 36 + bob, 6, 46, 255, 165, 1);
      c.drawCrispCircle(64, 86 + bob, 5, 46, 255, 165, 1);
      c.drawSparkleStar(64, 24 + bob, 8 * (0.5 + 0.5 * Math.sin(angle)), 255, 255, 255, 1);
      frames.push({ pixels: rgbaToIndexedFrame(c.data, S, S, true), delayCs: 6 });
    }
    emojis.push({ name: 'mf_crown', buffer: encodeMoonflipGIF(S, S, frames, true), animated: true });
  }

  // --- 7. Animated Emoji: mf_fire (Win Streak Flame) ---
  {
    const frames = [];
    for (let f = 0; f < 14; f++) {
      const t = f / 14;
      const angle = t * Math.PI * 2;
      const c = new RGBACanvas(S, S);
      c.clear(0, 0, 0, 0);
      for (let y = 18; y <= 114; y++) {
        const u = (114 - y) / 96; // 0 at bottom, 1 at top
        const wave = Math.sin(u * 6 - angle * 2) * (u * 10);
        const radius = Math.sin(Math.pow(u, 0.7) * Math.PI) * 44;
        for (let x = 10; x < 118; x++) {
          const dx = Math.abs(x - (64 + wave));
          if (dx <= radius) {
            const core = 1 - dx / Math.max(1, radius);
            if (core > 0.55 && u < 0.65) {
              c.blendPixel(x, y, 255, 240, 90, 1);
            } else if (core > 0.25) {
              c.blendPixel(x, y, 255, 145, 20, 1);
            } else {
              c.blendPixel(x, y, 231, 55, 35, 1);
            }
          }
        }
      }
      frames.push({ pixels: rgbaToIndexedFrame(c.data, S, S, true), delayCs: 5 });
    }
    emojis.push({ name: 'mf_fire', buffer: encodeMoonflipGIF(S, S, frames, true), animated: true });
  }

  // --- 8. Animated Emoji: mf_diamond (Sparkling Cyan Ice VIP Diamond) ---
  {
    const frames = [];
    for (let f = 0; f < 16; f++) {
      const t = f / 16;
      const angle = t * Math.PI * 2;
      const bob = Math.sin(angle) * 3;
      const c = new RGBACanvas(S, S);
      c.clear(0, 0, 0, 0);
      for (let y = 22; y <= 108; y++) {
        const ny = y - bob;
        let maxW = 0;
        if (ny >= 24 && ny < 48) {
          maxW = 22 + ((ny - 24) / 24) * 28;
        } else if (ny >= 48 && ny <= 104) {
          maxW = (1 - (ny - 48) / 56) * 50;
        }
        for (let x = 14; x <= 114; x++) {
          const dx = Math.abs(x - 64);
          if (maxW > 0 && dx <= maxW) {
            const shade = (ny < 48 ? 1.15 : 0.9) * (x < 64 ? 1.05 : 0.88);
            c.blendPixel(
              x,
              y,
              Math.min(255, Math.round(70 * shade)),
              Math.min(255, Math.round(225 * shade)),
              255,
              1
            );
          }
        }
      }
      c.drawSparkleStar(34, 34 + bob, 7 * (0.5 + 0.5 * Math.sin(angle)), 255, 255, 255, 1);
      c.drawSparkleStar(92, 42 + bob, 7 * (0.5 + 0.5 * Math.cos(angle)), 180, 250, 255, 1);
      frames.push({ pixels: rgbaToIndexedFrame(c.data, S, S, true), delayCs: 5 });
    }
    emojis.push({ name: 'mf_diamond', buffer: encodeMoonflipGIF(S, S, frames, true), animated: true });
  }

  // --- 9. Static PNG Emoji: mf_logo (Official Moonflip Emblem Badge) ---
  {
    const c = new RGBACanvas(S, S);
    c.clear(0, 0, 0, 0);
    c.drawCrispCircle(64, 64, 60, 46, 255, 165, 1);
    c.drawCrispCircle(64, 64, 56, 0, 3, 17, 1);
    c.blitFromSource(iconPng, 124, 90, 264, 228, 12, 12, 104, 104, { keyOutDarkBg: true });
    emojis.push({ name: 'mf_logo', buffer: encodePNG(S, S, c.data), animated: false });
  }

  // --- 10. Static PNG Emoji: mf_verified (Neon Emerald Verified Shield) ---
  {
    const c = new RGBACanvas(S, S);
    c.clear(0, 0, 0, 0);
    c.drawCrispCircle(64, 64, 56, 46, 255, 165, 1);
    c.drawCrispCircle(64, 64, 48, 8, 28, 24, 1);
    for (let i = 0; i <= 18; i++) {
      c.drawCrispCircle(42 + i, 64 + i, 6.5, 46, 255, 165, 1);
    }
    for (let i = 0; i <= 34; i++) {
      c.drawCrispCircle(60 + i, 82 - i, 6.5, 46, 255, 165, 1);
    }
    emojis.push({ name: 'mf_verified', buffer: encodePNG(S, S, c.data), animated: false });
  }

  // --- 11. Static PNG Emoji: mf_bomb (Mines Bomb) ---
  {
    const c = new RGBACanvas(S, S);
    c.clear(0, 0, 0, 0);
    c.drawCrispCircle(60, 72, 42, 32, 38, 52, 1);
    c.drawCrispCircle(46, 56, 12, 95, 110, 135, 0.8);
    c.drawCrispCircle(84, 38, 8, 46, 52, 68, 1);
    c.drawSparkleStar(96, 26, 16, 255, 190, 40, 1);
    c.drawCrispCircle(96, 26, 7, 231, 76, 60, 1);
    emojis.push({ name: 'mf_bomb', buffer: encodePNG(S, S, c.data), animated: false });
  }

  // --- 12. Static PNG Emoji: mf_vip (VIP Diamond Badge) ---
  {
    const c = new RGBACanvas(S, S);
    c.clear(0, 0, 0, 0);
    c.drawCrispCircle(64, 64, 56, 138, 43, 226, 1);
    c.drawCrispCircle(64, 64, 49, 16, 12, 32, 1);
    drawText(c, 'VIP', 64, 64, 5, 46, 255, 165, 1, 1);
    emojis.push({ name: 'mf_vip', buffer: encodePNG(S, S, c.data), animated: false });
  }

  // --- 13. Static PNG Emoji: mf_trophy (Golden Champion Trophy) ---
  {
    const c = new RGBACanvas(S, S);
    c.clear(0, 0, 0, 0);
    // Cup bowl
    for (let y = 22; y <= 74; y++) {
      const u = (y - 22) / 52;
      const hw = 34 * Math.cos(u * Math.PI * 0.42);
      for (let x = Math.round(64 - hw); x <= Math.round(64 + hw); x++) {
        c.blendPixel(x, y, 255, 210, 25, 1);
      }
    }
    // Stem & Base
    for (let y = 74; y <= 96; y++) {
      for (let x = 57; x <= 71; x++) c.blendPixel(x, y, 220, 170, 15, 1);
    }
    for (let y = 96; y <= 110; y++) {
      for (let x = 36; x <= 92; x++) c.blendPixel(x, y, 255, 215, 0, 1);
    }
    c.drawSparkleStar(64, 44, 12, 255, 255, 255, 0.95);
    emojis.push({ name: 'mf_trophy', buffer: encodePNG(S, S, c.data), animated: false });
  }

  // --- 14. Static PNG Emoji: mf_cards (Blackjack Royal Ace) ---
  {
    const c = new RGBACanvas(S, S);
    c.clear(0, 0, 0, 0);
    // Back gold card
    for (let y = 18; y <= 104; y++) {
      for (let x = 44; x <= 106; x++) {
        c.blendPixel(x, y, 255, 200, 20, 1);
      }
    }
    // Front dark emerald-trimmed card
    for (let y = 24; y <= 112; y++) {
      for (let x = 22; x <= 86; x++) {
        const border = x < 26 || x > 82 || y < 28 || y > 108;
        c.blendPixel(x, y, border ? 46 : 14, border ? 255 : 22, border ? 165 : 36, 1);
      }
    }
    drawText(c, 'A', 54, 68, 6, 46, 255, 165, 1, 1);
    emojis.push({ name: 'mf_cards', buffer: encodePNG(S, S, c.data), animated: false });
  }

  return emojis;
}

export function generateCustomStickers(iconPng) {
  const S = 320;
  const stickers = [];

  // Sticker 1: Official Moonflip Glow Sticker
  {
    const c = new RGBACanvas(S, S);
    c.clear(0, 3, 17, 255);
    c.drawSoftCircle(160, 140, 140, 0, 220, 130, 0.25, true);
    c.blitFromSource(iconPng, 0, 0, 512, 512, 10, 10, 300, 300, {
      keyOutDarkBg: false,
      sheenPos: 0.45,
      sheenWidth: 0.2,
      sheenIntensity: 0.45,
    });
    c.drawSparkleStar(55, 65, 11, 46, 255, 165, 0.95);
    c.drawSparkleStar(265, 60, 11, 255, 220, 80, 0.95);
    stickers.push({
      name: 'Moonflip Official',
      tags: '🌙',
      description: 'Official Moonflip Crescent Moon & Flipping Coin Emblem',
      buffer: encodePNG(S, S, c.data),
    });
  }

  // Sticker 2: Nitro Booster VIP Crest
  {
    const c = new RGBACanvas(S, S);
    c.clear(10, 6, 22, 255);
    c.drawSoftCircle(160, 160, 145, 244, 127, 255, 0.28, true);
    c.blitFromSource(iconPng, 124, 90, 264, 228, 60, 24, 200, 174, {
      keyOutDarkBg: true,
      sheenPos: 0.5,
      sheenWidth: 0.22,
      sheenIntensity: 0.55,
    });
    drawText(c, 'NITRO BOOSTER', 160, 236, 3, 244, 127, 255, 1, 1);
    drawText(c, 'MOONFLIP VIP', 160, 272, 3, 46, 255, 165, 1, 1);
    c.drawSparkleStar(48, 85, 12, 244, 127, 255, 0.95);
    c.drawSparkleStar(272, 85, 12, 46, 255, 165, 0.95);
    stickers.push({
      name: 'Moonflip Nitro VIP',
      tags: '🚀',
      description: 'Moonflip Nitro Server Booster VIP Crest',
      buffer: encodePNG(S, S, c.data),
    });
  }

  // Sticker 3: To The Moon 1000X
  {
    const c = new RGBACanvas(S, S);
    c.clear(4, 10, 24, 255);
    c.drawSoftCircle(160, 140, 145, 46, 255, 165, 0.25, true);
    c.blitFromSource(iconPng, 124, 90, 264, 228, 60, 20, 200, 174, {
      keyOutDarkBg: true,
    });
    drawText(c, 'TO THE MOON', 160, 232, 3, 255, 255, 255, 1, 1);
    drawText(c, '1000X WIN!', 160, 272, 4, 46, 255, 165, 1, 1);
    stickers.push({
      name: 'To The Moon 1000X',
      tags: '🚀',
      description: 'To The Moon 1000X Multiplier Win',
      buffer: encodePNG(S, S, c.data),
    });
  }

  return stickers;
}
