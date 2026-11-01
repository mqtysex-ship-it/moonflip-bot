/**
 * Pure-JS Casino Animation Engine (GIF89a)
 * Generates smooth 25 FPS animated GIFs for Coinflip (3D parabolic coin toss)
 * and Las Vegas Slots (3-reel vertical scrolling cabinet with lever & lighting).
 * Zero external binary dependencies required.
 */

// ============================================================================
// 1. FAST GIF89a ENCODER (256-Color Palette + LZW Compression)
// ============================================================================

function buildPalette() {
  // 256 RGB colors [r, g, b]
  const pal = new Uint8Array(256 * 3);
  let idx = 0;

  const addColor = (r, g, b) => {
    if (idx >= 256) return idx - 1;
    pal[idx * 3] = r;
    pal[idx * 3 + 1] = g;
    pal[idx * 3 + 2] = b;
    return idx++;
  };

  // Fixed semantic colors (0..63)
  addColor(11, 14, 23);     // 0: Deepest night bg (#0b0e17)
  addColor(16, 20, 34);     // 1: Dark casino navy (#101422)
  addColor(22, 28, 46);     // 2: Mid navy panel (#161c2e)
  addColor(30, 39, 64);     // 3: Lighter navy border (#1e2740)
  addColor(10, 46, 36);     // 4: Deep felt green (#0a2e24)
  addColor(15, 68, 52);     // 5: Mid felt green (#0f4434)
  addColor(22, 92, 70);     // 6: Bright felt green (#165c46)
  addColor(6, 24, 18);      // 7: Felt shadow (#061812)

  // Golds & Yellows (8..19)
  addColor(92, 60, 10);     // 8: Darkest bronze/gold shadow
  addColor(138, 92, 16);    // 9: Deep gold rim
  addColor(184, 128, 24);   // 10: Rich gold
  addColor(218, 165, 32);   // 11: Goldenrod
  addColor(241, 196, 15);   // 12: Pure casino gold (#f1c40f)
  addColor(255, 215, 0);    // 13: Bright gold (#ffd700)
  addColor(255, 232, 90);   // 14: Light gold highlight
  addColor(255, 246, 170);  // 15: Specular gold gleam
  addColor(255, 255, 255);  // 16: Pure white
  addColor(220, 226, 238);  // 17: Silver light
  addColor(160, 172, 192);  // 18: Silver mid
  addColor(100, 112, 132);  // 19: Silver dark / steel

  // Reds, Oranges, Purples, Greens, Cyans (20..45)
  addColor(120, 18, 28);    // 20: Dark crimson
  addColor(180, 28, 40);    // 21: Casino red
  addColor(231, 76, 60);    // 22: Bright red (#e74c3c)
  addColor(255, 110, 95);   // 23: Light coral red
  addColor(230, 126, 34);   // 24: Orange (#e67e22)
  addColor(255, 165, 50);   // 25: Bright orange
  addColor(39, 174, 96);    // 26: Dark emerald
  addColor(46, 204, 113);   // 27: Emerald green (#2ecc71)
  addColor(115, 240, 165);  // 28: Mint highlight
  addColor(20, 110, 180);   // 29: Deep cyan/blue
  addColor(52, 152, 219);   // 30: Bright blue (#3498db)
  addColor(80, 210, 255);   // 31: Diamond cyan
  addColor(175, 242, 255);  // 32: Diamond ice highlight
  addColor(88, 44, 130);    // 33: Deep royal purple
  addColor(155, 89, 182);   // 34: Amethyst purple (#9b59b6)
  addColor(205, 140, 235);  // 35: Lavender highlight
  addColor(35, 38, 50);     // 36: Reel dark glass
  addColor(50, 56, 74);     // 37: Reel mid glass
  addColor(242, 245, 250);  // 38: Reel bright cream bg
  addColor(210, 216, 228);  // 39: Reel shaded cream
  addColor(165, 172, 188);  // 40: Reel deep shadow cream
  addColor(5, 7, 12);       // 41: Pure black shadow

  // Fill remaining slots with a 6x6x5 RGB cube for any blended color lookup
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 5; b++) {
        if (idx < 256) {
          addColor(Math.round((r * 255) / 5), Math.round((g * 255) / 5), Math.round((b * 255) / 4));
        }
      }
    }
  }
  while (idx < 256) addColor(0, 0, 0);
  return pal;
}

const GLOBAL_PALETTE = buildPalette();

// Color indices for fast drawing
export const C = {
  BG_DEEP: 0,
  BG_NAVY: 1,
  PANEL_NAVY: 2,
  BORDER_NAVY: 3,
  FELT_DARK: 4,
  FELT_MID: 5,
  FELT_LIGHT: 6,
  FELT_SHADOW: 7,
  GOLD_DARKEST: 8,
  GOLD_DEEP: 9,
  GOLD_RICH: 10,
  GOLD_ROD: 11,
  GOLD_PURE: 12,
  GOLD_BRIGHT: 13,
  GOLD_LIGHT: 14,
  GOLD_GLEAM: 15,
  WHITE: 16,
  SILVER_LIGHT: 17,
  SILVER_MID: 18,
  SILVER_DARK: 19,
  RED_DARK: 20,
  RED_MID: 21,
  RED_BRIGHT: 22,
  RED_LIGHT: 23,
  ORANGE: 24,
  ORANGE_BRIGHT: 25,
  GREEN_DARK: 26,
  GREEN_BRIGHT: 27,
  GREEN_LIGHT: 28,
  BLUE_DEEP: 29,
  BLUE_BRIGHT: 30,
  CYAN_DIAMOND: 31,
  CYAN_ICE: 32,
  PURPLE_DEEP: 33,
  PURPLE_MID: 34,
  PURPLE_LIGHT: 35,
  REEL_DARK: 36,
  REEL_MID: 37,
  REEL_BG: 38,
  REEL_SHADE1: 39,
  REEL_SHADE2: 40,
  BLACK: 41,
};

/**
 * LZW compress a single indexed pixel frame (Uint8Array of length width * height)
 */
function lzwEncode(indexStream) {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize; // 256
  const eoiCode = clearCode + 1;      // 257

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

  let codeSize = minCodeSize + 1; // 9
  let nextCode = eoiCode + 1;     // 258
  // Flat hash table for (prefix << 8) | suffix -> code
  const table = new Int32Array(4096 * 256);
  table.fill(-1);

  writeCode(clearCode, codeSize);

  if (indexStream.length === 0) {
    writeCode(eoiCode, codeSize);
    if (bitCount > 0) {
      subBlock.push(bitBuffer & 0xff);
    }
    flushSubBlock();
    return outBytes;
  }

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
        if (nextCode === (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
        nextCode++;
      } else {
        writeCode(clearCode, codeSize);
        table.fill(-1);
        codeSize = minCodeSize + 1;
        nextCode = eoiCode + 1;
      }
      prefix = k;
    }
  }

  writeCode(prefix, codeSize);
  writeCode(eoiCode, codeSize);

  if (bitCount > 0) {
    subBlock.push(bitBuffer & 0xff);
  }
  flushSubBlock();

  return outBytes;
}

/**
 * Encodes an array of frames [{ pixels: Uint8Array, delayCs: number }] into a GIF89a Buffer.
 * delayCs is in hundredths of a second (e.g. 4 = 40ms = 25fps).
 * loopCount: 0 = infinite loop, -1 = play once (no loop).
 */
export function encodeGIF(width, height, frames, loopCount = 0) {
  const bytes = [];
  const pushByte = (b) => bytes.push(b & 0xff);
  const pushShort = (s) => {
    bytes.push(s & 0xff);
    bytes.push((s >> 8) & 0xff);
  };
  const pushStr = (str) => {
    for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
  };

  // Header: GIF89a
  pushStr('GIF89a');

  // Logical Screen Descriptor
  pushShort(width);
  pushShort(height);
  pushByte(0xf7); // Global color table flag (1), color res (7), sort (0), size of GCT (7 -> 256 colors)
  pushByte(0);    // Background color index
  pushByte(0);    // Pixel aspect ratio

  // Global Color Table (768 bytes)
  for (let i = 0; i < GLOBAL_PALETTE.length; i++) {
    pushByte(GLOBAL_PALETTE[i]);
  }

  // Netscape 2.0 Application Extension for looping (if loopCount >= 0)
  if (loopCount >= 0) {
    pushByte(0x21);
    pushByte(0xff);
    pushByte(0x0b);
    pushStr('NETSCAPE2.0');
    pushByte(0x03);
    pushByte(0x01);
    pushShort(loopCount);
    pushByte(0x00);
  }

  // Frames
  for (const frame of frames) {
    // Graphic Control Extension
    pushByte(0x21);
    pushByte(0xf9);
    pushByte(0x04);
    pushByte(0x04); // Disposal method 1 (Do not dispose / overwrite)
    pushShort(frame.delayCs || 4);
    pushByte(0x00); // No transparent color
    pushByte(0x00); // Block terminator

    // Image Descriptor
    pushByte(0x2c);
    pushShort(0);
    pushShort(0);
    pushShort(width);
    pushShort(height);
    pushByte(0x00); // No local color table

    // LZW Minimum Code Size
    pushByte(8);
    const compressed = lzwEncode(frame.pixels);
    for (let i = 0; i < compressed.length; i++) {
      bytes.push(compressed[i]);
    }
    pushByte(0x00); // Block terminator
  }

  // Trailer
  pushByte(0x3b);

  return Buffer.from(bytes);
}

// ============================================================================
// 2. 2D / 3D PIXEL CANVAS DRAWING PRIMITIVES & BITMAP FONT
// ============================================================================

