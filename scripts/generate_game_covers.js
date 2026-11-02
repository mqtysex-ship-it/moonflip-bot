import { createCanvas } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, '../src/web/public/play/assets');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

const W = 640;
const H = 400;

function createBaseCanvas(themeColor, secondaryColor) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Deep space-obsidian background
  const bgGrad = ctx.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H / 2, W * 0.75);
  bgGrad.addColorStop(0, '#111927');
  bgGrad.addColorStop(0.5, '#0b1018');
  bgGrad.addColorStop(1, '#05070c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle isometric grid lines
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  const gridSize = 32;
  for (let x = 0; x < W; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();

  // Ambient aura glow
  ctx.save();
  const glow = ctx.createRadialGradient(W * 0.52, H * 0.45, 20, W * 0.52, H * 0.45, 240);
  glow.addColorStop(0, themeColor + '38');
  glow.addColorStop(0.55, secondaryColor + '18');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  return { canvas, ctx };
}

function drawVignetteAndBorder(ctx, themeColor) {
  // Vignette overlay
  const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.68);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(5, 7, 12, 0.88)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Clean border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Top glowing highlight edge
  const edgeGrad = ctx.createLinearGradient(0, 0, W, 0);
  edgeGrad.addColorStop(0, 'transparent');
  edgeGrad.addColorStop(0.2, themeColor + '66');
  edgeGrad.addColorStop(0.5, themeColor);
  edgeGrad.addColorStop(0.8, themeColor + '66');
  edgeGrad.addColorStop(1, 'transparent');
  ctx.strokeStyle = edgeGrad;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(W, 1);
  ctx.stroke();
}

function drawBadge(ctx, text, color, x = 28, y = 36) {
  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  const textWidth = ctx.measureText(text).width;
  const padX = 10;
  const badgeW = textWidth + padX * 2 + 10;
  const badgeH = 22;

  ctx.fillStyle = 'rgba(8, 12, 19, 0.82)';
  ctx.beginPath();
  ctx.roundRect(x, y - 14, badgeW, badgeH, 6);
  ctx.fill();

  ctx.strokeStyle = color + '80';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Glowing dot
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x + 10, y - 3, 3, 0, Math.PI * 2);
  ctx.fill();

  // Text
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x + 20, y);
  ctx.restore();
}

