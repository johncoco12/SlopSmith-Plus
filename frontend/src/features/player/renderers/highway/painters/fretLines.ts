import { VISIBLE_SECONDS } from '@/features/player/engine/projection';
import type { DrawContext } from '@/features/player/types';

export function drawFretLines(cx: DrawContext): void {
  const { ctx, W, H, displayMaxFret, project, fretX } = cx;

  ctx.strokeStyle = '#2d2d45';
  ctx.lineWidth = 1;

  const hi = Math.ceil(displayMaxFret);
  for (let fret = 0; fret <= hi; fret++) {
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * VISIBLE_SECONDS;
      const p = project(t);
      if (!p) continue;
      const x = fretX(fret, p.scale, W);
      if (i === 0) ctx.moveTo(x, p.y * H);
      else ctx.lineTo(x, p.y * H);
    }
    ctx.stroke();
  }
}

export function drawFretNumbers(cx: DrawContext): void {
  const { ctx, W, H, displayMaxFret, fretX, anchors, currentTime, fillTextReadable } = cx;

  const y = H * 0.97;
  const hi = Math.ceil(displayMaxFret);

  // Find the current anchor to highlight its range in gold.
  let activeAnchor = anchors[0] ?? { time: 0, fret: 1, width: 4 };
  for (const anc of anchors) {
    if (anc.time > currentTime) break;
    activeAnchor = anc;
  }

  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let fret = 0; fret <= hi; fret++) {
    const inAnchor = fret >= activeAnchor.fret && fret <= activeAnchor.fret + activeAnchor.width;
    ctx.fillStyle = inAnchor ? '#e8c040' : '#8a6830';
    fillTextReadable(String(fret), fretX(fret, 1.0, W), y);
  }
}