const FONT_5X7 = {
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  'J': ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '10001', '00001', '00010', '00100', '00100', '00100'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  'x': ['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '★': ['00100', '00100', '11111', '01110', '01110', '10001', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  ',': ['00000', '00000', '00000', '00000', '00000', '00100', '01000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '•': ['00000', '00000', '00100', '01110', '00100', '00000', '00000'],
};

class PixelCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height);
  }

  clear(color) {
    this.pixels.fill(color);
  }

  setPixel(x, y, color) {
    const ix = x | 0;
    const iy = y | 0;
    if (ix >= 0 && ix < this.width && iy >= 0 && iy < this.height) {
      this.pixels[iy * this.width + ix] = color;
    }
  }

  fillRect(x, y, w, h, color) {
    const x0 = Math.max(0, x | 0);
    const y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.width, (x + w) | 0);
    const y1 = Math.min(this.height, (y + h) | 0);
    for (let py = y0; py < y1; py++) {
      const rowOff = py * this.width;
      for (let px = x0; px < x1; px++) {
        this.pixels[rowOff + px] = color;
      }
    }
  }

  fillRoundedRect(x, y, w, h, r, color) {
    const x0 = x | 0;
    const y0 = y | 0;
    const x1 = (x + w) | 0;
    const y1 = (y + h) | 0;
    const rad = Math.min(r | 0, (w / 2) | 0, (h / 2) | 0);
    const radSq = rad * rad;

    for (let py = y0; py < y1; py++) {
      if (py < 0 || py >= this.height) continue;
      for (let px = x0; px < x1; px++) {
        if (px < 0 || px >= this.width) continue;
        let dx = 0;
        let dy = 0;
        if (px < x0 + rad) dx = x0 + rad - px;
        else if (px >= x1 - rad) dx = px - (x1 - rad - 1);
        if (py < y0 + rad) dy = y0 + rad - py;
        else if (py >= y1 - rad) dy = py - (y1 - rad - 1);
        if (dx * dx + dy * dy <= radSq) {
          this.pixels[py * this.width + px] = color;
        }
      }
    }
  }

  strokeRoundedRect(x, y, w, h, r, thickness, color) {
    const x0 = x | 0;
    const y0 = y | 0;
    const x1 = (x + w) | 0;
    const y1 = (y + h) | 0;
    const rad = Math.min(r | 0, (w / 2) | 0, (h / 2) | 0);
    const outerSq = rad * rad;
    const innerRad = Math.max(0, rad - thickness);
    const innerSq = innerRad * innerRad;

    for (let py = y0; py < y1; py++) {
      if (py < 0 || py >= this.height) continue;
      for (let px = x0; px < x1; px++) {
        if (px < 0 || px >= this.width) continue;
        let dx = 0;
        let dy = 0;
        if (px < x0 + rad) dx = x0 + rad - px;
        else if (px >= x1 - rad) dx = px - (x1 - rad - 1);
        if (py < y0 + rad) dy = y0 + rad - py;
        else if (py >= y1 - rad) dy = py - (y1 - rad - 1);
        const distSq = dx * dx + dy * dy;
        if (distSq <= outerSq) {
          const inInnerX = px >= x0 + thickness && px < x1 - thickness;
          const inInnerY = py >= y0 + thickness && py < y1 - thickness;
          if (!inInnerX || !inInnerY || (dx > 0 && dy > 0 && distSq >= innerSq)) {
            this.pixels[py * this.width + px] = color;
          }
        }
      }
    }
  }

  fillEllipse(cx, cy, rx, ry, color) {
    if (rx <= 0 || ry <= 0) return;
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + ry));
    const invRx2 = 1 / (rx * rx);
    const invRy2 = 1 / (ry * ry);

    for (let py = y0; py <= y1; py++) {
      const dy = py - cy;
      const dyTerm = dy * dy * invRy2;
      const rowOff = py * this.width;
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        if (dx * dx * invRx2 + dyTerm <= 1.0) {
          this.pixels[rowOff + px] = color;
        }
      }
    }
  }

  strokeEllipse(cx, cy, rx, ry, thickness, color) {
    if (rx <= 0 || ry <= 0) return;
    const x0 = Math.max(0, Math.floor(cx - rx - thickness));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + rx + thickness));
    const y0 = Math.max(0, Math.floor(cy - ry - thickness));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + ry + thickness));
    const irx = Math.max(0.5, rx - thickness);
    const iry = Math.max(0.5, ry - thickness);

    for (let py = y0; py <= y1; py++) {
      const dy = py - cy;
      const rowOff = py * this.width;
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        const dOuter = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        const dInner = (dx * dx) / (irx * irx) + (dy * dy) / (iry * iry);
        if (dOuter <= 1.0 && dInner >= 1.0) {
          this.pixels[rowOff + px] = color;
        }
      }
    }
  }

  drawStarSparkle(cx, cy, size, color, coreColor = C.WHITE) {
    const ix = cx | 0;
    const iy = cy | 0;
    const s = size | 0;
    for (let d = -s; d <= s; d++) {
      this.setPixel(ix + d, iy, color);
      this.setPixel(ix, iy + d, color);
      if (Math.abs(d) <= s / 2) {
        this.setPixel(ix + d, iy - 1, color);
        this.setPixel(ix + d, iy + 1, color);
        this.setPixel(ix - 1, iy + d, color);
        this.setPixel(ix + 1, iy + d, color);
      }
    }
    const diag = Math.max(1, (s * 0.55) | 0);
    for (let d = -diag; d <= diag; d++) {
      this.setPixel(ix + d, iy + d, color);
      this.setPixel(ix + d, iy - d, color);
    }
    this.fillRect(ix - 1, iy - 1, 3, 3, coreColor);
  }

  drawText(text, cx, y, scale, color, shadowColor = null) {
    const str = String(text).toUpperCase();
    const charW = 5 * scale;
    const gap = 1 * scale;
    const totalW = str.length * charW + Math.max(0, str.length - 1) * gap;
    let startX = Math.round(cx - totalW / 2);

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const glyph = FONT_5X7[ch] || FONT_5X7[' '];
      for (let row = 0; row < 7; row++) {
        const line = glyph[row];
        for (let col = 0; col < 5; col++) {
          if (line[col] === '1') {
            const px = startX + col * scale;
            const py = (y | 0) + row * scale;
            if (shadowColor !== null) {
              this.fillRect(px + scale, py + scale, scale, scale, shadowColor);
            }
            this.fillRect(px, py, scale, scale, color);
          }
        }
      }
      startX += charW + gap;
    }
  }
}

// ============================================================================
// 3. 3D COINFLIP ANIMATION GENERATOR
// ============================================================================

const COIN_GIF_CACHE = new Map();

/**
 * Draws a 3D metallic coin at (cx, cy) with horizontal radius rx, pitch angle theta,
 * and roll tilt. Renders full 3D cylindrical rim with milled ridges, face shading,
 * specular highlight sweep, and embossed Crown (Heads) or Eagle (Tails) emblem.
 */
function draw3DCoin(canvas, cx, cy, radius, theta, forceFace = null) {
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const absCos = Math.abs(cosT);
  const ry = Math.max(2, radius * absCos);
  const thickness = Math.max(3, Math.round(10 * Math.abs(sinT) + 3));

  // Determine which face is visible: cosT >= 0 -> 'heads', cosT < 0 -> 'tails'
  const face = forceFace || (cosT >= 0 ? 'heads' : 'tails');
  const rimDir = sinT >= 0 ? 1 : -1;

  // 1. Draw 3D Cylindrical Milled Rim (extruded behind the coin face)
  const steps = thickness;
  for (let s = steps; s >= 1; s--) {
    const oy = cy + s * rimDir;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(canvas.width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(oy - ry));
    const y1 = Math.min(canvas.height - 1, Math.ceil(oy + ry));
    const invRx2 = 1 / (radius * radius);
    const invRy2 = 1 / (ry * ry);

    for (let py = y0; py <= y1; py++) {
      const dy = py - oy;
      const dyTerm = dy * dy * invRy2;
      const rowOff = py * canvas.width;
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        if (dx * dx * invRx2 + dyTerm <= 1.0) {
          // Milled coin edge ridges based on x coordinate
          const ridge = ((px + Math.round(theta * 6)) % 4 === 0);
          const normX = dx / radius;
          let rimCol = C.GOLD_DEEP;
          if (normX > -0.35 && normX < 0.25) {
            rimCol = ridge ? C.GOLD_PURE : C.GOLD_BRIGHT;
          } else if (normX < -0.6 || normX > 0.65) {
            rimCol = C.GOLD_DARKEST;
          } else {
            rimCol = ridge ? C.GOLD_DARKEST : C.GOLD_RICH;
          }
          canvas.pixels[rowOff + px] = rimCol;
        }
      }
    }
  }

  // If the coin is nearly edge-on (absCos < 0.14), draw an intense golden edge glint!
  if (absCos < 0.14) {
    canvas.fillEllipse(cx, cy, radius, ry + 2, C.GOLD_LIGHT);
    canvas.drawStarSparkle(cx - radius * 0.3, cy, 9, C.GOLD_GLEAM, C.WHITE);
    canvas.drawStarSparkle(cx + radius * 0.4, cy, 6, C.GOLD_BRIGHT, C.WHITE);
    return;
  }

  // 2. Draw Main Coin Face with Specular Lighting Sweep
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(canvas.width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(canvas.height - 1, Math.ceil(cy + ry));
  const invRx2 = 1 / (radius * radius);
  const invRy2 = 1 / (ry * ry);
  const innerRx2 = 1 / ((radius * 0.82) * (radius * 0.82));
  const innerRy2 = 1 / ((ry * 0.82) * (ry * 0.82));

  // Specular highlight position sweeps across the coin as it tilts
  const specOffset = Math.sin(theta * 2) * 0.45;

  for (let py = y0; py <= y1; py++) {
    const dy = (py - cy) / ry;
    const dyPx = py - cy;
    const rowOff = py * canvas.width;
    for (let px = x0; px <= x1; px++) {
      const dxPx = px - cx;
      const dOuter = dxPx * dxPx * invRx2 + dyPx * dyPx * invRy2;
      if (dOuter <= 1.0) {
        const dx = dxPx / radius;
        const dInner = dxPx * dxPx * innerRx2 + dyPx * dyPx * innerRy2;
        const sheenDist = Math.abs(dx * 0.7 + dy * 0.7 - specOffset);

        let col;
        if (dOuter > 0.88) {
          // Outer bevel rim
          col = sheenDist < 0.22 ? C.GOLD_GLEAM : (dx + dy < 0 ? C.GOLD_LIGHT : C.GOLD_DEEP);
        } else if (dInner > 0.90 && dInner <= 1.0) {
          // Inner decorative ring
          col = C.GOLD_DEEP;
        } else {
          // Inner recessed coin field
          if (face === 'heads') {
            if (sheenDist < 0.14) col = C.GOLD_GLEAM;
            else if (sheenDist < 0.30) col = C.GOLD_LIGHT;
            else if (dx + dy < 0.2) col = C.GOLD_BRIGHT;
            else col = C.GOLD_PURE;
          } else {
            // Tails has a warm royal gold + platinum contrast
            if (sheenDist < 0.14) col = C.WHITE;
            else if (sheenDist < 0.30) col = C.GOLD_GLEAM;
            else if (dx + dy < 0.2) col = C.GOLD_LIGHT;
            else col = C.GOLD_ROD;
          }
        }
        canvas.pixels[rowOff + px] = col;
      }
    }
  }

  // 3. Draw Embossed Center Emblem (scaled vertically by absCos)
  if (absCos > 0.22) {
    const sy = absCos;
    if (face === 'heads') {
      // Royal Crown Emblem for HEADS
      const baseW = Math.round(radius * 0.48);
      const crownH = Math.max(2, Math.round(radius * 0.36 * sy));
      const baseY = Math.round(cy + crownH * 0.45);
      const topY = Math.round(cy - crownH * 0.55);

      // Crown shadow & body
      for (let py = topY; py <= baseY; py++) {
        const t = (py - topY) / Math.max(1, baseY - topY); // 0 at top, 1 at base
        for (let px = Math.round(cx - baseW); px <= Math.round(cx + baseW); px++) {
          const nx = (px - cx) / baseW; // -1..1
          // 3-peak crown silhouette: center peak at nx=0, side peaks at nx=-0.85, +0.85
          const peak0 = 1 - Math.abs(nx) * 1.9;
          const peakL = 0.85 - Math.abs(nx + 0.72) * 2.1;
          const peakR = 0.85 - Math.abs(nx - 0.72) * 2.1;
          const heightAtX = Math.max(0.28, peak0, peakL, peakR);
          if (1 - t <= heightAtX) {
            canvas.setPixel(px + 1, py + 1, C.GOLD_DARKEST);
            canvas.setPixel(px, py, t > 0.78 ? C.RED_BRIGHT : C.WHITE);
          }
        }
      }
      // Crown jewels
      if (absCos > 0.45) {
        canvas.fillRect(cx - 2, topY - 2, 4, Math.max(2, Math.round(4 * sy)), C.CYAN_DIAMOND);
        canvas.fillRect(cx - Math.round(baseW * 0.72) - 1, topY + Math.round(2 * sy), 3, Math.max(2, Math.round(3 * sy)), C.RED_BRIGHT);
        canvas.fillRect(cx + Math.round(baseW * 0.72) - 1, topY + Math.round(2 * sy), 3, Math.max(2, Math.round(3 * sy)), C.RED_BRIGHT);
      }
    } else {
      // Royal Eagle / Winged Crest Emblem for TAILS
      const wingW = Math.round(radius * 0.55);
      const wingH = Math.max(2, Math.round(radius * 0.42 * sy));
      for (let py = Math.round(cy - wingH); py <= Math.round(cy + wingH); py++) {
        const ny = (py - cy) / Math.max(1, wingH); // -1..1
        for (let px = Math.round(cx - wingW); px <= Math.round(cx + wingW); px++) {
          const ax = Math.abs(px - cx) / wingW; // 0..1
          // Swept wings + center shield/tail
          const wingTop = -0.75 * ax - 0.15 * (1 - ax);
          const wingBot = 0.65 * (1 - ax * 0.75);
          const inBody = ax < 0.24 && ny > -0.65 && ny < 0.85;
          const inWings = ny >= wingTop && ny <= wingBot && (ny < 0.35 || ax < 0.5);
          if (inBody || inWings) {
            canvas.setPixel(px + 1, py + 1, C.GOLD_DARKEST);
            canvas.setPixel(px, py, ax < 0.18 && Math.abs(ny) < 0.35 ? C.GOLD_BRIGHT : C.WHITE);
          }
        }
      }
    }
  }
}

