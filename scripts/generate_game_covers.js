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

  // Background deep gradient
  const bgGrad = ctx.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H / 2, W * 0.7);
  bgGrad.addColorStop(0, '#101926');
  bgGrad.addColorStop(0.5, '#0a0f18');
  bgGrad.addColorStop(1, '#05070c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle isometric / perspective grid in background
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
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

  // Ambient central glow
  ctx.save();
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.45, 10, W * 0.5, H * 0.45, 220);
  glow.addColorStop(0, themeColor + '33');
  glow.addColorStop(0.6, secondaryColor + '15');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  return { canvas, ctx };
}

function drawVignetteAndBorder(ctx, themeColor) {
  // Vignette overlay
  const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.65);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(5, 7, 12, 0.85)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Modern border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Top highlight edge
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

function drawBadge(ctx, text, color, x = 28, y = 34) {
  ctx.save();
  ctx.font = 'bold 12px sans-serif';
  const textWidth = ctx.measureText(text).width;
  const padX = 10;
  const padY = 5;
  const badgeW = textWidth + padX * 2;
  const badgeH = 22;

  // Badge background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.roundRect(x, y - 14, badgeW, badgeH, 6);
  ctx.fill();

  ctx.strokeStyle = color + '88';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Glow dot
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x + 10, y - 3, 3, 0, Math.PI * 2);
  ctx.fill();

  // Text
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x + 18, y);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 1. MINES COVER
// ---------------------------------------------------------------------------
function generateMinesCover() {
  const { canvas, ctx } = createBaseCanvas('#2ef2b8', '#00f0ff');

  // Draw 5x5 Grid representation in perspective
  const cx = W / 2;
  const cy = H / 2 - 10;

  // Draw 5x5 isometric tiles
  const rows = 5;
  const cols = 5;
  const tileW = 54;
  const tileH = 34;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isoX = cx + (c - r) * (tileW * 0.52);
      const isoY = cy - 20 + (c + r) * (tileH * 0.55);

      // Determine tile state for visual variety
      const isGem = (r === 1 && c === 2) || (r === 2 && c === 1) || (r === 3 && c === 3) || (r === 0 && c === 4);
      const isBomb = (r === 3 && c === 0) || (r === 1 && c === 4);

      ctx.save();
      ctx.translate(isoX, isoY);

      // Diamond tile shape
      ctx.beginPath();
      ctx.moveTo(0, -tileH / 2);
      ctx.lineTo(tileW / 2, 0);
      ctx.lineTo(0, tileH / 2);
      ctx.lineTo(-tileW / 2, 0);
      ctx.closePath();

      if (isGem) {
        ctx.fillStyle = 'rgba(46, 242, 184, 0.22)';
        ctx.strokeStyle = '#2ef2b8';
        ctx.lineWidth = 1.6;
        ctx.shadowColor = '#2ef2b8';
        ctx.shadowBlur = 12;
      } else if (isBomb) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
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

      // Gem or bomb icon on top
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

  // Large center glowing emerald gem
  ctx.save();
  ctx.shadowColor = '#2ef2b8';
  ctx.shadowBlur = 32;
  const gemGrad = ctx.createLinearGradient(cx - 30, cy - 80, cx + 30, cy);
  gemGrad.addColorStop(0, '#ffffff');
  gemGrad.addColorStop(0.3, '#2ef2b8');
  gemGrad.addColorStop(1, '#059669');
  ctx.fillStyle = gemGrad;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 85);
  ctx.lineTo(cx + 34, cy - 50);
  ctx.lineTo(cx + 22, cy - 10);
  ctx.lineTo(cx - 22, cy - 10);
  ctx.lineTo(cx - 34, cy - 50);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  drawBadge(ctx, 'PROVABLY FAIR • 98.5% RTP', '#2ef2b8', 28, 42);

  // Title and subtitle
  ctx.save();
  ctx.font = '900 36px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('MINES', 30, H - 54);

  ctx.font = '600 14px sans-serif';
  ctx.fillStyle = '#2ef2b8';
  ctx.fillText('5×5 Dynamic Grid • Safe Gems Multiplier', 30, H - 28);
  ctx.restore();

  drawVignetteAndBorder(ctx, '#2ef2b8');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// 2. CRASH COVER
