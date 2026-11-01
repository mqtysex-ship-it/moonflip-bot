import { createCanvas } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';

// ============================================================================
// VECTOR DRAWING PRIMITIVES (100% System-Independent, Zero Missing-Font Boxes)
// ============================================================================

/**
 * Draws a faceted 3D glowing gemstone / diamond.
 */
export function drawGem(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 2;

  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 14;

  ctx.beginPath();
  ctx.moveTo(0, -s * 0.95);
  ctx.lineTo(s * 0.85, -s * 0.25);
  ctx.lineTo(s * 0.65, s * 0.85);
  ctx.lineTo(0, s * 0.95);
  ctx.lineTo(-s * 0.65, s * 0.85);
  ctx.lineTo(-s * 0.85, -s * 0.25);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, -s, 0, s);
  grad.addColorStop(0, '#a5f3fc');
  grad.addColorStop(0.3, '#38bdf8');
  grad.addColorStop(0.7, '#0284c7');
  grad.addColorStop(1, '#0369a1');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-s * 0.45, -s * 0.25);
  ctx.lineTo(0, -s * 0.95);
  ctx.lineTo(s * 0.45, -s * 0.25);
  ctx.lineTo(0, s * 0.95);
  ctx.lineTo(-s * 0.45, -s * 0.25);
  ctx.lineTo(s * 0.45, -s * 0.25);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.95);
  ctx.lineTo(s * 0.45, -s * 0.25);
  ctx.lineTo(0, -s * 0.05);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draws a dark naval bomb with brass cap and burning spark.
 */
