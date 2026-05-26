// Single-note gem drawing and sustain trail rendering.

import { stringColor, stringDim, stringBright, stringColor as sc } from '../colors.js';
import { paintGemGlow } from './gemGlow.js';
import type { DrawContext, ChartNote, NoteState } from '@/features/player/types';
import { VISIBLE_SECONDS } from '@/features/player/engine/projection';

// ── Helpers ───────────────────────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function bsearch(arr: ChartNote[], time: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ── Note gem ──────────────────────────────────────────────────────────────────

interface NoteOpts {
  chord?: boolean;
}

export function drawNote(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  x: number, y: number,
  scale: number,
  string: number, fret: number,
  note: ChartNote & NoteOpts,
  ns: NoteState | null,
  fillTextReadable: (text: string, x: number, y: number) => void,
): void {
  const lit = !!(ns && ns.state !== 'miss');
  const isHarmonic = !!(note.hm || note.hp);
  const isPinchHarmonic = !!note.hp;
  const isChord = !!note.chord;
  const bend = note.bn ?? 0;
  const slide = note.sl ?? -1;
  const hammerOn = !!note.ho;
  const pullOff = !!note.po;
  const tap = !!note.tp;
  const palmMute = !!note.pm;
  const tremolo = !!note.tr;
  const accent = !!note.ac;

  const sz = Math.max(12, 80 * scale * (H / 900));
  const half = sz / 2;

  const color = lit ? (ns!.color ?? stringBright(string)) : stringColor(string);
  const dark  = lit ? stringColor(string) : stringDim(string);

  if (sz < 6) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Open string — wide bar spanning the highway.
  if (fret === 0 && !isChord) {
    const hw = W * 0.26 * scale;
    const barH = Math.max(6, sz * 0.45);
    ctx.fillStyle = dark;
    roundRect(ctx, W / 2 - hw - 1, y - barH / 2 - 1, hw * 2 + 2, barH + 2, 3);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, W / 2 - hw, y - barH / 2, hw * 2, barH, 2);
    ctx.fill();
    paintGemGlow(ctx, W / 2, y, barH * 0.5, string, ns);

    if (sz >= 14) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(8, sz * 0.5) | 0}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fillTextReadable('0', W / 2, y);

      if (hammerOn || pullOff || tap) {
        const label = tap ? 'T' : (hammerOn ? 'H' : 'P');
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(9, sz * 0.3) | 0}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        fillTextReadable(label, W / 2, y - barH / 2 - 4);
      }
      if (palmMute) {
        ctx.fillStyle = '#aaa';
        ctx.font = `bold ${Math.max(8, sz * 0.25) | 0}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        fillTextReadable('PM', W / 2, y + barH / 2 + 2);
      }
      if (tremolo) {
        drawWavyLine(ctx, W / 2, y - barH / 2 - 6, sz);
      }
      if (accent) {
        drawAccentCaret(ctx, W / 2, y - barH / 2 - 4, sz);
      }
    }
    return;
  }

  if (isHarmonic) {
    const dh = half * 1.15;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(x, y - dh - 3); ctx.lineTo(x + half + 3, y);
    ctx.lineTo(x, y + dh + 3); ctx.lineTo(x - half - 3, y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - dh); ctx.lineTo(x + half, y);
    ctx.lineTo(x, y + dh); ctx.lineTo(x - half, y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = stringBright(string);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - dh); ctx.lineTo(x + half, y);
    ctx.lineTo(x, y + dh); ctx.lineTo(x - half, y);
    ctx.closePath(); ctx.stroke();
    if (isPinchHarmonic && sz >= 14) {
      ctx.fillStyle = '#ff0';
      ctx.font = `bold ${Math.max(8, sz * 0.25) | 0}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      fillTextReadable('PH', x, y + dh + 2);
    }
  } else {
    ctx.fillStyle = dark;
    roundRect(ctx, x - half - 4, y - half - 4, sz + 8, sz + 8, sz / 3);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, x - half, y - half, sz, sz, sz / 5);
    ctx.fill();
  }

  paintGemGlow(ctx, x, y, isHarmonic ? half * 1.2 : half, string, ns);

  // Fret number.
  const fontSize = Math.max(10, sz * 0.5) | 0;
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fillTextReadable(String(fret), x, y);

  // Bend arrow.
  if (bend > 0 && sz >= 12) {
    const lw = Math.max(2, sz / 10);
    const arrowH = sz * 0.55 * Math.min(bend, 2);
    const ay = y - half - 4;
    const tipY = ay - arrowH;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, ay);
    ctx.quadraticCurveTo(x + sz * 0.2, ay - arrowH * 0.5, x, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - sz * 0.12, tipY + sz * 0.12);
    ctx.lineTo(x, tipY);
    ctx.lineTo(x + sz * 0.12, tipY + sz * 0.12);
    ctx.stroke();

    const bendLabel = bend === 0.5 ? '½' : bend === 1 ? 'full' : bend === 1.5 ? '1½' : bend === 2 ? '2' : bend.toFixed(1);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(9, sz * 0.28) | 0}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    fillTextReadable(bendLabel, x, tipY - 2);
  }

  if (sz < 14) return;

  if (slide >= 0) {
    const dir = slide > fret ? -1 : 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, sz / 10);
    ctx.beginPath();
    ctx.moveTo(x - sz * 0.3, y + dir * sz * 0.3);
    ctx.lineTo(x + sz * 0.3, y - dir * sz * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + sz * 0.3, y - dir * sz * 0.3);
    ctx.lineTo(x + sz * 0.15, y - dir * sz * 0.15);
    ctx.stroke();
  }

  if (hammerOn || pullOff || tap) {
    const label = tap ? 'T' : (hammerOn ? 'H' : 'P');
    const ly = y - half - (bend > 0 ? sz * 0.6 : 4);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(9, sz * 0.3) | 0}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    fillTextReadable(label, x, ly);
  }

  if (palmMute) {
    ctx.fillStyle = '#aaa';
    ctx.font = `bold ${Math.max(8, sz * 0.25) | 0}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    fillTextReadable('PM', x, y + half + 2);
  }

  if (tremolo) {
    drawWavyLine(ctx, x, y - half - (bend > 0 ? sz * 0.7 : 6), sz);
  }

  if (accent) {
    drawAccentCaret(ctx, x, y - half - 4, sz);
  }
}

function drawWavyLine(ctx: CanvasRenderingContext2D, cx: number, ty: number, sz: number): void {
  ctx.strokeStyle = '#ff0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = -3; i <= 3; i++) {
    const wx = cx + i * sz * 0.08;
    const wy = ty + Math.sin(i * 2) * 3;
    if (i === -3) ctx.moveTo(wx, wy);
    else ctx.lineTo(wx, wy);
  }
  ctx.stroke();
}

function drawAccentCaret(ctx: CanvasRenderingContext2D, cx: number, ay: number, sz: number): void {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - sz * 0.2, ay + 3);
  ctx.lineTo(cx, ay - 2);
  ctx.lineTo(cx + sz * 0.2, ay + 3);
  ctx.stroke();
}

// ── Sustain trails ────────────────────────────────────────────────────────────

export function drawSustains(cx: DrawContext): void {
  const { ctx, W, H, notes, currentTime, project, fretX, noteStateProvider } = cx;

  for (const n of notes) {
    const sus = n.sus ?? 0;
    if (sus <= 0.01) continue;
    const end = n.t + sus;
    if (end < currentTime || n.t > currentTime + VISIBLE_SECONDS) continue;

    const t0 = Math.max(n.t - currentTime, 0);
    const t1 = Math.min(end - currentTime, VISIBLE_SECONDS);
    if (t0 >= t1) continue;

    const p0 = project(t0);
    const p1 = project(t1);
    if (!p0 || !p1) continue;

    const x0 = fretX(n.f, p0.scale, W);
    const x1 = fretX(n.f, p1.scale, W);
    const sw0 = Math.max(2, 6 * p0.scale);
    const sw1 = Math.max(2, 6 * p1.scale);
    const y0 = p0.y * H;
    const y1 = p1.y * H;

    const ns = noteStateProvider ? resolveNoteState(noteStateProvider, n, n.t) : null;
    const litTrail = !!(ns && ns.state !== 'miss');

    if (litTrail) {
      const a = ns!.alpha;
      const col = ns!.color ?? stringBright(n.s);
      ctx.save();
      ctx.fillStyle = col;

      // Outer glow — wide trapezoid at low opacity (replaces shadowBlur)
      const gw0 = sw0 * 2.8, gw1 = sw1 * 2.8;
      ctx.globalAlpha = 0.28 * a;
      ctx.beginPath();
      ctx.moveTo(x0 - gw0, y0); ctx.lineTo(x0 + gw0, y0);
      ctx.lineTo(x1 + gw1, y1); ctx.lineTo(x1 - gw1, y1);
      ctx.closePath(); ctx.fill();

      // Core trail
      ctx.globalAlpha = 0.65 * a;
      ctx.beginPath();
      ctx.moveTo(x0 - sw0, y0); ctx.lineTo(x0 + sw0, y0);
      ctx.lineTo(x1 + sw1, y1); ctx.lineTo(x1 - sw1, y1);
      ctx.closePath(); ctx.fill();

      // Bright centre spine
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * a;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, sw0 * 0.45);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = stringDim(n.s);
      ctx.beginPath();
      ctx.moveTo(x0 - sw0, y0);
      ctx.lineTo(x0 + sw0, y0);
      ctx.lineTo(x1 + sw1, y1);
      ctx.lineTo(x1 - sw1, y1);
      ctx.fill();
    }
  }
}

// ── Note rendering ────────────────────────────────────────────────────────────

export function drawNotes(cx: DrawContext): void {
  const { ctx, W, H, notes, currentTime, project, fretX, noteStateProvider, fillTextReadable } = cx;

  const tMin = currentTime - 0.25;
  const tMax = currentTime + VISIBLE_SECONDS;
  let lo = bsearch(notes, tMin);
  let hi = bsearch(notes, tMax);

  while (lo > 0 && (notes[lo - 1].t + (notes[lo - 1].sus ?? 0)) > currentTime) lo--;

  const drawn: Array<{ t: number; s: number; f: number; bn: number; x: number; y: number; scale: number }> = [];

  for (let i = hi - 1; i >= lo; i--) {
    const n = notes[i];
    const tOff = n.t - currentTime;

    let p;
    if (tOff < -0.05 && (n.sus ?? 0) > 0 && n.t + (n.sus ?? 0) > currentTime) {
      p = { y: 0.82, scale: 1.0 };
    } else {
      p = project(tOff);
    }
    if (!p) continue;

    const x = fretX(n.f, p.scale, W);
    const ns = noteStateProvider ? resolveNoteState(noteStateProvider, n, n.t) : null;
    drawNote(ctx, W, H, x, p.y * H, p.scale, n.s, n.f, n, ns, fillTextReadable);
    drawn.push({ t: n.t, s: n.s, f: n.f, bn: n.bn ?? 0, x, y: p.y * H, scale: p.scale });
  }

  drawUnisonBends(ctx, W, H, drawn, fillTextReadable);
}

interface DrawnNote {
  t: number; s: number; f: number; bn: number;
  x: number; y: number; scale: number;
}

export function drawUnisonBends(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  drawn: DrawnNote[],
  fillTextReadable: (text: string, x: number, y: number) => void,
): void {
  const used = new Set<number>();
  for (let i = 0; i < drawn.length; i++) {
    if (used.has(i)) continue;
    const group: DrawnNote[] = [drawn[i]];
    used.add(i);
    for (let j = i + 1; j < drawn.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(drawn[j].t - drawn[i].t) < 0.01) {
        group.push(drawn[j]);
        used.add(j);
      }
    }
    if (group.length < 2) continue;

    const bent   = group.filter(n => n.bn > 0);
    const unbent = group.filter(n => n.bn === 0);
    if (!bent.length || !unbent.length) continue;

    for (const bn of bent) {
      let closest = unbent[0];
      for (const ub of unbent) {
        if (Math.abs(ub.s - bn.s) < Math.abs(closest.s - bn.s)) closest = ub;
      }
      const sz = Math.max(12, 80 * bn.scale * (H / 900));
      if (sz < 14) continue;

      const midX = (bn.x + closest.x) / 2 + sz * 0.5;
      const midY = (bn.y + closest.y) / 2;
      ctx.save();
      ctx.strokeStyle = '#60d0ff';
      ctx.lineWidth = Math.max(2, sz / 12);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(bn.x, bn.y);
      ctx.quadraticCurveTo(midX, midY, closest.x, closest.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      const labelSz = Math.max(10, sz * 0.3) | 0;
      ctx.fillStyle = '#60d0ff';
      ctx.font = `bold ${labelSz}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cpX = (bn.x + 2 * midX + closest.x) / 4;
      const cpY = (bn.y + 2 * midY + closest.y) / 4;
      fillTextReadable('U', cpX + sz * 0.3, cpY);
    }
  }
}

export function resolveNoteState(
  provider: import('../types.js').NoteStateProvider,
  note: ChartNote,
  chartTime: number,
): import('../types.js').NoteState | null {
  let raw: import('../types.js').NoteStateRaw | null | undefined | false | 0;
  try { raw = provider(note, chartTime); } catch { return null; }
  if (!raw) return null;
  const state = typeof raw === 'string' ? raw : raw.state;
  if (state !== 'hit' && state !== 'active' && state !== 'miss') return null;
  const rawObj = typeof raw === 'object' ? raw : null;
  const alpha = rawObj && Number.isFinite(rawObj.alpha) ? Math.max(0, Math.min(1, rawObj.alpha!)) : 1;
  if (alpha <= 0) return null;
  const color = rawObj && typeof rawObj.color === 'string' ? rawObj.color : null;
  return { state, alpha, color };
}