// ---------------------------------------------------------------------------
function generateCrashCover() {
  const { canvas, ctx } = createBaseCanvas('#2ef2b8', '#3b82f6');

  // Draw exponential curved ascent line
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(60, H - 70);
  ctx.bezierCurveTo(W * 0.4, H - 75, W * 0.65, H * 0.6, W * 0.76, H * 0.28);
  ctx.strokeStyle = '#2ef2b8';
  ctx.lineWidth = 4;
  ctx.shadowColor = '#2ef2b8';
  ctx.shadowBlur = 24;
  ctx.stroke();

  // Glow under the curve
  ctx.lineTo(W * 0.76, H - 70);
  ctx.lineTo(60, H - 70);
  ctx.closePath();
  const fillGrad = ctx.createLinearGradient(0, H * 0.28, 0, H - 70);
  fillGrad.addColorStop(0, 'rgba(46, 242, 184, 0.25)');
  fillGrad.addColorStop(1, 'rgba(46, 242, 184, 0.0)');
  ctx.fillStyle = fillGrad;
  ctx.fill();
  ctx.restore();

  // Draw stylized rocket at the tip of the curve
  const rx = W * 0.76;
  const ry = H * 0.28;
  const angle = -0.65; // ~37 degrees up

  ctx.save();
  ctx.translate(rx, ry);
  ctx.rotate(angle);

  // Rocket exhaust flame
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 28;
  const flameGrad = ctx.createLinearGradient(-35, 0, -8, 0);
  flameGrad.addColorStop(0, 'rgba(251, 191, 36, 0)');
  flameGrad.addColorStop(0.5, '#f59e0b');
  flameGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.moveTo(-10, -7);
  ctx.lineTo(-44, 0);
  ctx.lineTo(-10, 7);
  ctx.closePath();
  ctx.fill();

  // Rocket body
  ctx.shadowColor = '#2ef2b8';
  ctx.shadowBlur = 18;
  const rGrad = ctx.createLinearGradient(-15, 0, 32, 0);
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
  ctx.font = '900 28px sans-serif';
  ctx.fillStyle = '#2ef2b8';
  ctx.shadowColor = '#2ef2b8';
  ctx.shadowBlur = 16;
  ctx.fillText('14.82×', rx - 140, ry + 10);
  ctx.restore();

  drawBadge(ctx, '24/7 MULTIPLAYER • 60 FPS', '#2ef2b8', 28, 42);

  // Title and subtitle
  ctx.save();
  ctx.font = '900 36px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('CRASH', 30, H - 54);

  ctx.font = '600 14px sans-serif';
  ctx.fillStyle = '#2ef2b8';
  ctx.fillText('Continuous Orbital Flight • Cash Out Before Supernova', 30, H - 28);
  ctx.restore();

  drawVignetteAndBorder(ctx, '#2ef2b8');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// 3. BLACKJACK COVER
// ---------------------------------------------------------------------------
function generateBlackjackCover() {
  const { canvas, ctx } = createBaseCanvas('#f59e0b', '#10b981');

  // Draw 2 Playing Cards (Ace of Spades + King of Spades)
  function drawCard(x, y, rot, val, suit, isGold = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    const cardW = 90;
    const cardH = 135;

    // Card shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;

    // Card background
    ctx.fillStyle = isGold ? '#1a1f2c' : '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
    ctx.fill();

    // Card border
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isGold ? '#fbbf24' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner foil border
    ctx.strokeStyle = isGold ? 'rgba(251, 191, 36, 0.35)' : 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(-cardW / 2 + 6, -cardH / 2 + 6, cardW - 12, cardH - 12);

    // Value and Suit
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = isGold ? '#fbbf24' : '#ffffff';
    ctx.fillText(val, -cardW / 2 + 12, -cardH / 2 + 26);

    ctx.font = '20px sans-serif';
    ctx.fillText(suit, -cardW / 2 + 13, -cardH / 2 + 48);

    // Big central emblem
    ctx.font = '36px sans-serif';
    ctx.fillText(suit, -16, 12);

    ctx.restore();
  }

  // Draw two overlapping cards
  drawCard(W * 0.65, H * 0.44, -0.16, 'A', '♠', true);
  drawCard(W * 0.75, H * 0.47, 0.12, 'K', '♠', false);

  // Casino Chips stack
  function drawChip(cx, cy, color, accent) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

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

  drawBadge(ctx, 'CASINO CLASSIC • 99.5% RTP', '#fbbf24', 28, 42);

  // Title and subtitle
  ctx.save();
  ctx.font = '900 36px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('BLACKJACK', 30, H - 54);

  ctx.font = '600 14px sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('Beat The Dealer • Double Down • 3:2 Natural Payout', 30, H - 28);
  ctx.restore();

  drawVignetteAndBorder(ctx, '#fbbf24');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// 4. KENO COVER
// ---------------------------------------------------------------------------
function generateKenoCover() {
  const { canvas, ctx } = createBaseCanvas('#00f0ff', '#8b5cf6');

  // Holographic 40-Ball Matrix in perspective
  const cx = W * 0.65;
  const cy = H * 0.42;

  // Draw glowing lottery balls
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
    ctx.shadowBlur = b.hit ? 24 : 12;

    const bGrad = ctx.createRadialGradient(-6, -6, 2, 0, 0, 24);
    bGrad.addColorStop(0, '#ffffff');
    bGrad.addColorStop(0.3, b.col);
    bGrad.addColorStop(1, '#09101d');
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = b.hit ? '#ffffff' : b.col;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.num, 0, 1);
    ctx.restore();
  }

  // Draw matrix grid backdrop behind orbs
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

  drawBadge(ctx, '20-BALL DRAW • UP TO 1,000×', '#00f0ff', 28, 42);

  // Title and subtitle
  ctx.save();
  ctx.font = '900 36px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('KENO', 30, H - 54);

  ctx.font = '600 14px sans-serif';
  ctx.fillStyle = '#00f0ff';
  ctx.fillText('40-Number Matrix • Custom Risk Multipliers', 30, H - 28);
  ctx.restore();

  drawVignetteAndBorder(ctx, '#00f0ff');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// 5. SLOTS COVER
// ---------------------------------------------------------------------------
function generateSlotsCover() {
  const { canvas, ctx } = createBaseCanvas('#ec4899', '#fbbf24');

  // 3-Reel Slots Window
  const cx = W * 0.65;
  const cy = H * 0.45;
  const reelW = 64;
  const reelH = 120;
  const gap = 12;

  // Frame backdrop
  ctx.save();
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 24;
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

    // Bold glowing Neon 7
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 20;
    ctx.font = '900 48px sans-serif';
    ctx.fillStyle = '#f43f5e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7', rx + reelW / 2, ry + reelH / 2);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('7', rx + reelW / 2, ry + reelH / 2);
    ctx.restore();
  }

  // Marquee Payline Bar
  ctx.save();
  ctx.strokeStyle = 'rgba(46, 242, 184, 0.7)';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(cx - 130, cy);
  ctx.lineTo(cx + 130, cy);
  ctx.stroke();
  ctx.restore();

  drawBadge(ctx, 'PROGRESSIVE JACKPOT • 500×', '#ec4899', 28, 42);

  // Title and subtitle
  ctx.save();
  ctx.font = '900 36px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('SLOTS', 30, H - 54);

  ctx.font = '600 14px sans-serif';
  ctx.fillStyle = '#ec4899';
  ctx.fillText('Vegas Cyber 777 • Diamonds & Wild Moons', 30, H - 28);
  ctx.restore();

  drawVignetteAndBorder(ctx, '#ec4899');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// 6. COINFLIP COVER