export function drawBomb(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  const r = size * 0.36;

  ctx.shadowColor = '#f43f5e';
  ctx.shadowBlur = 10;

  ctx.beginPath();
  ctx.arc(0, r * 0.18, r, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.2, r * 0.08, 0, r * 0.18, r);
  grad.addColorStop(0, '#64748b');
  grad.addColorStop(0.4, '#1e293b');
  grad.addColorStop(1, '#090d16');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(-r * 0.22, -r * 0.85, r * 0.44, r * 0.28);

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.85);
  ctx.quadraticCurveTo(r * 0.35, -r * 1.35, r * 0.55, -r * 1.05);
  ctx.stroke();

  ctx.fillStyle = '#fef08a';
  ctx.shadowColor = '#f97316';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(r * 0.55, -r * 1.05, 3.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws an intense fiery detonation starburst.
 */
export function drawExplosion(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  const r = size * 0.44;

  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 18;

  ctx.beginPath();
  const spikes = 12;
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const angle = (i * Math.PI) / spikes;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const grad = ctx.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.2, '#fef08a');
  grad.addColorStop(0.5, '#f97316');
  grad.addColorStop(0.85, '#dc2626');
  grad.addColorStop(1, '#7f1d1d');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws an unrevealed sleek cyan-dot marker for safe hidden tiles.
 */
export function drawSafeDot(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  const r = size * 0.11;

  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 8;

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();

  ctx.restore();
}

/**
 * Draws a Vegas Lucky 7 with gold bevel and drop shadow.
 */
export function drawSeven(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size * 0.55;

  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 12;

  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.8);
  ctx.lineTo(s * 0.7, -s * 0.8);
  ctx.lineTo(s * 0.7, -s * 0.4);
  ctx.lineTo(-s * 0.05, s * 0.9);
  ctx.lineTo(-s * 0.45, s * 0.9);
  ctx.lineTo(s * 0.25, -s * 0.4);
  ctx.lineTo(-s * 0.7, -s * 0.4);
  ctx.closePath();

  const grad = ctx.createLinearGradient(-s, -s, s, s);
  grad.addColorStop(0, '#fef08a');
  grad.addColorStop(0.3, '#f59e0b');
  grad.addColorStop(0.7, '#dc2626');
  grad.addColorStop(1, '#7f1d1d');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a golden casino bell.
 */
export function drawBell(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size * 0.45;

  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 10;

  ctx.beginPath();
  ctx.moveTo(0, -s * 0.8);
  ctx.bezierCurveTo(s * 0.6, -s * 0.7, s * 0.75, s * 0.4, s * 0.85, s * 0.65);
  ctx.lineTo(-s * 0.85, s * 0.65);
  ctx.bezierCurveTo(-s * 0.75, s * 0.4, -s * 0.6, -s * 0.7, 0, -s * 0.8);
  ctx.closePath();

  const grad = ctx.createLinearGradient(-s, 0, s, 0);
  grad.addColorStop(0, '#d97706');
  grad.addColorStop(0.4, '#fef08a');
  grad.addColorStop(0.7, '#f59e0b');
  grad.addColorStop(1, '#78350f');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, s * 0.75, s * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = '#b45309';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, -s * 0.82, s * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();

  ctx.restore();
}

/**
 * Draws a purple grapes cluster.
 */
export function drawGrapes(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  const r = size * 0.14;

  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 10;

  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.35);
  ctx.quadraticCurveTo(size * 0.1, -size * 0.45, size * 0.2, -size * 0.38);
  ctx.stroke();

  const coords = [
    [-r * 1.5, -r * 0.8], [0, -r * 0.8], [r * 1.5, -r * 0.8],
    [-r * 0.8, r * 0.5], [r * 0.8, r * 0.5],
    [0, r * 1.8]
  ];

  for (const [gx, gy] of coords) {
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(gx - r * 0.3, gy - r * 0.3, r * 0.1, gx, gy, r);
    grad.addColorStop(0, '#e9d5ff');
    grad.addColorStop(0.4, '#9333ea');
    grad.addColorStop(1, '#3b0764');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draws two glossy red cherries with green stem.
 */
export function drawCherries(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  const r = size * 0.22;

  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 10;

  ctx.strokeStyle = '#16a34a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-size * 0.18, size * 0.1);
  ctx.quadraticCurveTo(-size * 0.05, -size * 0.4, size * 0.05, -size * 0.42);
  ctx.quadraticCurveTo(size * 0.15, -size * 0.4, size * 0.22, size * 0.1);
  ctx.stroke();

  const cherries = [[-size * 0.18, size * 0.22], [size * 0.22, size * 0.24]];
  for (const [x, y] of cherries) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    grad.addColorStop(0, '#fca5a5');
    grad.addColorStop(0.35, '#dc2626');
    grad.addColorStop(1, '#450a0a');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draws a golden citrus lemon slice.
 */
export function drawLemon(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  const r = size * 0.38;

  ctx.shadowColor = '#eab308';
  ctx.shadowBlur = 10;

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ca8a04';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.fillStyle = '#fef08a';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = '#eab308';
  ctx.fill();

  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * r * 0.8, Math.sin(angle) * r * 0.8);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Helper to draw any slot symbol by name/emoji.
 */
export function drawSlotSymbol(ctx, sym, cx, cy, size) {
  const str = String(sym || '');
  if (str.includes('7')) return drawSeven(ctx, cx, cy, size);
  if (str.includes('💎') || str.includes('diamond')) return drawGem(ctx, cx, cy, size);
  if (str.includes('🔔') || str.includes('bell')) return drawBell(ctx, cx, cy, size);
  if (str.includes('🍇') || str.includes('grape')) return drawGrapes(ctx, cx, cy, size);
  if (str.includes('🍒') || str.includes('cherry')) return drawCherries(ctx, cx, cy, size);
  if (str.includes('🍋') || str.includes('lemon')) return drawLemon(ctx, cx, cy, size);
  return drawGem(ctx, cx, cy, size);
}

// ============================================================================
// 1. MINES GRAPHIC BOARD CARD (5x5)
// ============================================================================

export function renderMinesCard(
  state,
  explodedIdx = null,
  won = false,
  cashedOut = false,
  gameOver = false,
  peekMode = false
) {
  const W = 540;
  const H = 615;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Cosmic dark backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(0.5, '#0b1020');
  bg.addColorStop(1, '#060813');
  ctx.fillStyle = bg;
  ctx.roundRect(0, 0, W, H, 20);
  ctx.fill();

  // Outer Neon Glow Rim
  const rimColor =
    won || cashedOut
      ? '#10b981'
      : explodedIdx !== null
      ? '#ef4444'
      : peekMode
      ? '#f59e0b'
      : '#38bdf8';
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 1.5;
  ctx.roundRect(1, 1, W - 2, H - 2, 20);
  ctx.stroke();

  // Header Banner
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';

  const headerTitle = peekMode
    ? '5x5 MINES — EXPLORATION MODE'
    : gameOver
    ? '5x5 MINES — REVEALED BOARD'
    : '5x5 MINES — HIGH-STAKES GRID';
  ctx.fillText(headerTitle, W / 2, 38);

  // Subtitle / Status text
  let statusText = '';
  let statusColor = '#38bdf8';
  const currentWin = Math.floor(state.betAmount * state.multiplier);

  if (peekMode) {
    statusText = `CASHED OUT: +${currentWin.toLocaleString()} TOKENS (${state.multiplier.toFixed(2)}x) • TEST YOUR INTUITION`;
    statusColor = '#fbbf24';
  } else if (cashedOut) {
    statusText = `CASHED OUT: +${currentWin.toLocaleString()} TOKENS (${state.multiplier.toFixed(2)}x)`;
    statusColor = '#34d399';
  } else if (won) {
    statusText = `PERFECT CLEAR! WON +${currentWin.toLocaleString()} TOKENS (${state.multiplier.toFixed(2)}x)`;
    statusColor = '#fbbf24';
  } else if (explodedIdx !== null) {
    statusText = `DETONATED! HIT BOMB ON TILE #${explodedIdx + 1} (-${state.betAmount.toLocaleString()} TOKENS)`;
    statusColor = '#f87171';
  } else if (state.revealedIndices?.size > 0) {
    statusText = `ACTIVE: ${state.multiplier.toFixed(2)}x (+${currentWin.toLocaleString()} TOKENS) • CASHOUT READY`;
    statusColor = '#34d399';
  } else {
    statusText = `SELECT ANY TILE BELOW TO UNCOVER GEMS • BOMBS: ${state.bombs}/25`;
    statusColor = '#38bdf8';
  }

  ctx.fillStyle = statusColor;
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(statusText, W / 2, 60);

  // 5x5 Tile Grid
  const startX = 35;
  const startY = 82;
  const tileSize = 80;
  const gap = 16;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      const x = startX + c * (tileSize + gap);
      const y = startY + r * (tileSize + gap);

      const isExploded = idx === explodedIdx;
      const isRevealedGem = state.revealedIndices?.has(idx);

      // In peek mode: player can click to peek hidden tiles
      const isPeekRevealed = peekMode && state.peekRevealed?.has(idx);
      const isPeekBomb = isPeekRevealed && state.bombIndices?.has(idx);
      const isPeekGem = isPeekRevealed && !state.bombIndices?.has(idx);

      // In game over: reveal all bombs!
      const showAllBombs = gameOver && !peekMode;
      const isBomb = showAllBombs ? state.bombIndices?.has(idx) : false;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, tileSize, tileSize, 12);

      if (isExploded || isPeekBomb) {
        ctx.fillStyle = '#450a0a';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 12;
      } else if (isRevealedGem || isPeekGem) {
        ctx.fillStyle = '#064e3b';
        ctx.strokeStyle = isRevealedGem ? '#10b981' : '#38bdf8';
        ctx.lineWidth = 2;
        ctx.shadowColor = isRevealedGem ? '#10b981' : '#38bdf8';
        ctx.shadowBlur = 10;
      } else if (isBomb) {
        ctx.fillStyle = '#270e17';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1.5;
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
      }

      ctx.fill();
      ctx.stroke();
      ctx.restore();

      const cx = x + tileSize / 2;
      const cy = y + tileSize / 2;

      if (isExploded || isPeekBomb) {
        drawExplosion(ctx, cx, cy, tileSize * 0.7);
      } else if (isRevealedGem || isPeekGem) {
        drawGem(ctx, cx, cy, tileSize * 0.58);
      } else if (isBomb) {
        drawBomb(ctx, cx, cy, tileSize * 0.56);
      } else {
        drawSafeDot(ctx, cx, cy, tileSize * 0.5);
      }
    }
  }

  // Bottom Legend Bar with clean non-overlapping spacing
  const legendY = 582;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';

  const legendItems = gameOver || peekMode
    ? [
        { label: 'Found Gem', draw: (ctx, x, y) => drawGem(ctx, x, y, 16), x: 30 },
        { label: 'Detonated', draw: (ctx, x, y) => drawExplosion(ctx, x, y, 16), x: 155 },
        { label: 'Hidden Bomb', draw: (ctx, x, y) => drawBomb(ctx, x, y, 16), x: 275 },
        { label: 'Safe Tile', draw: (ctx, x, y) => drawSafeDot(ctx, x, y, 16), x: 400 },
      ]
    : [
        { label: 'Uncovered Gem', draw: (ctx, x, y) => drawGem(ctx, x, y, 16), x: 40 },
        { label: 'Hidden Tile', draw: (ctx, x, y) => drawSafeDot(ctx, x, y, 16), x: 190 },
        { label: `${state.bombs} Mines Active`, draw: (ctx, x, y) => drawBomb(ctx, x, y, 16), x: 340 },
      ];

  legendItems.forEach((item) => {
    item.draw(ctx, item.x + 8, legendY - 4);
    ctx.fillText(item.label, item.x + 22, legendY);
  });

  return canvas.toBuffer('image/png');
}