function drawTitleAndSubtitle(ctx, title, subtitle, color) {
  ctx.save();
  ctx.font = '900 38px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillText(title, 32, H - 54);

  ctx.shadowBlur = 0;
  ctx.font = '700 13px sans-serif';
  ctx.fillStyle = color;
  ctx.letterSpacing = '0.04em';
  ctx.fillText(subtitle.toUpperCase(), 32, H - 28);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 1. MINES COVER
// ---------------------------------------------------------------------------
function generateMinesCover() {
  const { canvas, ctx } = createBaseCanvas('#2ef2b8', '#00f0ff');
  const cx = W / 2;
  const cy = H / 2 - 10;

  // 5x5 isometric tiles
  const rows = 5;
  const cols = 5;
  const tileW = 56;
  const tileH = 34;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isoX = cx + (c - r) * (tileW * 0.52);
      const isoY = cy - 20 + (c + r) * (tileH * 0.55);

      const isGem = (r === 1 && c === 2) || (r === 2 && c === 1) || (r === 3 && c === 3) || (r === 0 && c === 4);
      const isBomb = (r === 3 && c === 0) || (r === 1 && c === 4);

      ctx.save();
      ctx.translate(isoX, isoY);

      ctx.beginPath();
      ctx.moveTo(0, -tileH / 2);
      ctx.lineTo(tileW / 2, 0);
      ctx.lineTo(0, tileH / 2);
      ctx.lineTo(-tileW / 2, 0);
      ctx.closePath();

      if (isGem) {
        ctx.fillStyle = 'rgba(46, 242, 184, 0.25)';
        ctx.strokeStyle = '#2ef2b8';
        ctx.lineWidth = 1.6;
        ctx.shadowColor = '#2ef2b8';
        ctx.shadowBlur = 12;
      } else if (isBomb) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1.4;
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
      }
      ctx.fill();
      ctx.stroke();

      if (isGem) {
        ctx.shadowBlur = 16;
        ctx.shadowColor = '#2ef2b8';
        ctx.fillStyle = '#2ef2b8';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-2, -2, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (isBomb) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#f43f5e';
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Giant glowing emerald gem floating in center
  ctx.save();
  ctx.shadowColor = '#2ef2b8';
  ctx.shadowBlur = 36;
  const gemGrad = ctx.createLinearGradient(cx - 30, cy - 85, cx + 30, cy - 5);
  gemGrad.addColorStop(0, '#ffffff');
  gemGrad.addColorStop(0.35, '#2ef2b8');
  gemGrad.addColorStop(1, '#059669');
  ctx.fillStyle = gemGrad;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 90);
  ctx.lineTo(cx + 36, cy - 52);
  ctx.lineTo(cx + 24, cy - 8);
  ctx.lineTo(cx - 24, cy - 8);
  ctx.lineTo(cx - 36, cy - 52);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();

  drawBadge(ctx, 'ORIGINAL', '#2ef2b8', 28, 38);
  drawTitleAndSubtitle(ctx, 'MINES', 'Gem Hunt & Cash Out', '#2ef2b8');
  drawVignetteAndBorder(ctx, '#2ef2b8');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// 2. CRASH COVER
// ---------------------------------------------------------------------------
function generateCrashCover() {
  const { canvas, ctx } = createBaseCanvas('#2ef2b8', '#3b82f6');

  // Exponential ascent curve
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(60, H - 70);
  ctx.bezierCurveTo(W * 0.4, H - 75, W * 0.65, H * 0.6, W * 0.76, H * 0.28);
  ctx.strokeStyle = '#2ef2b8';
  ctx.lineWidth = 4.5;
  ctx.shadowColor = '#2ef2b8';
  ctx.shadowBlur = 26;
  ctx.stroke();

  // Glow under the curve
  ctx.lineTo(W * 0.76, H - 70);
  ctx.lineTo(60, H - 70);
  ctx.closePath();
  const fillGrad = ctx.createLinearGradient(0, H * 0.28, 0, H - 70);
  fillGrad.addColorStop(0, 'rgba(46, 242, 184, 0.28)');
  fillGrad.addColorStop(1, 'rgba(46, 242, 184, 0.0)');
  ctx.fillStyle = fillGrad;
  ctx.fill();
  ctx.restore();

  // Rocket
  const rx = W * 0.76;
  const ry = H * 0.28;
  const angle = -0.65;

  ctx.save();
  ctx.translate(rx, ry);
  ctx.rotate(angle);

  // Flame
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 32;
  const flameGrad = ctx.createLinearGradient(-38, 0, -8, 0);
  flameGrad.addColorStop(0, 'rgba(251, 191, 36, 0)');
  flameGrad.addColorStop(0.5, '#f59e0b');
  flameGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.lineTo(-48, 0);
  ctx.lineTo(-10, 8);
  ctx.closePath();
  ctx.fill();

  // Rocket body
  ctx.shadowColor = '#2ef2b8';
  ctx.shadowBlur = 20;
  const rGrad = ctx.createLinearGradient(-15, 0, 34, 0);
  rGrad.addColorStop(0, '#0f172a');
  rGrad.addColorStop(0.5, '#e2e8f0');
  rGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = rGrad;
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.lineTo(-12, -14);
  ctx.lineTo(-16, -9);
  ctx.lineTo(-16, 9);
  ctx.lineTo(-12, 14);
  ctx.closePath();
  ctx.fill();

  // Mint wing fins
  ctx.fillStyle = '#2ef2b8';
  ctx.beginPath();
  ctx.moveTo(-6, -12);
  ctx.lineTo(-18, -22);
  ctx.lineTo(-16, -6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-6, 12);
  ctx.lineTo(-18, 22);
  ctx.lineTo(-16, 6);
  ctx.closePath();
  ctx.fill();

  // Cockpit window
  ctx.fillStyle = '#064e3b';
  ctx.beginPath();
  ctx.arc(8, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Multiplier readout near rocket
  ctx.save();
  ctx.font = '900 32px sans-serif';
  ctx.fillStyle = '#2ef2b8';
  ctx.shadowColor = '#2ef2b8';
  ctx.shadowBlur = 20;
  ctx.fillText('14.82×', rx - 145, ry + 10);
  ctx.restore();

  drawBadge(ctx, 'MULTIPLAYER', '#2ef2b8', 28, 38);
  drawTitleAndSubtitle(ctx, 'CRASH', 'Orbital Rocket Flight', '#2ef2b8');
  drawVignetteAndBorder(ctx, '#2ef2b8');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// 3. BLACKJACK COVER
// ---------------------------------------------------------------------------
function generateBlackjackCover() {
  const { canvas, ctx } = createBaseCanvas('#f59e0b', '#10b981');

  function drawCard(x, y, rot, val, suit, isGold = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    const cardW = 95;
    const cardH = 142;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;

    ctx.fillStyle = isGold ? '#1a1f2c' : '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = isGold ? '#fbbf24' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = isGold ? 'rgba(251, 191, 36, 0.35)' : 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(-cardW / 2 + 6, -cardH / 2 + 6, cardW - 12, cardH - 12);

    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = isGold ? '#fbbf24' : '#ffffff';
    ctx.fillText(val, -cardW / 2 + 12, -cardH / 2 + 26);

    ctx.font = '20px sans-serif';
    ctx.fillText(suit, -cardW / 2 + 13, -cardH / 2 + 48);

    ctx.font = '38px sans-serif';
    ctx.fillText(suit, -17, 14);

    ctx.restore();
  }

  drawCard(W * 0.65, H * 0.44, -0.16, 'A', '♠', true);
  drawCard(W * 0.76, H * 0.47, 0.12, 'K', '♠', false);

  function drawChip(cx, cy, color, accent) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.ellipse(cx, cy, 38, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, cy, 26, 15, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  }

  drawChip(W * 0.42, H * 0.64, '#065f46', '#34d399');
  drawChip(W * 0.42, H * 0.58, '#b45309', '#fde047');
  drawChip(W * 0.42, H * 0.52, '#1e293b', '#94a3b8');

  drawBadge(ctx, 'TABLE GAME', '#fbbf24', 28, 38);
  drawTitleAndSubtitle(ctx, 'BLACKJACK', 'Classic 21 • Beat The Dealer', '#fbbf24');
  drawVignetteAndBorder(ctx, '#fbbf24');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// 4. KENO COVER
// ---------------------------------------------------------------------------
function generateKenoCover() {
  const { canvas, ctx } = createBaseCanvas('#00f0ff', '#8b5cf6');
  const cx = W * 0.65;
  const cy = H * 0.42;

  const ballPositions = [
    { x: cx - 80, y: cy - 40, num: '07', hit: true, col: '#2ef2b8' },
    { x: cx - 20, y: cy - 55, num: '14', hit: false, col: '#38bdf8' },
    { x: cx + 45, y: cy - 35, num: '21', hit: true, col: '#fbbf24' },
    { x: cx - 50, y: cy + 20, num: '28', hit: true, col: '#2ef2b8' },
    { x: cx + 15, y: cy + 10, num: '33', hit: false, col: '#38bdf8' },
    { x: cx + 75, y: cy + 30, num: '40', hit: true, col: '#a855f7' },
  ];

  for (const b of ballPositions) {
    ctx.save();
    ctx.translate(b.x, b.y);

    ctx.shadowColor = b.col;
    ctx.shadowBlur = b.hit ? 26 : 12;

    const bGrad = ctx.createRadialGradient(-6, -6, 2, 0, 0, 26);
    bGrad.addColorStop(0, '#ffffff');
    bGrad.addColorStop(0.32, b.col);
    bGrad.addColorStop(1, '#09101d');
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = b.hit ? '#ffffff' : b.col;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.num, 0, 1);
    ctx.restore();
  }

  // Futuristic perspective radar grid
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
  ctx.lineWidth = 1;
  for (let i = -110; i <= 110; i += 36) {
    ctx.beginPath();
    ctx.moveTo(cx + i, cy - 80);
    ctx.lineTo(cx + i, cy + 80);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 110, cy + i * 0.7);
    ctx.lineTo(cx + 110, cy + i * 0.7);
    ctx.stroke();
  }
  ctx.restore();

  drawBadge(ctx, 'LOTTERY', '#00f0ff', 28, 38);
  drawTitleAndSubtitle(ctx, 'KENO', 'Lucky Numbers Draw', '#00f0ff');
  drawVignetteAndBorder(ctx, '#00f0ff');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// 5. SLOTS COVER
// ---------------------------------------------------------------------------
function generateSlotsCover() {
  const { canvas, ctx } = createBaseCanvas('#ec4899', '#fbbf24');
  const cx = W * 0.65;
  const cy = H * 0.45;
  const reelW = 66;
  const reelH = 124;
  const gap = 12;

  // Frame
  ctx.save();
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(cx - (reelW * 3 + gap * 2) / 2 - 12, cy - reelH / 2 - 12, reelW * 3 + gap * 2 + 24, reelH + 24, 14);
  ctx.fill();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // 3 Reels: 7 7 7
  for (let i = 0; i < 3; i++) {
    const rx = cx - (reelW * 3 + gap * 2) / 2 + i * (reelW + gap);
    const ry = cy - reelH / 2;

    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(rx, ry, reelW, reelH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 22;
    ctx.font = '900 50px sans-serif';
    ctx.fillStyle = '#f43f5e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7', rx + reelW / 2, ry + reelH / 2);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('7', rx + reelW / 2, ry + reelH / 2);
    ctx.restore();
  }

  // Payline
  ctx.save();
  ctx.strokeStyle = 'rgba(46, 242, 184, 0.75)';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(cx - 130, cy);
  ctx.lineTo(cx + 130, cy);
  ctx.stroke();
  ctx.restore();

  drawBadge(ctx, 'CLASSIC', '#ec4899', 28, 38);
  drawTitleAndSubtitle(ctx, 'SLOTS', 'Vegas Cyber 777 Spins', '#ec4899');
  drawVignetteAndBorder(ctx, '#ec4899');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// 6. COINFLIP COVER
// ---------------------------------------------------------------------------
function generateCoinflipCover() {
  const { canvas, ctx } = createBaseCanvas('#fbbf24', '#2ef2b8');
  const cx = W * 0.65;
  const cy = H * 0.44;

  ctx.save();
  ctx.translate(cx, cy);

  // Motion streak
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.28)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 80, -Math.PI * 0.7, Math.PI * 0.2);
  ctx.stroke();

  // 3D coin edge
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 30;
  for (let offset = 8; offset >= 0; offset--) {
    ctx.beginPath();
    ctx.ellipse(offset * 0.8, offset * 0.8, 56, 56, 0, 0, Math.PI * 2);
    ctx.fillStyle = offset === 0 ? '#fbbf24' : '#b45309';
    ctx.fill();
  }

  // Coin face
  const coinGrad = ctx.createLinearGradient(-42, -42, 42, 42);
  coinGrad.addColorStop(0, '#fef08a');
  coinGrad.addColorStop(0.4, '#eab308');
  coinGrad.addColorStop(1, '#a16207');
  ctx.fillStyle = coinGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.fill();

  // Embossed Moonflip Crescent Logo
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(4, 0, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(11, 0, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawBadge(ctx, 'PVP & SOLO', '#fbbf24', 28, 38);
  drawTitleAndSubtitle(ctx, 'COINFLIP', 'Heads or Tails Toss', '#fbbf24');
  drawVignetteAndBorder(ctx, '#fbbf24');
  return canvas.toBuffer('image/png');
}

// Generate and write all 6 covers
console.log('Generating high-resolution clean game covers...');

fs.writeFileSync(path.join(ASSETS_DIR, 'game-mines.png'), generateMinesCover());
console.log('✓ game-mines.png');

fs.writeFileSync(path.join(ASSETS_DIR, 'game-crash.png'), generateCrashCover());
console.log('✓ game-crash.png');

fs.writeFileSync(path.join(ASSETS_DIR, 'game-blackjack.png'), generateBlackjackCover());
console.log('✓ game-blackjack.png');

fs.writeFileSync(path.join(ASSETS_DIR, 'game-keno.png'), generateKenoCover());
console.log('✓ game-keno.png');

fs.writeFileSync(path.join(ASSETS_DIR, 'game-slots.png'), generateSlotsCover());
console.log('✓ game-slots.png');

fs.writeFileSync(path.join(ASSETS_DIR, 'game-coinflip.png'), generateCoinflipCover());
console.log('✓ game-coinflip.png');

console.log('All 6 clean game covers generated successfully!');