/**
 * Generates (and caches) a 25 FPS 3D Coinflip GIF Buffer for ('heads' | 'tails').
 */
export function getCoinflipAnimationGif(outcome = 'heads') {
  const key = outcome.toLowerCase();
  if (COIN_GIF_CACHE.has(key)) {
    return COIN_GIF_CACHE.get(key);
  }

  const width = 380;
  const height = 230;
  const frames = [];
  const totalFrames = 34;

  // Target final angle so that cos(theta) = +1 for heads (2*PI*k) or -1 for tails (2*PI*k + PI)
  // 5 full rotations in the air!
  const finalTheta = key === 'heads' ? Math.PI * 10 : Math.PI * 11;

  // Deterministic sparkle particles
  const sparkles = [
    { x: 135, y: 65, phase: 0 },
    { x: 245, y: 58, phase: 2 },
    { x: 115, y: 115, phase: 4 },
    { x: 265, y: 110, phase: 6 },
    { x: 155, y: 42, phase: 1 },
    { x: 225, y: 45, phase: 5 },
  ];

  for (let f = 0; f < totalFrames; f++) {
    const canvas = new PixelCanvas(width, height);
    const t = f / (totalFrames - 1); // 0.0 -> 1.0

    // 1. Background: Deep Luxury Casino Arena + Velvet Felt Table at bottom
    canvas.clear(C.BG_DEEP);
    canvas.fillRect(0, 0, width, 30, C.BG_NAVY);

    // Subtle radial spotlight in the air chamber
    canvas.fillEllipse(width / 2, 95, 145, 75, C.BG_NAVY);
    canvas.fillEllipse(width / 2, 95, 100, 52, C.PANEL_NAVY);

    // Velvet Casino Felt Table at bottom (y = 148..230)
    canvas.fillEllipse(width / 2, 195, 220, 56, C.FELT_DARK);
    canvas.fillEllipse(width / 2, 198, 195, 48, C.FELT_MID);
    canvas.strokeEllipse(width / 2, 195, 210, 52, 2, C.GOLD_RICH);

    // Outer Gold Frame Border
    canvas.strokeRoundedRect(3, 3, width - 6, height - 6, 8, 2, C.GOLD_RICH);

    // Top Header Bar
    canvas.drawText('★ MOONFLIP 3D COINFLIP • 1.98X ★', width / 2, 10, 1, C.GOLD_LIGHT, C.BLACK);

    // 2. Compute Coin Physics (Altitude y, Radius r, 3D Pitch Angle theta)
    let coinY = 152;
    let coinRadius = 36;
    let theta = 0;
    let shadowRx = 36;
    let shadowRy = 10;

    if (f <= 20) {
      // Phase A (Frames 0..20): Launch into the air -> Apex -> Plunge to Table!
      const p = f / 20; // 0..1
      // Parabolic flight arc: y goes from 152 up to 54 at apex (p=0.5), then down to 152 at p=1.0
      const arc = 4 * p * (1 - p); // 0 -> 1 -> 0
      coinY = Math.round(152 - arc * 98);
      // Perspective scale: larger at apex as it arcs toward camera
      coinRadius = Math.round(34 + arc * 10);
      // Rapid 3D rotation in the air (5 full flips!)
      theta = p * (finalTheta - Math.PI * 1.15);
      // Shadow on table shrinks when coin is high in the air
      shadowRx = Math.round(38 * (1 - arc * 0.6));
      shadowRy = Math.round(10 * (1 - arc * 0.6));

      // Rotational air-vortex rings & motion streaks around the spinning coin
      if (p > 0.08 && p < 0.92) {
        canvas.strokeEllipse(width / 2, coinY, coinRadius + 10, Math.max(8, coinRadius * 0.45), 1, C.GOLD_DEEP);
        const trailDir = p < 0.5 ? 1 : -1;
        for (let tr = 1; tr <= 3; tr++) {
          const ty = coinY + trailDir * tr * 13;
          if (ty > 36 && ty < 162) {
            canvas.fillEllipse(width / 2, ty, Math.max(4, 18 - tr * 4), 2, tr === 1 ? C.GOLD_PURE : C.GOLD_DEEP);
          }
        }
      }
    } else if (f <= 26) {
      // Phase B (Frames 21..26): Table Impact Bounce & Rapid Rim Wobble!
      const bp = (f - 20) / 6; // 0..1
      const bounceArc = Math.sin(bp * Math.PI);
      coinY = Math.round(152 - bounceArc * 24);
      coinRadius = 37;
      theta = (finalTheta - Math.PI * 1.15) + bp * (Math.PI * 1.15);
      shadowRx = Math.round(36 - bounceArc * 8);
      shadowRy = Math.round(10 - bounceArc * 3);

      // Expanding golden shockwave rings on the felt table!
      const ringRx = Math.round(40 + bp * 62);
      const ringRy = Math.round(11 + bp * 16);
      canvas.strokeEllipse(width / 2, 162, ringRx, ringRy, 2, bp < 0.5 ? C.GOLD_GLEAM : C.GOLD_PURE);
      canvas.strokeEllipse(width / 2, 162, Math.max(10, ringRx - 16), Math.max(4, ringRy - 4), 1, C.GOLD_RICH);
    } else {
      // Phase C (Frames 27..33): Settled Showcase & Victory Glow!
      const sp = (f - 27) / Math.max(1, totalFrames - 1 - 27);
      coinY = 104;
      coinRadius = 46;
      theta = finalTheta; // Flat face showcase!
      shadowRx = 44;
      shadowRy = 11;

      // Radial victory aura behind settled coin
      const auraR = Math.round(52 + sp * 14);
      canvas.strokeEllipse(width / 2, coinY, auraR, auraR, 2, C.GOLD_PURE);
      canvas.strokeEllipse(width / 2, coinY, auraR + 9, auraR + 9, 1, C.GOLD_DEEP);
    }

    // 3. Draw Drop Shadow on the Velvet Felt Table
    canvas.fillEllipse(width / 2, 165, shadowRx, shadowRy, C.FELT_SHADOW);

    // 4. Draw Floating Sparkles in the Air
    for (let i = 0; i < sparkles.length; i++) {
      const sp = sparkles[i];
      if ((f + sp.phase) % 4 < 2) {
        const sy = sp.y + Math.round(Math.sin(f * 0.4 + i) * 6);
        canvas.drawStarSparkle(sp.x, sy, f >= 27 ? 6 : 4, C.GOLD_BRIGHT, C.WHITE);
      }
    }

    // 5. Draw the 3D Spinning Coin
    draw3DCoin(canvas, width / 2, coinY, coinRadius, theta, f >= 27 ? key : null);

    // 6. Draw Altitude Telemetry Bar on Left & RPM HUD on Right
    const altBarX = 18;
    const altBarY = 42;
    const altBarH = 124;
    canvas.fillRoundedRect(altBarX, altBarY, 8, altBarH, 3, C.BG_NAVY);
    canvas.strokeRoundedRect(altBarX, altBarY, 8, altBarH, 3, 1, C.BORDER_NAVY);
    const normAlt = Math.max(0, Math.min(1, (152 - coinY) / 98));
    const fillH = Math.round(normAlt * (altBarH - 4));
    if (fillH > 0) {
      canvas.fillRect(altBarX + 2, altBarY + altBarH - 2 - fillH, 4, fillH, C.GOLD_PURE);
    }
    canvas.drawText('ALT', altBarX + 4, altBarY + altBarH + 5, 1, C.GOLD_LIGHT);

    // 7. Bottom Status / Final Outcome Banner
    if (f < 21) {
      const statusTxt = f < 7 ? 'LAUNCHING UPWARD...' : f < 15 ? 'APEX 3D GYRO SPIN!' : 'PLUNGING TO TABLE...';
      canvas.fillRoundedRect(90, 192, 200, 24, 6, C.BG_NAVY);
      canvas.strokeRoundedRect(90, 192, 200, 24, 6, 1, C.GOLD_RICH);
      canvas.drawText(statusTxt, width / 2, 200, 1, C.GOLD_GLEAM, C.BLACK);
    } else if (f < 27) {
      canvas.fillRoundedRect(90, 192, 200, 24, 6, C.BG_NAVY);
      canvas.strokeRoundedRect(90, 192, 200, 24, 6, 1, C.ORANGE_BRIGHT);
      canvas.drawText('CLATTER! RIM WOBBLE...', width / 2, 200, 1, C.ORANGE_BRIGHT, C.BLACK);
    } else {
      const bannerW = 228;
      const bannerX = (width - bannerW) / 2;
      const bannerCol = key === 'heads' ? C.GOLD_PURE : C.BLUE_BRIGHT;
      canvas.fillRoundedRect(bannerX, 184, bannerW, 32, 6, C.BG_NAVY);
      canvas.strokeRoundedRect(bannerX, 184, bannerW, 32, 6, 2, bannerCol);
      const label = key === 'heads' ? '★ LANDED: HEADS ★' : '★ LANDED: TAILS ★';
      canvas.drawText(label, width / 2, 193, 2, C.WHITE, C.BLACK);
    }

    // Frame delay: 5cs (50ms = 20fps) during flight, and 300cs (3 seconds) on the final frame
    const delayCs = f === totalFrames - 1 ? 300 : 5;
    frames.push({ pixels: canvas.pixels, delayCs });
  }

  // Place the settled Hero Showcase Frame at Frame 0 so paused [GIF] state shows the Hero Showcase!
  frames.unshift({ pixels: frames[frames.length - 1].pixels, delayCs: 120 });

  const gifBuffer = encodeGIF(width, height, frames, 0);
  COIN_GIF_CACHE.set(key, gifBuffer);
  return gifBuffer;
}

// ============================================================================
// 4. LAS VEGAS SLOTS 3-REEL ANIMATION GENERATOR
// ============================================================================

const SYMBOL_ORDER = ['💎', '7️⃣', '🔔', '🍇', '🍒', '🍋'];

/**
 * Draws a crisp vector/pixel-art casino slot symbol centered at (cx, cy).
 */
