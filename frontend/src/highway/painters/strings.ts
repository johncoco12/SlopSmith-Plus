import { stringColor } from '../colors.js';
import type { DrawContext } from '../types.js';

export function drawStrings(cx: DrawContext): void {
  const { ctx, W, H, stringCount, inverted } = cx;

  const strTop = H * 0.83;
  const strBot = H * 0.95;
  const margin = W * 0.03;
  const span = Math.max(1, stringCount - 1);

  for (let i = 0; i < stringCount; i++) {
    const yi = inverted ? (stringCount - 1 - i) : i;
    const y = strTop + (yi / span) * (strBot - strTop);
    ctx.strokeStyle = stringColor(i);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(W - margin, y);
    ctx.stroke();
  }
}

export function drawNowLine(cx: DrawContext): void {
  const { ctx, W, H } = cx;

  const y = H * 0.82;
  const hw = W * 0.26;

  // Glow layers
  for (let i = 1; i < 5; i++) {
    const a = Math.max(0, 70 - i * 15);
    ctx.strokeStyle = `rgba(${a},${a},${a + 8},1)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - hw, y - i);
    ctx.lineTo(W / 2 + hw, y - i);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2 - hw, y + i);
    ctx.lineTo(W / 2 + hw, y + i);
    ctx.stroke();
  }

  // Core line
  ctx.strokeStyle = '#dce0f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - hw, y);
  ctx.lineTo(W / 2 + hw, y);
  ctx.stroke();
}