export function buildMinesAttachment(
  state,
  explodedIdx = null,
  won = false,
  cashedOut = false,
  gameOver = false,
  peekMode = false
) {
  const buf = renderMinesCard(state, explodedIdx, won, cashedOut, gameOver, peekMode);
  return new AttachmentBuilder(buf, { name: 'mines_result.png' });
}

// ============================================================================
// 2. SLOTS CABINET GRAPHIC CARD
// ============================================================================

export function renderSlotsCard(reels, multiplier = 0, won = false, isJackpot = false, marquee = 'VEGAS GRAND SLOTS', ledText = '') {
  const W = 560;
  const H = 450;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Luxury Dark Casino Cabinet
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1e1b4b');
  bg.addColorStop(0.3, '#0f172a');
  bg.addColorStop(1, '#020617');
  ctx.fillStyle = bg;
  ctx.roundRect(0, 0, W, H, 20);
  ctx.fill();

  ctx.strokeStyle = isJackpot ? '#f59e0b' : won ? '#10b981' : '#6366f1';
  ctx.lineWidth = 2.5;
  ctx.roundRect(2, 2, W - 4, H - 4, 20);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(marquee, W / 2, 40);

  const reelW = 140;
  const reelH = 260;
  const reelGap = 20;
  const startX = (W - (reelW * 3 + reelGap * 2)) / 2;
  const startY = 65;

  const [r1, r2, r3] = reels;
  const reelCols = [r1, r2, r3];

  for (let i = 0; i < 3; i++) {
    const rx = startX + i * (reelW + reelGap);
    const ry = startY;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rx, ry, reelW, reelH, 14);
    ctx.fillStyle = '#0b0f19';
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`REEL 0${i + 1}`, rx + reelW / 2, ry + 22);

    const colSymbols = reelCols[i] || ['🔔', '7️⃣', '🔔'];
    const rowH = 70;
    const symStartY = ry + 40;

    for (let row = 0; row < 3; row++) {
      const sym = colSymbols[row];
      const cx = rx + reelW / 2;
      const cy = symStartY + row * rowH + rowH / 2;

      if (row === 1) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rx + 6, cy - rowH / 2 + 4, reelW - 12, rowH - 8, 8);
        ctx.fillStyle = won ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.12)';
        ctx.strokeStyle = won ? '#10b981' : '#6366f1';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      drawSlotSymbol(ctx, sym, cx, cy, 62);
    }
  }

  const paylineY = startY + 40 + 70 + 35;
  ctx.fillStyle = won ? '#34d399' : '#f59e0b';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('>>', startX - 16, paylineY + 7);
  ctx.fillText('<<', startX + reelW * 3 + reelGap * 2 + 16, paylineY + 7);

  const ledY = startY + reelH + 20;
  const ledW = W - 70;
  const ledH = 46;
  const ledX = 35;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ledX, ledY, ledW, ledH, 10);
  ctx.fillStyle = '#05070e';
  ctx.fill();
  ctx.strokeStyle = won ? '#059669' : '#334155';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = isJackpot ? '#fbbf24' : won ? '#34d399' : '#94a3b8';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(ledText || (won ? 'WINNING PAYLINE DETECTED!' : 'NO COMBINATION — TRY AGAIN!'), W / 2, ledY + 28);

  return canvas.toBuffer('image/png');
}