function drawSlotSymbolSprite(canvas, symbol, cx, cy, clipY0, clipY1) {
  const ix = cx | 0;
  const iy = cy | 0;
  if (iy + 18 < clipY0 || iy - 18 > clipY1) return;

  const setClipped = (x, y, col) => {
    if (y >= clipY0 && y < clipY1) canvas.setPixel(x, y, col);
  };

  const fillRectClipped = (x, y, w, h, col) => {
    const y0 = Math.max(clipY0, y | 0);
    const y1 = Math.min(clipY1, (y + h) | 0);
    for (let py = y0; py < y1; py++) {
      for (let px = x | 0; px < (x + w) | 0; px++) {
        canvas.setPixel(px, py, col);
      }
    }
  };

  if (symbol === '💎') {
    // Faceted Cyan Diamond
    for (let dy = -13; dy <= 14; dy++) {
      let halfW = 0;
      if (dy < -5) halfW = Math.round(((dy + 13) / 8) * 15);
      else halfW = Math.round(((14 - dy) / 19) * 15);
      for (let dx = -halfW; dx <= halfW; dx++) {
        let col = C.CYAN_DIAMOND;
        if (dy < -5) col = Math.abs(dx) < 5 ? C.WHITE : C.CYAN_ICE;
        else if (dx < -halfW * 0.35) col = C.CYAN_ICE;
        else if (dx > halfW * 0.35) col = C.BLUE_DEEP;
        else if ((dx + dy) % 7 === 0) col = C.WHITE;
        setClipped(ix + dx, iy + dy, col);
      }
    }
  } else if (symbol === '7️⃣') {
    // Bold Casino Lucky 7 (Red + Gold trim)
    fillRectClipped(ix - 12, iy - 13, 25, 7, C.GOLD_DARKEST);
    fillRectClipped(ix - 13, iy - 14, 25, 7, C.GOLD_PURE);
    fillRectClipped(ix - 11, iy - 12, 21, 4, C.RED_BRIGHT);
    for (let dy = -7; dy <= 13; dy++) {
      const shift = Math.round(((dy + 7) / 20) * 10);
      const sx = ix + 6 - shift;
      for (let dx = -4; dx <= 4; dx++) {
        setClipped(sx + dx + 1, iy + dy + 1, C.GOLD_DARKEST);
        setClipped(sx + dx, iy + dy, Math.abs(dx) === 4 ? C.GOLD_PURE : C.RED_BRIGHT);
      }
    }
  } else if (symbol === '🔔') {
    // Golden Liberty Bell
    for (let dy = -12; dy <= 9; dy++) {
      const t = (dy + 12) / 21; // 0..1
      const halfW = Math.round(4 + t * t * 11);
      for (let dx = -halfW; dx <= halfW; dx++) {
        let col = C.GOLD_PURE;
        if (dx < -halfW * 0.4) col = C.GOLD_GLEAM;
        else if (dx > halfW * 0.45) col = C.GOLD_DEEP;
        if (dy >= 6) col = C.GOLD_BRIGHT;
        setClipped(ix + dx, iy + dy, col);
      }
    }
    // Bell top loop & bottom clapper
    fillRectClipped(ix - 2, iy - 15, 5, 3, C.GOLD_RICH);
    fillRectClipped(ix - 3, iy + 10, 6, 4, C.GOLD_DEEP);
  } else if (symbol === '🍇') {
    // Cluster of Royal Purple Grapes + Green Leaf
    fillRectClipped(ix - 3, iy - 14, 7, 4, C.GREEN_BRIGHT);
    const spheres = [
      [-6, -6], [0, -6], [6, -6],
      [-4, 0], [3, 0],
      [0, 6],
    ];
    for (const [gx, gy] of spheres) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          if (dx * dx + dy * dy <= 18) {
            const c = (dx < -1 && dy < -1) ? C.PURPLE_LIGHT : (dx > 1 || dy > 1 ? C.PURPLE_DEEP : C.PURPLE_MID);
            setClipped(ix + gx + dx, iy + gy + dy, c);
          }
        }
      }
    }
  } else if (symbol === '🍒') {
    // Twin Glossy Ruby Cherries + Green Stems
    fillRectClipped(ix - 1, iy - 13, 6, 3, C.GREEN_BRIGHT);
    for (let s = 0; s < 14; s++) {
      setClipped(ix - Math.round(s * 0.5), iy - 12 + s, C.GREEN_DARK);
      setClipped(ix + Math.round(s * 0.45), iy - 12 + s, C.GREEN_DARK);
    }
    const centers = [[-6, 5], [6, 6]];
    for (const [cxOff, cyOff] of centers) {
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          if (dx * dx + dy * dy <= 34) {
            let c = C.RED_BRIGHT;
            if (dx < -1 && dy < -1) c = C.WHITE;
            else if (dx > 2 || dy > 2) c = C.RED_DARK;
            setClipped(ix + cxOff + dx, iy + cyOff + dy, c);
          }
        }
      }
    }
  } else {
    // Golden Lemon ('🍋')
    for (let dy = -9; dy <= 9; dy++) {
      for (let dx = -12; dx <= 12; dx++) {
        if ((dx * dx) / 144 + (dy * dy) / 81 <= 1.0) {
          let c = C.GOLD_BRIGHT;
          if (dx < -3 && dy < -2) c = C.GOLD_GLEAM;
          else if (dx > 4 || dy > 4) c = C.GOLD_ROD;
          setClipped(ix + dx, iy + dy, c);
        }
      }
    }
  }
}

/**
 * Generates an animated 25 FPS Slot Machine GIF for a specific spin result.
 * @param {string[]} r1 - [top, center, bottom] for Reel 1
 * @param {string[]} r2 - [top, center, bottom] for Reel 2
 * @param {string[]} r3 - [top, center, bottom] for Reel 3
 * @param {object} result - { reels, multiplier, matches, symbolName }
 */
export function generateSlotsAnimationGif(r1, r2, r3, result) {
  const width = 390;
  const height = 235;
  const frames = [];
  const isSuspense = r1[1] === r2[1];
  const totalFrames = isSuspense ? 38 : 32;

  const lockFrame1 = 12;
  const lockFrame2 = 20;
  const lockFrame3 = isSuspense ? 31 : 26;

  const reelTargets = [r1, r2, r3];
  const reelXPositions = [52, 150, 248];
  const reelW = 82;
  const reelY = 44;
  const reelH = 132;
  const cellH = 44; // 3 visible rows * 44px = 132px

  for (let f = 0; f < totalFrames; f++) {
    const canvas = new PixelCanvas(width, height);
    const allLocked = f >= lockFrame3;
    const isWin = result.multiplier > 0;
    const isJackpot = result.matches === 3;

    // 1. Background & Luxury Slot Machine Cabinet Body
    canvas.clear(C.BG_DEEP);

    // Outer Cabinet Frame
    const cabX = 24;
    const cabY = 8;
    const cabW = 326;
    const cabH = 218;
    canvas.fillRoundedRect(cabX, cabY, cabW, cabH, 12, C.BG_NAVY);
    const cabBorderCol = allLocked && isJackpot
      ? (f % 2 === 0 ? C.GOLD_GLEAM : C.GOLD_PURE)
      : (f >= lockFrame2 && !allLocked && isSuspense)
      ? (f % 2 === 0 ? C.ORANGE_BRIGHT : C.RED_BRIGHT)
      : C.GOLD_RICH;
    canvas.strokeRoundedRect(cabX, cabY, cabW, cabH, 12, 3, cabBorderCol);
    canvas.strokeRoundedRect(cabX + 5, cabY + 5, cabW - 10, cabH - 10, 9, 1, C.BORDER_NAVY);

    // Chasing Marquee Light Bulbs around the Cabinet Perimeter
    for (let bx = cabX + 14; bx <= cabX + cabW - 14; bx += 22) {
      const onTop = ((bx / 22 + f) | 0) % 2 === 0;
      canvas.fillEllipse(bx, cabY + 4, 3, 3, onTop ? C.GOLD_GLEAM : C.RED_BRIGHT);
      canvas.fillEllipse(bx, cabY + cabH - 4, 3, 3, !onTop ? C.GOLD_GLEAM : C.RED_BRIGHT);
    }

    // 2. Mechanical Slot Lever on the Right Side (x = 350..378)
    const leverPull = f < 8 ? Math.sin((f / 8) * Math.PI) : 0; // 0 -> 1 -> 0
    const knobY = Math.round(52 + leverPull * 78);
    // Lever mount box
    canvas.fillRoundedRect(cabX + cabW, 118, 12, 34, 3, C.GOLD_DEEP);
    // Lever chrome arm
    const armTopY = Math.min(knobY, 132);
    const armBotY = Math.max(knobY, 132);
    canvas.fillRect(365, armTopY, 5, armBotY - armTopY + 4, C.SILVER_LIGHT);
    canvas.fillRect(368, armTopY, 2, armBotY - armTopY + 4, C.SILVER_DARK);
    // Glossy Red Lever Ball Handle
    canvas.fillEllipse(367, knobY, 11, 11, C.RED_BRIGHT);
    canvas.fillEllipse(364, knobY - 3, 4, 4, C.WHITE);

    // 3. Top Marquee Title Banner
    let marqueeTitle = '★ MOONFLIP VEGAS SLOTS ★';
    let marqueeCol = C.GOLD_GLEAM;
    if (allLocked) {
      if (isJackpot) {
        marqueeTitle = `★ MOONFLIP JACKPOT ${result.multiplier}X! ★`;
        marqueeCol = f % 2 === 0 ? C.WHITE : C.GOLD_GLEAM;
      } else if (isWin) {
        marqueeTitle = `★ MOONFLIP WINNER +${result.multiplier}X! ★`;
        marqueeCol = C.GREEN_LIGHT;
      } else {
        marqueeTitle = 'ROUND COMPLETE';
        marqueeCol = C.SILVER_LIGHT;
      }
    } else if (f >= lockFrame2 && isSuspense) {
      marqueeTitle = '★ JACKPOT SUSPENSE! ★';
      marqueeCol = f % 2 === 0 ? C.ORANGE_BRIGHT : C.GOLD_GLEAM;
    }
    canvas.drawText(marqueeTitle, cabX + cabW / 2, 19, 1, marqueeCol, C.BLACK);

    // 4. Render the 3 Reel Windows
    const lockFrames = [lockFrame1, lockFrame2, lockFrame3];

    for (let r = 0; r < 3; r++) {
      const rx = reelXPositions[r];
      const ry = reelY;
      const isLocked = f >= lockFrames[r];
      const justLocked = f === lockFrames[r] || f === lockFrames[r] + 1;

      // Reel Window Background with cylindrical top/bottom shading
      canvas.fillRoundedRect(rx, ry, reelW, reelH, 6, C.REEL_BG);
      canvas.fillRect(rx + 2, ry + 2, reelW - 4, 24, C.REEL_SHADE2);
      canvas.fillRect(rx + 2, ry + 26, reelW - 4, 16, C.REEL_SHADE1);
      canvas.fillRect(rx + 2, ry + reelH - 42, reelW - 4, 16, C.REEL_SHADE1);
      canvas.fillRect(rx + 2, ry + reelH - 26, reelW - 4, 24, C.REEL_SHADE2);

      // Center Payline Highlight Row inside Reel
      const paylineRowBg = allLocked && isJackpot
        ? C.GOLD_LIGHT
        : allLocked && isWin
        ? C.WHITE
        : C.WHITE;
      canvas.fillRect(rx + 2, ry + cellH, reelW - 4, cellH, paylineRowBg);

      // Draw Symbols inside this Reel Window (clipped to [ry+3, ry+reelH-3])
      const clipY0 = ry + 3;
      const clipY1 = ry + reelH - 3;
      const centerX = rx + reelW / 2;

      if (isLocked) {
        // Elastic bounce offset right when locking
        const bounceY = f === lockFrames[r] ? 5 : f === lockFrames[r] + 1 ? -2 : 0;
        const targetSyms = reelTargets[r]; // [top, center, bottom]
        for (let row = 0; row < 3; row++) {
          const symY = ry + row * cellH + cellH / 2 + bounceY;
          drawSlotSymbolSprite(canvas, targetSyms[row], centerX, symY, clipY0, clipY1);
        }
      } else {
        // Smooth vertical scrolling strip!
        const speed = (r === 2 && isSuspense && f > lockFrame2) ? 16 : 26;
        const scrollPx = (f * speed + r * 35);
        const shiftInCell = scrollPx % cellH;
        const baseIdx = Math.floor(scrollPx / cellH);

        for (let row = -1; row <= 3; row++) {
          const symIdx = ((baseIdx - row) % SYMBOL_ORDER.length + SYMBOL_ORDER.length) % SYMBOL_ORDER.length;
          const sym = SYMBOL_ORDER[symIdx];
          const symY = ry + row * cellH + shiftInCell + cellH / 2;
          drawSlotSymbolSprite(canvas, sym, centerX, symY, clipY0, clipY1);
        }
      }

      // Reel Window Border (Gold if locked, Emerald/Gold if winning, Navy if spinning)
      let reelBorder = C.BORDER_NAVY;
      let borderThick = 2;
      if (justLocked) {
        reelBorder = C.WHITE;
        borderThick = 3;
      } else if (allLocked && isJackpot) {
        reelBorder = C.GOLD_PURE;
        borderThick = 3;
      } else if (allLocked && isWin && result.reels[r] === (result.reels[0] === result.reels[1] ? result.reels[0] : result.reels[2])) {
        reelBorder = C.GREEN_BRIGHT;
        borderThick = 3;
      } else if (isLocked && isSuspense && r < 2 && !allLocked) {
        reelBorder = C.ORANGE_BRIGHT;
        borderThick = 3;
      } else if (isLocked) {
        reelBorder = C.GOLD_RICH;
      }
      canvas.strokeRoundedRect(rx, ry, reelW, reelH, 6, borderThick, reelBorder);
    }

    // 5. Center Payline Frame Rails & Side Arrows
    const paylineY = reelY + cellH + cellH / 2;
    const arrowCol = allLocked && isWin ? C.GOLD_GLEAM : C.RED_BRIGHT;
    // Left payline arrow ►
    for (let i = 0; i < 9; i++) {
      canvas.fillRect(34 + i, paylineY - (8 - i), 2, (8 - i) * 2 + 1, arrowCol);
    }
    // Right payline arrow ◄
    for (let i = 0; i < 9; i++) {
      canvas.fillRect(340 - i, paylineY - (8 - i), 2, (8 - i) * 2 + 1, arrowCol);
    }
    // Glowing Payline Rails framing the center row when winning
    if (allLocked && isWin) {
      const railCol = isJackpot ? C.GOLD_PURE : C.GREEN_BRIGHT;
      canvas.fillRect(48, reelY + cellH - 1, 286, 2, railCol);
      canvas.fillRect(48, reelY + cellH * 2 - 1, 286, 2, railCol);
    }

    // 6. Reel Status Badges & Bottom Paybar
    for (let r = 0; r < 3; r++) {
      const rx = reelXPositions[r];
      const isLocked = f >= lockFrames[r];
      const badgeCol = isLocked ? (allLocked && isWin ? C.GREEN_DARK : C.GOLD_DEEP) : C.PANEL_NAVY;
      canvas.fillRoundedRect(rx + 10, 184, reelW - 20, 16, 4, badgeCol);
      canvas.drawText(isLocked ? 'LOCKED' : 'SPIN', rx + reelW / 2, 189, 1, isLocked ? C.WHITE : C.SILVER_MID);
    }

    // 7. Jackpot / Win Celebration Sparkles
    if (allLocked && isWin) {
      const spCoords = [
        [65, 60], [185, 55], [305, 60],
        [95, 160], [190, 165], [285, 160],
      ];
      for (let i = 0; i < spCoords.length; i++) {
        if ((f + i) % 2 === 0) {
          canvas.drawStarSparkle(spCoords[i][0], spCoords[i][1], isJackpot ? 7 : 5, C.GOLD_GLEAM, C.WHITE);
        }
      }
    }

    // Hold final frame for 3 seconds (300cs)
    const delayCs = f === totalFrames - 1 ? 300 : 5;
    frames.push({ pixels: canvas.pixels, delayCs });
  }

  // Put the locked Hero Jackpot Frame at Frame 0 so paused [GIF] state never says "SPIN"!
  frames.unshift({ pixels: frames[frames.length - 1].pixels, delayCs: 120 });

  return encodeGIF(width, height, frames, 0);
}

