import type { DrawContext } from '@/features/player/types';

export function drawBeats(cx: DrawContext): void {
  const { ctx, W, H, beats, currentTime, project } = cx;

  for (const beat of beats) {
    const tOff = beat.time - currentTime;
    const p = project(tOff);
    if (!p || p.scale < 0.06) continue;

    const hw = W * 0.26 * p.scale;
    const isMeasure = beat.measure >= 0;
    ctx.strokeStyle = isMeasure ? '#343450' : '#202038';
    ctx.lineWidth = isMeasure ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - hw, p.y * H);
    ctx.lineTo(W / 2 + hw, p.y * H);
    ctx.stroke();
  }
}