// ---------------------------------------------------------------------------
function generateCoinflipCover() {
  const { canvas, ctx } = createBaseCanvas('#fbbf24', '#2ef2b8');

  // 3D Spinning Gold & Mint Coin
  const cx = W * 0.65;
  const cy = H * 0.44;

  ctx.save();
  ctx.translate(cx, cy);

  // Dynamic motion blur streak
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.25)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 78, -Math.PI * 0.7, Math.PI * 0.2);
  ctx.stroke();

  // 3D coin edge
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 28;
  for (let offset = 8; offset >= 0; offset--) {
    ctx.beginPath();
    ctx.ellipse(offset * 0.8, offset * 0.8, 54, 54, 0, 0, Math.PI * 2);
    ctx.fillStyle = offset === 0 ? '#fbbf24' : '#b45309';
    ctx.fill();
  }

  // Coin face gradient
  const coinGrad = ctx.createLinearGradient(-40, -40, 40, 40);
  coinGrad.addColorStop(0, '#fef08a');
  coinGrad.addColorStop(0.4, '#eab308');
  coinGrad.addColorStop(1, '#a16207');
  ctx.fillStyle = coinGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 50, 0, Math.PI * 2);
  ctx.fill();

  // Embossed Moonflip Crescent Logo on coin
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(4, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(10, 0, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  drawBadge(ctx, 'INSTANT 1.96× • 50/50 ODDS', '#fbbf24', 28, 42);

  // Title and subtitle
  ctx.save();
  ctx.font = '900 36px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('COINFLIP', 30, H - 54);

  ctx.font = '600 14px sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('High-Speed 50/50 Toss • Heads or Tails PvP', 30, H - 28);
  ctx.restore();

  drawVignetteAndBorder(ctx, '#fbbf24');
  return canvas.toBuffer('image/png');
}

// Generate all 6 covers
console.log('Generating high-resolution game covers...');

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

console.log('All 6 game covers generated successfully!');