// ============================================================================
// 5. MOONFLIP PREVIEW GIFS (MINES, KENO, BLACKJACK, CRASH) & BANNERS (RULES, VERIFY)
// ============================================================================

const PREVIEW_CACHE = new Map();

/**
 * Draws the signature Moonflip Crescent Moon + Gold Coin / Star Emblem at (cx, cy, r)
 */
function drawMoonflipEmblem(canvas, cx, cy, r, accentColor = C.GOLD_PURE, glowColor = C.GOLD_GLEAM) {
  // Outer aura ring
  canvas.strokeEllipse(cx, cy, r + 6, r + 6, 1, C.GOLD_DEEP);
  canvas.fillEllipse(cx, cy, r + 2, r + 2, C.BG_NAVY);
  // Gold crescent moon (outer circle minus offset inner circle)
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d1 = dx * dx + dy * dy <= r * r;
      const ox = dx - r * 0.35;
      const oy = dy + r * 0.18;
      const d2 = ox * ox + oy * oy <= (r * 0.78) * (r * 0.78);
      if (d1 && !d2) {
        const c = dx + dy < -r * 0.2 ? glowColor : accentColor;
        canvas.setPixel(cx + dx, cy + dy, c);
      }
    }
  }
  // Floating star inside the crescent
  canvas.drawStarSparkle(cx + r * 0.28, cy - r * 0.15, Math.max(4, Math.round(r * 0.28)), glowColor, C.WHITE);
}

/**
 * Generates an animated 5x5 Mines Preview GIF for the #mines lobby panel.
 * Frame 0 is the Hero Cashout Showcase (14.85X WIN!).
 */
export function getMinesPreviewGif() {
  if (PREVIEW_CACHE.has('mines')) return PREVIEW_CACHE.get('mines');

  const width = 390;
  const height = 235;
  const frames = [];

  // 5x5 Grid coordinates: 7 gems uncovered in sequence, 3 bombs revealed at end
  const gemSeq = [12, 7, 13, 17, 6, 18, 8];
  const bombSet = new Set([2, 15, 23]);
  const multSteps = ['1.00X', '1.14X', '1.52X', '2.18X', '3.45X', '5.80X', '9.65X', '14.85X'];

  const totalFrames = 22;

  for (let f = 0; f < totalFrames; f++) {
    const canvas = new PixelCanvas(width, height);
    canvas.clear(C.BG_DEEP);

    // Outer Cabinet
    canvas.fillRoundedRect(14, 8, width - 28, height - 16, 10, C.BG_NAVY);
    canvas.strokeRoundedRect(14, 8, width - 28, height - 16, 10, 2, f >= 16 ? C.GREEN_BRIGHT : C.GOLD_RICH);
    canvas.drawText('★ MOONFLIP 5X5 HIGH-STAKES MINES ★', width / 2, 18, 1, C.GOLD_GLEAM, C.BLACK);

    // Determine how many gems are uncovered at frame f
    const gemsUncovered = Math.min(gemSeq.length, Math.floor(f / 2));
    const activeGems = new Set(gemSeq.slice(0, gemsUncovered));
    const isCashedOut = f >= 16;

    // Draw 5x5 Tile Grid on the Left-Center (x = 34..218, y = 36..212)
    const gridX = 32;
    const gridY = 36;
    const tileW = 33;
    const tileH = 31;
    const gap = 4;

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const idx = r * 5 + c;
        const tx = gridX + c * (tileW + gap);
        const ty = gridY + r * (tileH + gap);
        const cx = tx + tileW / 2;
        const cy = ty + tileH / 2;

        if (activeGems.has(idx)) {
          // Revealed Cyan Diamond Tile!
          canvas.fillRoundedRect(tx, ty, tileW, tileH, 5, C.BLUE_DEEP);
          canvas.strokeRoundedRect(tx, ty, tileW, tileH, 5, 2, isCashedOut ? C.GREEN_BRIGHT : C.CYAN_DIAMOND);
          drawSlotSymbolSprite(canvas, '💎', cx, cy, ty + 2, ty + tileH - 2);
        } else if (isCashedOut && bombSet.has(idx)) {
          // Revealed Bomb Tile (dimmed after safe cashout)
          canvas.fillRoundedRect(tx, ty, tileW, tileH, 5, C.RED_DARK);
          canvas.strokeRoundedRect(tx, ty, tileW, tileH, 5, 1, C.RED_BRIGHT);
          canvas.fillEllipse(cx, cy + 2, 7, 7, C.BLACK);
          canvas.fillEllipse(cx - 2, cy, 2, 2, C.RED_BRIGHT);
          canvas.drawStarSparkle(cx + 4, cy - 6, 3, C.ORANGE_BRIGHT, C.GOLD_GLEAM);
        } else {
          // Unrevealed Mystery Tile
          canvas.fillRoundedRect(tx, ty, tileW, tileH, 5, C.PANEL_NAVY);
          canvas.strokeRoundedRect(tx, ty, tileW, tileH, 5, 1, C.BORDER_NAVY);
          canvas.fillEllipse(cx, cy, 3, 3, C.BORDER_NAVY);
        }
      }
    }

    // Right Telemetry & Multiplier Panel (x = 226..364)
    const panX = 226;
    canvas.fillRoundedRect(panX, 36, 138, 178, 8, C.PANEL_NAVY);
    canvas.strokeRoundedRect(panX, 36, 138, 178, 8, 1, C.GOLD_RICH);

    canvas.drawText('LIVE MULTIPLIER', panX + 69, 48, 1, C.SILVER_LIGHT);
    const multTxt = multSteps[gemsUncovered];
    canvas.drawText(multTxt, panX + 69, 64, 2, isCashedOut ? C.GREEN_LIGHT : C.GOLD_GLEAM, C.BLACK);

    canvas.drawText(`GEMS: ${gemsUncovered}/22`, panX + 69, 92, 1, C.CYAN_ICE);
    canvas.drawText('BOMBS: 3 MINES', panX + 69, 108, 1, C.RED_LIGHT);

    // Cash Out Status Badge
    const btnCol = isCashedOut ? C.GREEN_BRIGHT : C.GOLD_PURE;
    canvas.fillRoundedRect(panX + 10, 134, 118, 34, 6, isCashedOut ? C.GREEN_DARK : C.BG_NAVY);
    canvas.strokeRoundedRect(panX + 10, 134, 118, 34, 6, 2, btnCol);
    canvas.drawText(isCashedOut ? '★ CASHED OUT! ★' : 'PICKING TILES...', panX + 69, 143, 1, C.WHITE);
    canvas.drawText(isCashedOut ? '+3,712 TOKENS' : 'PROVABLY FAIR', panX + 69, 155, 1, isCashedOut ? C.GOLD_GLEAM : C.GOLD_LIGHT);

    canvas.drawText('MOONFLIP CASINO', panX + 69, 192, 1, C.GOLD_RICH);

    const delayCs = f === totalFrames - 1 ? 260 : 6;
    frames.push({ pixels: canvas.pixels, delayCs });
  }

  // Hero Frame 0 = Final Cashout Showcase
  frames.unshift({ pixels: frames[frames.length - 1].pixels, delayCs: 120 });

  const buf = encodeGIF(width, height, frames, 0);
  PREVIEW_CACHE.set('mines', buf);
  return buf;
}

