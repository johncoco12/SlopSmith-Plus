// Judgment glow effects on note gems (slopsmith#254).
// Called after the gem body is drawn so glows layer on top and the
// fret number can still be drawn above everything.

import { stringBright } from '../colors.js';
import type { NoteState } from '../types.js';

export function paintGemGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  stringIdx: number,
  ns: NoteState | null,
): void {
  if (!ns) return;

  ctx.save();

  if (ns.state === 'miss') {
    ctx.globalAlpha = 0.4 * ns.alpha;
    ctx.fillStyle = '#ff2828';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const col = ns.color ?? stringBright(stringIdx);
  const a = ns.alpha;
  const nowMs = performance.now();

  ctx.lineCap = 'round';

  // Expanding shockwave — only on a decaying struck note, not a held sustain.
  if (ns.state === 'hit' && a < 1) {
    const prog = 1 - a;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.85;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1.5, r * 0.26 * a);
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1.0 + prog * 2.7), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Throbbing halo (≈9 Hz wobble).
  const pulse = 0.8 + 0.2 * Math.sin(nowMs / 18);
  const haloR = r * 2.0 * pulse;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.30, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Crackling sparks.
  for (let i = 0; i < 6; i++) {
    if (Math.random() > 0.55 * a + 0.2) continue;
    const ang = Math.random() * Math.PI * 2;
    const inR = r * 0.45;
    const len = r * (0.7 + Math.random() * 1.6) * (0.5 + 0.5 * a);
    ctx.globalAlpha = a * (0.45 + Math.random() * 0.55);
    ctx.strokeStyle = Math.random() < 0.5 ? '#ffffff' : col;
    ctx.lineWidth = Math.max(1, r * (0.08 + Math.random() * 0.08));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * inR, cy + Math.sin(ang) * inR);
    ctx.lineTo(cx + Math.cos(ang) * (inR + len), cy + Math.sin(ang) * (inR + len));
    ctx.stroke();
  }

  // Flickering white-hot core.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * (0.55 + Math.random() * 0.45);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r * (0.30 + Math.random() * 0.14), 0, Math.PI * 2);
  ctx.fill();

  // Crisp bright rim.
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a;
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(2, r * 0.2);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