export function buildSlotsAttachment(reels, multiplier = 0, won = false, isJackpot = false, marquee = 'VEGAS GRAND SLOTS', ledText = '') {
  const buf = renderSlotsCard(reels, multiplier, won, isJackpot, marquee, ledText);
  return new AttachmentBuilder(buf, { name: 'slots_result.png' });
}

// ============================================================================
// 3. COINFLIP ARENA GRAPHIC CARD
// ============================================================================

export function renderCoinflipCard(choice, outcome, won, wager, payout) {
  const W = 520;
  const H = 340;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#061325');
  bg.addColorStop(0.6, '#0b1329');
  bg.addColorStop(1, '#050714');
  ctx.fillStyle = bg;
  ctx.roundRect(0, 0, W, H, 20);
  ctx.fill();

  ctx.strokeStyle = won ? '#10b981' : '#f43f5e';
  ctx.lineWidth = 2;
  ctx.roundRect(2, 2, W - 4, H - 4, 20);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`COIN LANDED ON: ${outcome.toUpperCase()}`, W / 2, 42);

  const cx = W / 2;
  const cy = H / 2 - 10;
  const r = 62;

  ctx.save();
  ctx.shadowColor = won ? '#10b981' : '#f59e0b';
  ctx.shadowBlur = 22;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const coinGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  coinGrad.addColorStop(0, '#fef08a');
  coinGrad.addColorStop(0.3, '#f59e0b');
  coinGrad.addColorStop(0.7, '#d97706');
  coinGrad.addColorStop(1, '#78350f');
  ctx.fillStyle = coinGrad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  const faceGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r * 0.82);
  faceGrad.addColorStop(0, '#fef08a');
  faceGrad.addColorStop(0.5, '#f59e0b');
  faceGrad.addColorStop(1, '#b45309');
  ctx.fillStyle = faceGrad;
  ctx.fill();

  if (outcome === 'heads') {
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(cx - 2, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(cx + 10, cy - 4, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.4);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.1);
    ctx.lineTo(cx + r * 0.2, cy + r * 0.4);
    ctx.lineTo(cx, cy + r * 0.2);
    ctx.lineTo(cx - r * 0.2, cy + r * 0.4);
    ctx.lineTo(cx - r * 0.5, cy + r * 0.1);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(outcome.toUpperCase(), cx, cy + r + 24);

  const bannerY = H - 52;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(30, bannerY, W - 60, 38, 8);
  ctx.fillStyle = won ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)';
  ctx.strokeStyle = won ? '#10b981' : '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = won ? '#34d399' : '#f87171';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    won ? `VICTORY! +${payout.toLocaleString()} TOKENS CREDITED (2.00x)` : `DEFEAT! LOST -${wager.toLocaleString()} TOKENS`,
    W / 2,
    bannerY + 24
  );

  return canvas.toBuffer('image/png');
}