/**
 * Generates an animated 20-Ball Keno Preview GIF for the #keno lobby panel.
 */
export function getKenoPreviewGif() {
  if (PREVIEW_CACHE.has('keno')) return PREVIEW_CACHE.get('keno');

  const width = 390;
  const height = 235;
  const frames = [];

  const playerPicks = new Set([3, 7, 12, 14, 19]);
  const drawSeq = [3, 9, 7, 12, 16, 14, 19]; // 5/5 hits showcase!
  const hitPayouts = ['0.0X', '0.0X', '0.4X', '2.0X', '6.0X', '25.0X'];

  const totalFrames = 22;

  for (let f = 0; f < totalFrames; f++) {
    const canvas = new PixelCanvas(width, height);
    canvas.clear(C.BG_DEEP);

    const isJackpot = f >= 16;
    canvas.fillRoundedRect(14, 8, width - 28, height - 16, 10, C.BG_NAVY);
    canvas.strokeRoundedRect(14, 8, width - 28, height - 16, 10, 2, isJackpot ? C.GOLD_GLEAM : C.PURPLE_MID);
    canvas.drawText('★ MOONFLIP PROVABLY FAIR KENO • MULTI-RISK ★', width / 2, 18, 1, C.GOLD_GLEAM, C.BLACK);

    const drawnCount = Math.min(drawSeq.length, Math.floor(f / 2));
    const drawnSet = new Set(drawSeq.slice(0, drawnCount));

    let hits = 0;
    for (const p of playerPicks) {
      if (drawnSet.has(p)) hits++;
    }

    // 4x5 Keno Board (x = 26..242, y = 36..182)
    const startX = 28;
    const startY = 38;
    const cellW = 40;
    const cellH = 32;
    const gap = 4;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const num = r * 5 + c + 1;
        const bx = startX + c * (cellW + gap);
        const by = startY + r * (cellH + gap);
        const isPick = playerPicks.has(num);
        const isDrawn = drawnSet.has(num);

        let bg = C.PANEL_NAVY;
        let border = C.BORDER_NAVY;
        let txtCol = C.SILVER_MID;

        if (isPick && isDrawn) {
          // HIT!
          bg = C.GREEN_DARK;
          border = C.GOLD_GLEAM;
          txtCol = C.WHITE;
        } else if (isPick) {
          bg = C.BLUE_DEEP;
          border = C.BLUE_BRIGHT;
          txtCol = C.WHITE;
        } else if (isDrawn) {
          bg = C.GOLD_DEEP;
          border = C.GOLD_PURE;
          txtCol = C.GOLD_GLEAM;
        }

        canvas.fillRoundedRect(bx, by, cellW, cellH, 5, bg);
        canvas.strokeRoundedRect(bx, by, cellW, cellH, 5, isPick && isDrawn ? 2 : 1, border);
        const label = num < 10 ? `0${num}` : `${num}`;
        canvas.drawText(label, bx + cellW / 2, by + 12, 1, txtCol, C.BLACK);

        if (isPick && isDrawn && (f + num) % 2 === 0) {
          canvas.drawStarSparkle(bx + cellW - 6, by + 6, 3, C.GOLD_GLEAM, C.WHITE);
        }
      }
    }

    // Right Keno Payout Panel
    const panX = 252;
    canvas.fillRoundedRect(panX, 38, 114, 140, 8, C.PANEL_NAVY);
    canvas.strokeRoundedRect(panX, 38, 114, 140, 8, 1, C.PURPLE_MID);

    canvas.drawText(`HITS: ${hits} / 5`, panX + 57, 48, 1, C.WHITE);
    canvas.drawText(hitPayouts[hits], panX + 57, 64, 2, hits === 5 ? C.GOLD_GLEAM : C.GREEN_LIGHT, C.BLACK);
    canvas.drawText('5/5 = 25.0X', panX + 57, 94, 1, C.GOLD_PURE);
    canvas.drawText('4/5 =  6.0X', panX + 57, 108, 1, C.SILVER_LIGHT);
    canvas.drawText('3/5 =  2.0X', panX + 57, 122, 1, C.SILVER_LIGHT);
    canvas.drawText('2/5 =  0.4X', panX + 57, 136, 1, C.SILVER_MID);
    canvas.drawText('HIGH RISK: 45X', panX + 57, 154, 1, C.RED_LIGHT);

    // Bottom Banner
    canvas.fillRoundedRect(28, 186, width - 56, 28, 6, isJackpot ? C.GREEN_DARK : C.PANEL_NAVY);
    canvas.strokeRoundedRect(28, 186, width - 56, 28, 6, 1, isJackpot ? C.GOLD_GLEAM : C.PURPLE_LIGHT);
    canvas.drawText(
      isJackpot ? '★ 5/5 HITS! 25.0X JACKPOT (+2,500) ★' : `PNEUMATIC DRAW TUBE... (${drawnCount}/7 BALLS)`,
      width / 2,
      196,
      1,
      isJackpot ? C.GOLD_GLEAM : C.WHITE,
      C.BLACK
    );

    const delayCs = f === totalFrames - 1 ? 260 : 6;
    frames.push({ pixels: canvas.pixels, delayCs });
  }

  frames.unshift({ pixels: frames[frames.length - 1].pixels, delayCs: 120 });

  const buf = encodeGIF(width, height, frames, 0);
  PREVIEW_CACHE.set('keno', buf);
  return buf;
}

/**
 * Generates an animated Blackjack 21 Preview GIF for the #blackjack lobby panel.
 */
export function getBlackjackPreviewGif() {
  if (PREVIEW_CACHE.has('blackjack')) return PREVIEW_CACHE.get('blackjack');

  const width = 390;
  const height = 235;
  const frames = [];
  const totalFrames = 20;

  const drawCardRect = (canvas, x, y, rank, suitCol, isHidden = false, highlight = false) => {
    const cw = 48;
    const ch = 64;
    canvas.fillRoundedRect(x + 2, y + 2, cw, ch, 6, C.BLACK);
    if (isHidden) {
      canvas.fillRoundedRect(x, y, cw, ch, 6, C.RED_MID);
      canvas.strokeRoundedRect(x, y, cw, ch, 6, 2, C.GOLD_PURE);
      canvas.drawText('?', x + cw / 2, y + 25, 2, C.GOLD_GLEAM);
      return;
    }
    canvas.fillRoundedRect(x, y, cw, ch, 6, C.WHITE);
    canvas.strokeRoundedRect(x, y, cw, ch, 6, highlight ? 3 : 2, highlight ? C.GOLD_PURE : C.SILVER_MID);
    canvas.drawText(rank, x + 14, y + 8, 1, suitCol);
    canvas.drawText(rank, x + cw / 2, y + 25, 2, suitCol);
  };

  for (let f = 0; f < totalFrames; f++) {
    const canvas = new PixelCanvas(width, height);
    canvas.clear(C.BG_DEEP);

    // Velvet Green Casino Table
    canvas.fillRoundedRect(14, 8, width - 28, height - 16, 12, C.FELT_DARK);
    canvas.fillEllipse(width / 2, height / 2, 165, 92, C.FELT_MID);
    canvas.strokeRoundedRect(14, 8, width - 28, height - 16, 12, 3, C.GOLD_RICH);

    canvas.drawText('★ MOONFLIP BLACKJACK — TABLE 21 ★', width / 2, 18, 1, C.GOLD_GLEAM, C.BLACK);

    const revealed = f >= 10;

    // Dealer Hand (Top)
    canvas.drawText(revealed ? 'DEALER: 18' : 'DEALER: 10 + ?', 95, 44, 1, C.SILVER_LIGHT, C.BLACK);
    drawCardRect(canvas, 65, 58, '10', C.BLACK, false, false);
    if (f >= 2) {
      drawCardRect(canvas, 121, 58, '8', C.RED_BRIGHT, !revealed, false);
    }

    // Player Hand (Right — Natural Blackjack 21!)
    canvas.drawText(revealed ? 'YOU: 21 (BLACKJACK!)' : 'DEALING HAND...', 280, 44, 1, C.GOLD_GLEAM, C.BLACK);
    if (f >= 4) {
      drawCardRect(canvas, 228, 58, 'A', C.BLACK, false, revealed);
    }
    if (f >= 7) {
      drawCardRect(canvas, 284, 58, 'K', C.RED_BRIGHT, false, revealed);
    }

    if (revealed) {
      canvas.drawStarSparkle(218, 52, 6, C.GOLD_GLEAM, C.WHITE);
      canvas.drawStarSparkle(342, 52, 6, C.GOLD_GLEAM, C.WHITE);
    }

    // Bottom Banner
    const winCol = revealed ? C.GOLD_PURE : C.BORDER_NAVY;
    canvas.fillRoundedRect(45, 146, 300, 56, 8, C.BG_NAVY);
    canvas.strokeRoundedRect(45, 146, 300, 56, 8, 2, winCol);
    canvas.drawText(
      revealed ? '★ NATURAL BLACKJACK 21! ★' : 'DEALING CARDS FROM SHOE...',
      width / 2,
      158,
      2,
      revealed ? C.GOLD_GLEAM : C.WHITE,
      C.BLACK
    );
    canvas.drawText(
      revealed ? 'PAYS 3:2 INSTANTLY (+2.50X PAYOUT)' : 'BEAT THE DEALER TO 21',
      width / 2,
      184,
      1,
      C.GREEN_LIGHT
    );

    const delayCs = f === totalFrames - 1 ? 260 : 6;
    frames.push({ pixels: canvas.pixels, delayCs });
  }

  frames.unshift({ pixels: frames[frames.length - 1].pixels, delayCs: 120 });

  const buf = encodeGIF(width, height, frames, 0);
  PREVIEW_CACHE.set('blackjack', buf);
  return buf;
}

/**
 * Generates an animated Orbital Rocket Crash Preview GIF for the #crash lobby panel.
 * Frame 0 is the Hero High-Altitude Cashout Showcase (8.45X WIN!).
 */
