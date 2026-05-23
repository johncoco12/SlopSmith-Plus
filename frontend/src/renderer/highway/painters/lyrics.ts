// Lyrics overlay — syllable-level karaoke display with authored line breaks.

import type { Lyric } from '@/player/types';

interface ParsedWord {
  parts: Array<{ syl: Lyric; text: string; width: number }>;
  advance: number;
}

interface ParsedLine {
  words: Lyric[][];
  start: number;
  end: number;
}

// Attach parsed line data as a non-enumerable property to avoid re-parsing
// on every frame. Using a WeakMap keyed on the lyrics array itself.
const parsedLineCache = new WeakMap<Lyric[], ParsedLine[]>();

function parseLines(lyrics: Lyric[]): ParsedLine[] {
  const cached = parsedLineCache.get(lyrics);
  if (cached) return cached;

  const lines: ParsedLine[] = [];
  let line: ParsedLine | null = null;
  let word: Lyric[] | null = null;

  const flushWord = () => {
    if (word?.length) line!.words.push(word);
    word = null;
  };
  const flushLine = () => {
    flushWord();
    if (line?.words.length) lines.push(line);
    line = null;
  };

  for (let i = 0; i < lyrics.length; i++) {
    const l = lyrics[i];
    const raw = l.w ?? '';
    const endsLine = raw.endsWith('+');
    const continuesWord = raw.endsWith('-');

    if (line && i > 0) {
      const prev = lyrics[i - 1];
      if (l.t - (prev.t + prev.d) > 4.0) flushLine();
    }

    if (!line) line = { words: [], start: l.t, end: l.t + l.d };
    if (!word) word = [];

    word.push(l);
    line.end = Math.max(line.end, l.t + l.d);

    if (!continuesWord) flushWord();
    if (endsLine) flushLine();
  }
  flushLine();

  parsedLineCache.set(lyrics, lines);
  return lines;
}

function sylText(syl: Lyric): string {
  const t = syl.w ?? '';
  return t.endsWith('+') || t.endsWith('-') ? t.slice(0, -1) : t;
}

export function drawLyrics(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  lyrics: Lyric[],
  currentTime: number,
): void {
  if (!lyrics.length) return;

  const fontSize = Math.max(18, H * 0.028) | 0;
  const lineY = H * 0.04;
  const allLines = parseLines(lyrics);
  if (!allLines.length) return;

  // Find the active line.
  let currentIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].start <= currentTime) currentIdx = i;
    else break;
  }
  if (currentIdx === -1) {
    if (allLines[0].start - currentTime > 2.0) return;
    currentIdx = 0;
  }

  const currentLine = allLines[currentIdx];
  const nextLine = allLines[currentIdx + 1] ?? null;
  const gapToNext = nextLine ? nextLine.start - currentLine.end : Infinity;

  if (currentTime > currentLine.end + 0.5 && gapToNext > 3.0) return;

  const linesToShow = [currentLine];
  if (nextLine && gapToNext <= 3.0) linesToShow.push(nextLine);

  ctx.font = `bold ${fontSize}px sans-serif`;
  const spaceWidth = ctx.measureText(' ').width;
  const maxWidth = W * 0.8;

  // Wrap authored lines at maxWidth.
  const rows: ParsedWord[][] = [];
  for (const authored of linesToShow) {
    let row: ParsedWord[] = [];
    let rowWidth = 0;
    for (const wordSyls of authored.words) {
      const parts: ParsedWord['parts'] = [];
      let wordWidth = 0;
      for (const s of wordSyls) {
        const text = sylText(s);
        const w = ctx.measureText(text).width;
        parts.push({ syl: s, text, width: w });
        wordWidth += w;
      }
      const advance = wordWidth + spaceWidth;
      if (row.length > 0 && rowWidth + advance > maxWidth) {
        rows.push(row);
        row = []; rowWidth = 0;
      }
      row.push({ parts, advance });
      rowWidth += advance;
    }
    if (row.length) rows.push(row);
  }

  const rowHeight = fontSize + 6;
  const totalH = rows.length * rowHeight + 10;

  let bgWidth = 0;
  for (const row of rows) {
    const rw = row.reduce((s, w) => s + w.advance, 0) - spaceWidth;
    if (rw > bgWidth) bgWidth = rw;
  }
  bgWidth = Math.min(bgWidth + 30, W * 0.85);

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  roundRect(ctx, W / 2 - bgWidth / 2, lineY - 4, bgWidth, totalH, 8);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rowWidth = row.reduce((s, w) => s + w.advance, 0) - spaceWidth;
    let xPos = W / 2 - rowWidth / 2;
    const yPos = lineY + r * rowHeight + 2;

    for (const w of row) {
      for (const part of w.parts) {
        const l = part.syl;
        const isActive = currentTime >= l.t && currentTime < l.t + l.d;
        const isPast   = currentTime >= l.t + l.d;

        if (isActive) {
          ctx.fillStyle = '#4ae0ff';
          ctx.font = `bold ${fontSize}px sans-serif`;
        } else if (isPast) {
          ctx.fillStyle = '#8899aa';
          ctx.font = `normal ${fontSize}px sans-serif`;
        } else {
          ctx.fillStyle = '#556677';
          ctx.font = `normal ${fontSize}px sans-serif`;
        }

        ctx.fillText(part.text, xPos, yPos);
        xPos += part.width;
      }
      xPos += spaceWidth;
    }
  }
}

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