export function buildCoinflipAttachment(choice, outcome, won, wager, payout) {
  const buf = renderCoinflipCard(choice, outcome, won, wager, payout);
  return new AttachmentBuilder(buf, { name: 'coinflip_result.png' });
}

// ============================================================================
// 4. KENO 4x5 NUMBER CARD
// ============================================================================

export function renderKenoCard(playerPicksSet, drawnSet, hits = 0, multiplier = 0, winAmount = 0, wager = 100) {
  const W = 520;
  const H = 450;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#111827');
  bg.addColorStop(0.5, '#0b0f19');
  bg.addColorStop(1, '#030712');
  ctx.fillStyle = bg;
  ctx.roundRect(0, 0, W, H, 20);
  ctx.fill();

  const won = winAmount > 0;
  ctx.strokeStyle = won ? '#10b981' : '#3b82f6';
  ctx.lineWidth = 2;
  ctx.roundRect(2, 2, W - 4, H - 4, 20);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`KENO — ${hits}/${playerPicksSet.size} MATCHED`, W / 2, 40);

  ctx.fillStyle = won ? '#34d399' : '#94a3b8';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(
    won ? `MATCHED ${hits}/${playerPicksSet.size} NUMBERS! PAYOUT: +${winAmount.toLocaleString()} TOKENS (${multiplier}x)` : `NO LUCK! ${hits}/${playerPicksSet.size} MATCHED • LOST -${wager.toLocaleString()} TOKENS`,
    W / 2,
    62
  );

  const startX = 40;
  const startY = 85;
  const ballSize = 68;
  const gap = 20;

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const num = r * 5 + c + 1;
      const x = startX + c * (ballSize + gap);
      const y = startY + r * (ballSize + gap);
      const cx = x + ballSize / 2;
      const cy = y + ballSize / 2;

      const isPick = playerPicksSet.has(num);
      const isDrawn = drawnSet.has(num);
      const isHit = isPick && isDrawn;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, ballSize, ballSize, 12);

      if (isHit) {
        ctx.fillStyle = '#3b2505';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 12;
      } else if (isPick) {
        ctx.fillStyle = '#0f2942';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
      } else if (isDrawn) {
        ctx.fillStyle = '#221526';
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.5;
      } else {
        ctx.fillStyle = '#111827';
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 1.5;
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      const br = ballSize * 0.35;
      ctx.arc(cx, cy, br, 0, Math.PI * 2);

      if (isHit) {
        const bgGrad = ctx.createRadialGradient(cx - br * 0.3, cy - br * 0.3, br * 0.1, cx, cy, br);
        bgGrad.addColorStop(0, '#fef08a');
        bgGrad.addColorStop(0.5, '#f59e0b');
        bgGrad.addColorStop(1, '#b45309');
        ctx.fillStyle = bgGrad;
        ctx.fill();
        ctx.fillStyle = '#000000';
      } else if (isPick) {
        const bgGrad = ctx.createRadialGradient(cx - br * 0.3, cy - br * 0.3, br * 0.1, cx, cy, br);
        bgGrad.addColorStop(0, '#bae6fd');
        bgGrad.addColorStop(0.5, '#0284c7');
        bgGrad.addColorStop(1, '#075985');
        ctx.fillStyle = bgGrad;
        ctx.fill();
        ctx.fillStyle = '#ffffff';
      } else if (isDrawn) {
        const bgGrad = ctx.createRadialGradient(cx - br * 0.3, cy - br * 0.3, br * 0.1, cx, cy, br);
        bgGrad.addColorStop(0, '#f3e8ff');
        bgGrad.addColorStop(0.5, '#9333ea');
        bgGrad.addColorStop(1, '#581c87');
        ctx.fillStyle = bgGrad;
        ctx.fill();
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = '#1f2937';
        ctx.fill();
        ctx.fillStyle = '#6b7280';
      }

      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num).padStart(2, '0'), cx, cy + 1);
      ctx.restore();
    }
  }

  return canvas.toBuffer('image/png');
}

export function buildKenoAttachment(playerPicksSet, drawnSet, hits = 0, multiplier = 0, winAmount = 0, wager = 100) {
  const buf = renderKenoCard(playerPicksSet, drawnSet, hits, multiplier, winAmount, wager);
  return new AttachmentBuilder(buf, { name: 'keno_result.png' });
}