export function getCrashPreviewGif() {
  if (PREVIEW_CACHE.has('crash')) return PREVIEW_CACHE.get('crash');

  const width = 390;
  const height = 235;
  const frames = [];
  const totalFrames = 24;

  // Exponential multiplier progression up to 8.45x Cashout Showcase
  const multSteps = [
    1.00, 1.08, 1.18, 1.32, 1.50, 1.72, 1.98, 2.30,
    2.68, 3.15, 3.70, 4.35, 5.10, 5.95, 6.85, 7.65,
    8.45, 8.45, 8.45, 8.45, 8.45, 8.45, 8.45, 8.45,
  ];

  const bgStars = [
    [58, 48], [96, 42], [142, 52], [185, 44], [222, 60],
    [72, 85], [125, 78], [168, 92], [210, 110], [88, 120],
  ];

  for (let f = 0; f < totalFrames; f++) {
    const canvas = new PixelCanvas(width, height);
    canvas.clear(C.BG_DEEP);

    const isCashedOut = f >= 16;
    const curMult = multSteps[f];
    const progress = Math.min(1, f / 16); // 0.0 -> 1.0 across climb

    // Outer Luxury Telemetry Cabinet
    canvas.fillRoundedRect(14, 8, width - 28, height - 16, 10, C.BG_NAVY);
    canvas.strokeRoundedRect(
      14,
      8,
      width - 28,
      height - 16,
      10,
      2,
      isCashedOut ? (f % 2 === 0 ? C.GREEN_BRIGHT : C.GOLD_GLEAM) : C.GOLD_RICH
    );
    canvas.drawText('★ MOONFLIP ORBITAL CRASH • LIVE TELEMETRY ★', width / 2, 18, 1, C.GOLD_GLEAM, C.BLACK);

    // 1. Left Radar & Exponential Trajectory Viewport (x = 26..242, y = 34..180)
    const vx = 26;
    const vy = 34;
    const vw = 216;
    const vh = 146;
    canvas.fillRoundedRect(vx, vy, vw, vh, 8, C.BG_DEEP);
    canvas.strokeRoundedRect(vx, vy, vw, vh, 8, 1, isCashedOut ? C.GREEN_BRIGHT : C.BORDER_NAVY);

    // Subtle Moonflip Crescent in upper-left deep space
    drawMoonflipEmblem(canvas, vx + 36, vy + 30, 11, C.GOLD_DEEP, C.GOLD_RICH);

    // Twinkling Deep-Space Stars
    for (let i = 0; i < bgStars.length; i++) {
      const [sx, sy] = bgStars[i];
      if ((f + i) % 3 !== 0) {
        canvas.setPixel(sx, sy, (f + i) % 2 === 0 ? C.WHITE : C.CYAN_ICE);
      }
    }

    // Radar Horizontal Altitude Gridlines & Labels
    const gridLevels = [
      { y: vy + 24, label: '10X' },
      { y: vy + 56, label: '5X' },
      { y: vy + 88, label: '2X' },
      { y: vy + 122, label: '1X' },
    ];
    for (const g of gridLevels) {
      for (let gx = vx + 26; gx < vx + vw - 8; gx += 4) {
        canvas.setPixel(gx, g.y, C.BORDER_NAVY);
      }
      canvas.drawText(g.label, vx + 14, g.y - 3, 1, C.SILVER_DARK);
    }

    // Plot Exponential Trajectory Curve from (startX, startY) to (endX, endY)
    const startX = vx + 28;
    const startY = vy + 124;
    const maxSpanX = 166;
    const maxSpanY = 92;
    const curSpanX = Math.round(progress * maxSpanX);

    let rocketX = startX;
    let rocketY = startY;

    for (let dx = 0; dx <= curSpanX; dx++) {
      const t = maxSpanX > 0 ? dx / maxSpanX : 0;
      const curveY = Math.round(startY - Math.pow(t, 1.65) * maxSpanY);
      const px = startX + dx;

      // Under-curve shaded telemetry fill
      const fillCol = isCashedOut
        ? (dx % 2 === 0 ? C.FELT_MID : C.FELT_DARK)
        : (dx % 2 === 0 ? C.BLUE_DEEP : C.PANEL_NAVY);
      for (let py = curveY + 2; py <= startY; py++) {
        canvas.setPixel(px, py, fillCol);
      }

      // Glowing 3px trajectory line
      const lineCol = isCashedOut ? C.GREEN_BRIGHT : C.GOLD_GLEAM;
      canvas.setPixel(px, curveY - 1, C.WHITE);
      canvas.setPixel(px, curveY, lineCol);
      canvas.setPixel(px, curveY + 1, isCashedOut ? C.GREEN_LIGHT : C.GOLD_PURE);

      rocketX = px;
      rocketY = curveY;
    }

    // Draw Thruster Exhaust Flame & Diagonal Rocket Sprite at (rocketX, rocketY)
    const flameLen = (f % 2 === 0) ? 14 : 10;
    for (let fl = 1; fl <= flameLen; fl++) {
      const fx = rocketX - Math.round(fl * 0.85);
      const fy = rocketY + Math.round(fl * 0.65);
      const r = fl < 5 ? 3 : fl < 9 ? 2 : 1;
      const col = fl < 4 ? C.WHITE : fl < 8 ? C.GOLD_GLEAM : C.ORANGE_BRIGHT;
      canvas.fillEllipse(fx, fy, r, r, col);
    }

    // Rocket Fuselage & Fins
    canvas.fillEllipse(rocketX, rocketY, 6, 4, C.WHITE);
    canvas.fillEllipse(rocketX + 4, rocketY - 3, 4, 3, C.RED_BRIGHT); // Nose cone
    canvas.fillRect(rocketX - 6, rocketY + 2, 4, 4, C.RED_BRIGHT);   // Lower fin
    canvas.fillRect(rocketX - 5, rocketY - 4, 4, 3, C.RED_BRIGHT);   // Upper fin
    canvas.fillEllipse(rocketX + 1, rocketY - 1, 2, 2, C.CYAN_DIAMOND); // Cockpit window

    if (isCashedOut) {
      canvas.drawStarSparkle(rocketX - 10, rocketY - 10, 5, C.GOLD_GLEAM, C.WHITE);
      canvas.drawStarSparkle(rocketX + 12, rocketY - 8, 6, C.GREEN_LIGHT, C.WHITE);
    }

    // Floating Multiplier Pill above Rocket inside Viewport
    const badgeX = Math.min(vx + vw - 34, Math.max(vx + 54, rocketX - 6));
    const badgeY = Math.max(vy + 10, rocketY - 22);
    canvas.fillRoundedRect(badgeX - 24, badgeY, 48, 13, 4, isCashedOut ? C.GREEN_DARK : C.BG_NAVY);
    canvas.strokeRoundedRect(badgeX - 24, badgeY, 48, 13, 4, 1, isCashedOut ? C.GOLD_GLEAM : C.GOLD_PURE);
    canvas.drawText(`${curMult.toFixed(2)}X`, badgeX, badgeY + 3, 1, C.WHITE);

    // 2. Right Telemetry & Cashout HUD Panel (x = 248..366, y = 34..180)
    const panX = 248;
    const panW = 118;
    canvas.fillRoundedRect(panX, vy, panW, vh, 8, C.PANEL_NAVY);
    canvas.strokeRoundedRect(panX, vy, panW, vh, 8, 1, isCashedOut ? C.GREEN_BRIGHT : C.GOLD_RICH);

    canvas.drawText('MULTIPLIER', panX + 59, 44, 1, C.SILVER_LIGHT);
    canvas.drawText(
      `${curMult.toFixed(2)}X`,
      panX + 59,
      58,
      2,
      isCashedOut ? C.GREEN_LIGHT : curMult >= 4.0 ? C.GOLD_GLEAM : C.WHITE,
      C.BLACK
    );

    const zoneText = curMult >= 5.0 ? 'DEEP SPACE' : curMult >= 2.0 ? 'HIGH ORBIT' : 'STRATOSPHERE';
    canvas.drawText(`ZONE: ${zoneText}`, panX + 59, 84, 1, C.CYAN_ICE);

    const liveWin = Math.floor(500 * curMult);
    canvas.drawText(`WIN: +${liveWin.toLocaleString()}`, panX + 59, 98, 1, C.GOLD_GLEAM);

    // Cockpit Action Button Box
    const boxY = 116;
    canvas.fillRoundedRect(panX + 8, boxY, panW - 16, 36, 6, isCashedOut ? C.GREEN_DARK : C.BG_NAVY);
    canvas.strokeRoundedRect(
      panX + 8,
      boxY,
      panW - 16,
      36,
      6,
      2,
      isCashedOut ? C.GOLD_GLEAM : C.GREEN_BRIGHT
    );
    canvas.drawText(isCashedOut ? '★ CASHED OUT! ★' : '💰 CASH OUT', panX + 59, boxY + 8, 1, C.WHITE);
    canvas.drawText(
      isCashedOut ? '+4,225 TOKENS' : 'INSTANT LOCK',
      panX + 59,
      boxY + 21,
      1,
      isCashedOut ? C.GOLD_GLEAM : C.GREEN_LIGHT
    );

    canvas.drawText('AUTO-CASH READY', panX + 59, 162, 1, C.GOLD_RICH);

    // 3. Bottom Telemetry & History Strip (y = 186..216)
    canvas.fillRoundedRect(26, 186, width - 52, 28, 6, isCashedOut ? C.GREEN_DARK : C.PANEL_NAVY);
    canvas.strokeRoundedRect(26, 186, width - 52, 28, 6, 1, isCashedOut ? C.GOLD_GLEAM : C.GOLD_RICH);
    canvas.drawText(
      isCashedOut
        ? '★ EJECTED SAFELY AT 8.45X! (+4,225 TOKENS WON) ★'
        : 'RECENT:  2.45X  •  1.42X  •  12.80X  •  3.15X  •  5.60X',
      width / 2,
      196,
      1,
      isCashedOut ? C.GOLD_GLEAM : C.WHITE,
      C.BLACK
    );

    const delayCs = f === totalFrames - 1 ? 260 : 6;
    frames.push({ pixels: canvas.pixels, delayCs });
  }

  // Hero Frame 0 = Final Cashout Showcase so paused [GIF] state looks incredible!
  frames.unshift({ pixels: frames[frames.length - 1].pixels, delayCs: 120 });

  const buf = encodeGIF(width, height, frames, 0);
  PREVIEW_CACHE.set('crash', buf);
  return buf;
}

/**
 * Generates an animated Moonflip Official Rules Banner GIF for #rules.
 */
export function getRulesBannerGif() {
  if (PREVIEW_CACHE.has('rules')) return PREVIEW_CACHE.get('rules');

  const width = 420;
  const height = 185;
  const frames = [];
  const totalFrames = 16;

  const stars = [
    [45, 32], [95, 24], [330, 28], [375, 42],
    [35, 130], [385, 125], [140, 48], [280, 45],
  ];

  for (let f = 0; f < totalFrames; f++) {
    const canvas = new PixelCanvas(width, height);
    canvas.clear(C.BG_DEEP);

    // Outer Luxury Gold Card
    canvas.fillRoundedRect(6, 6, width - 12, height - 12, 12, C.BG_NAVY);
    canvas.fillEllipse(width / 2, 75, 165, 65, C.PANEL_NAVY);
    canvas.strokeRoundedRect(6, 6, width - 12, height - 12, 12, 3, C.GOLD_PURE);
    canvas.strokeRoundedRect(11, 11, width - 22, height - 22, 9, 1, C.GOLD_DEEP);

    // Twinkling Stars
    for (let i = 0; i < stars.length; i++) {
      if ((f + i) % 3 !== 0) {
        canvas.drawStarSparkle(stars[i][0], stars[i][1], (f + i) % 2 === 0 ? 5 : 3, C.GOLD_GLEAM, C.WHITE);
      }
    }

    // Center Moonflip Crescent Moon Emblem
    drawMoonflipEmblem(canvas, width / 2, 46, 22, C.GOLD_PURE, C.GOLD_GLEAM);

    // Main Brand Title & Subtitle
    canvas.drawText('★ MOONFLIP OFFICIAL RULES ★', width / 2, 82, 2, C.WHITE, C.BLACK);
    canvas.drawText('COMMUNITY CONDUCT • FAIR PLAY • PRIZE REDEMPTION', width / 2, 106, 1, C.GOLD_LIGHT);

    // 3 Pillar Badges at Bottom
    const badges = [
      { x: 24, label: '18+ & KYC', sub: 'VERIFIED ONLY', col: C.RED_BRIGHT },
      { x: 154, label: 'FAIR PLAY', sub: 'ZERO EXPLOITS', col: C.GOLD_PURE },
      { x: 284, label: 'REDEMPTIONS', sub: 'CRYPTO & GIFTS', col: C.GREEN_BRIGHT },
    ];

    for (const b of badges) {
      canvas.fillRoundedRect(b.x, 124, 112, 42, 6, C.BG_DEEP);
      canvas.strokeRoundedRect(b.x, 124, 112, 42, 6, 2, b.col);
      canvas.drawText(b.label, b.x + 56, 133, 1, C.WHITE);
      canvas.drawText(b.sub, b.x + 56, 148, 1, C.GOLD_GLEAM);
    }

    frames.push({ pixels: canvas.pixels, delayCs: 10 });
  }

  const buf = encodeGIF(width, height, frames, 0);
  PREVIEW_CACHE.set('rules', buf);
  return buf;
}

