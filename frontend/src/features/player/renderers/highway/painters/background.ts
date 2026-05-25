import { VISIBLE_SECONDS } from '@/features/player/engine/projection';
import { BG } from '../colors.js';
import type { DrawContext } from '@/features/player/types';

const STRIPS = 40;

export function drawBackground(cx: DrawContext): void {
  const { ctx, W, H, project } = cx;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < STRIPS; i++) {
    const t0 = (i / STRIPS) * VISIBLE_SECONDS;
    const t1 = ((i + 1) / STRIPS) * VISIBLE_SECONDS;
    const p0 = project(t0);
    const p1 = project(t1);
    if (!p0 || !p1) continue;

    const hw0 = W * 0.26 * p0.scale;
    const hw1 = W * 0.26 * p1.scale;
    const bright = 18 + 10 * p0.scale;
    const b = bright | 0;

    ctx.fillStyle = `rgb(${b},${b},${(bright + 14) | 0})`;
    ctx.beginPath();
    ctx.moveTo(W / 2 - hw0, p0.y * H);
    ctx.lineTo(W / 2 + hw0, p0.y * H);
    ctx.lineTo(W / 2 + hw1, p1.y * H);
    ctx.lineTo(W / 2 - hw1, p1.y * H);
    ctx.fill();
  }
}