/**
 * Generates an animated Moonflip Verification Gateway Banner GIF for #verify.
 */
export function getVerifyBannerGif() {
  if (PREVIEW_CACHE.has('verify')) return PREVIEW_CACHE.get('verify');

  const width = 420;
  const height = 185;
  const frames = [];
  const totalFrames = 16;

  for (let f = 0; f < totalFrames; f++) {
    const canvas = new PixelCanvas(width, height);
    canvas.clear(C.BG_DEEP);

    // Outer Emerald & Gold Security Gateway Frame
    canvas.fillRoundedRect(6, 6, width - 12, height - 12, 12, C.BG_NAVY);
    canvas.fillEllipse(width / 2, 70, 160, 62, C.FELT_DARK);
    canvas.strokeRoundedRect(6, 6, width - 12, height - 12, 12, 3, C.GREEN_BRIGHT);
    canvas.strokeRoundedRect(11, 11, width - 22, height - 22, 9, 1, C.GOLD_RICH);

    // Pulsing Radar Security Ring around Emblem
    const pulseR = 26 + ((f % 8) * 2);
    canvas.strokeEllipse(width / 2, 46, pulseR, pulseR, 1, f % 2 === 0 ? C.GREEN_BRIGHT : C.FELT_LIGHT);

    // Center Moonflip Crescent Emblem + Emerald Checkmark Badge
    drawMoonflipEmblem(canvas, width / 2, 46, 22, C.GOLD_PURE, C.GREEN_LIGHT);

    // Main Title
    canvas.drawText('★ WELCOME TO MOONFLIP ★', width / 2, 82, 2, C.WHITE, C.BLACK);
    canvas.drawText('OFFICIAL ACCOUNT VERIFICATION GATEWAY', width / 2, 106, 1, C.GREEN_LIGHT);

    // Bottom Call-to-Action Pill
    const pillCol = f % 2 === 0 ? C.GREEN_BRIGHT : C.GOLD_PURE;
    canvas.fillRoundedRect(40, 126, width - 80, 40, 8, C.FELT_DARK);
    canvas.strokeRoundedRect(40, 126, width - 80, 40, 8, 2, pillCol);
    canvas.drawText('★ CLICK VERIFY NOW BELOW TO UNLOCK ★', width / 2, 136, 1, C.WHITE, C.BLACK);
    canvas.drawText('GAMES • LOUNGES • LEADERBOARDS • REWARDS', width / 2, 150, 1, C.GOLD_GLEAM);

    frames.push({ pixels: canvas.pixels, delayCs: 10 });
  }

  const buf = encodeGIF(width, height, frames, 0);
  PREVIEW_CACHE.set('verify', buf);
  return buf;
}

/**
 * Generates an animated Moonflip 24/7 Support & Ticket Gateway Banner GIF for #create-ticket.
 */
export function getTicketBannerGif() {
  if (PREVIEW_CACHE.has('ticket')) return PREVIEW_CACHE.get('ticket');

  const width = 420;
  const height = 185;
  const frames = [];
  const totalFrames = 16;

  const stars = [
    [38, 28], [88, 20], [332, 22], [382, 30],
    [32, 108], [388, 106], [135, 42], [285, 40],
  ];

  for (let f = 0; f < totalFrames; f++) {
    const canvas = new PixelCanvas(width, height);
    canvas.clear(C.BG_DEEP);

    // Outer Luxury Gold & Cyan Card Frame
    canvas.fillRoundedRect(6, 6, width - 12, height - 12, 12, C.BG_NAVY);
    canvas.fillEllipse(width / 2, 72, 168, 64, C.PANEL_NAVY);
    canvas.strokeRoundedRect(6, 6, width - 12, height - 12, 12, 3, C.GOLD_PURE);
    canvas.strokeRoundedRect(11, 11, width - 22, height - 22, 9, 1, C.CYAN_DIAMOND);

    // Twinkling Stars
    for (let i = 0; i < stars.length; i++) {
      if ((f + i) % 3 !== 0) {
        canvas.drawStarSparkle(stars[i][0], stars[i][1], (f + i) % 2 === 0 ? 5 : 3, C.GOLD_GLEAM, C.WHITE);
      }
    }

    // Pulsing Support Signal Rings around Center Emblem
    const ringR = 26 + ((f % 8) * 2);
    canvas.strokeEllipse(width / 2, 44, ringR, ringR, 1, f % 2 === 0 ? C.CYAN_DIAMOND : C.GOLD_PURE);

    // Center Moonflip Crescent Emblem
    drawMoonflipEmblem(canvas, width / 2, 44, 21, C.GOLD_PURE, C.CYAN_ICE);

    // Flanking Golden VIP Support Ticket Icons (Left & Right of Emblem)
    const ticketBounce = Math.round(Math.sin((f / totalFrames) * Math.PI * 2) * 2);
    const drawMiniTicket = (tx, ty, borderCol) => {
      canvas.fillRoundedRect(tx, ty, 38, 22, 4, C.GOLD_DEEP);
      canvas.strokeRoundedRect(tx, ty, 38, 22, 4, 2, borderCol);
      // Ticket side notches
      canvas.fillEllipse(tx, ty + 11, 3, 3, C.PANEL_NAVY);
      canvas.fillEllipse(tx + 38, ty + 11, 3, 3, C.PANEL_NAVY);
      canvas.drawText('VIP', tx + 19, ty + 8, 1, C.GOLD_GLEAM, C.BLACK);
    };
    drawMiniTicket(width / 2 - 84, 33 + ticketBounce, C.GOLD_GLEAM);
    drawMiniTicket(width / 2 + 46, 33 - ticketBounce, C.CYAN_ICE);

    // Main Brand Title & Subtitle
    canvas.drawText('★ MOONFLIP SUPPORT DESK ★', width / 2, 80, 2, C.WHITE, C.BLACK);
    canvas.drawText('24/7 PRIVATE TICKETS • PRIZE REDEMPTIONS • KYC', width / 2, 104, 1, C.CYAN_ICE);

    // 4 Department Badges at Bottom
    const depts = [
      { x: 18, label: 'REDEMPTION', sub: 'CRYPTO & KYC', col: C.GREEN_BRIGHT },
      { x: 116, label: 'WALLET', sub: 'TOKEN HELP', col: C.BLUE_BRIGHT },
      { x: 214, label: 'BUG REPORT', sub: 'GAME FIXES', col: C.ORANGE_BRIGHT },
      { x: 312, label: 'SUPPORT', sub: 'STAFF HELP', col: C.PURPLE_LIGHT },
    ];

    for (let i = 0; i < depts.length; i++) {
      const b = depts[i];
      const activeHighlight = Math.floor(f / 4) === i;
      canvas.fillRoundedRect(b.x, 124, 90, 42, 6, C.BG_DEEP);
      canvas.strokeRoundedRect(b.x, 124, 90, 42, 6, activeHighlight ? 3 : 2, activeHighlight ? C.GOLD_GLEAM : b.col);
      canvas.drawText(b.label, b.x + 45, 133, 1, C.WHITE);
      canvas.drawText(b.sub, b.x + 45, 148, 1, activeHighlight ? C.GOLD_GLEAM : C.GOLD_LIGHT);
    }

    frames.push({ pixels: canvas.pixels, delayCs: 10 });
  }

  const buf = encodeGIF(width, height, frames, 0);
  PREVIEW_CACHE.set('ticket', buf);
  return buf;
}

/**
 * Generates an animated Moonflip Official Announcements Banner GIF for #announcements.
 */
export function getAnnouncementsBannerGif() {
  if (PREVIEW_CACHE.has('announcements')) return PREVIEW_CACHE.get('announcements');

  const width = 420;
  const height = 185;
  const frames = [];
  const totalFrames = 16;

  const stars = [
    [42, 26], [105, 22], [315, 22], [378, 28],
    [30, 112], [390, 110], [150, 44], [270, 44],
  ];

  for (let f = 0; f < totalFrames; f++) {
    const canvas = new PixelCanvas(width, height);
    canvas.clear(C.BG_DEEP);

    // Outer Royal Purple & Gold Broadcast Frame
    canvas.fillRoundedRect(6, 6, width - 12, height - 12, 12, C.BG_NAVY);
    canvas.fillEllipse(width / 2, 72, 170, 64, C.PURPLE_DEEP);
    canvas.fillEllipse(width / 2, 72, 125, 48, C.PANEL_NAVY);
    canvas.strokeRoundedRect(6, 6, width - 12, height - 12, 12, 3, f % 2 === 0 ? C.GOLD_GLEAM : C.GOLD_PURE);
    canvas.strokeRoundedRect(11, 11, width - 22, height - 22, 9, 1, C.PURPLE_LIGHT);

    // Twinkling Stars
    for (let i = 0; i < stars.length; i++) {
      if ((f + i) % 3 !== 0) {
        canvas.drawStarSparkle(stars[i][0], stars[i][1], (f + i) % 2 === 0 ? 5 : 3, C.GOLD_GLEAM, C.WHITE);
      }
    }

    // Expanding Broadcast Wave Arcs around Center Emblem
    const wave1 = 28 + ((f % 8) * 3);
    const wave2 = 28 + (((f + 4) % 8) * 3);
    canvas.strokeEllipse(width / 2, 44, wave1, Math.round(wave1 * 0.65), 1, C.GOLD_GLEAM);
    canvas.strokeEllipse(width / 2, 44, wave2, Math.round(wave2 * 0.65), 1, C.PURPLE_LIGHT);

    // Center Moonflip Crescent Emblem
    drawMoonflipEmblem(canvas, width / 2, 44, 21, C.GOLD_PURE, C.GOLD_GLEAM);

    // Main Broadcast Title & Subtitle
    canvas.drawText('★ MOONFLIP ANNOUNCEMENTS ★', width / 2, 80, 2, C.WHITE, C.BLACK);
    canvas.drawText('OFFICIAL NEWS • PLATFORM UPDATES • COMMUNITY EVENTS', width / 2, 104, 1, C.GOLD_GLEAM);

    // 3 Broadcast Feature Cards at Bottom
    const cards = [
      { x: 24, label: 'NEW UPDATES', sub: 'GAMES & FEATURES', col: C.CYAN_DIAMOND },
      { x: 154, label: 'GIVEAWAYS', sub: 'TOKEN DROPS', col: C.GOLD_PURE },
      { x: 284, label: 'TOURNAMENTS', sub: 'VIP EVENTS', col: C.PURPLE_LIGHT },
    ];

    for (let i = 0; i < cards.length; i++) {
      const b = cards[i];
      const highlight = Math.floor(f / 5) % 3 === i;
      canvas.fillRoundedRect(b.x, 124, 112, 42, 6, C.BG_DEEP);
      canvas.strokeRoundedRect(b.x, 124, 112, 42, 6, highlight ? 3 : 2, highlight ? C.WHITE : b.col);
      canvas.drawText(b.label, b.x + 56, 133, 1, C.WHITE);
      canvas.drawText(b.sub, b.x + 56, 148, 1, C.GOLD_GLEAM);
    }

    frames.push({ pixels: canvas.pixels, delayCs: 10 });
  }

  const buf = encodeGIF(width, height, frames, 0);
  PREVIEW_CACHE.set('announcements', buf);
  return buf;
}


