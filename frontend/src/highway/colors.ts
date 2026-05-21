// String color palettes. Indices 0–5 = guitar/bass; 6–7 = extended-range.
// Lookups fall back to FALLBACK for any out-of-range index.

export const FALLBACK = '#888888';

export const STRING_COLORS = [
  '#cc0000', '#cca800', '#0066cc',
  '#cc6600', '#00cc66', '#9900cc',
  '#cc00aa', '#00cccc',
] as const;

export const STRING_DIM = [
  '#520000', '#524200', '#002952',
  '#522900', '#005229', '#3d0052',
  '#520042', '#005252',
] as const;

export const STRING_BRIGHT = [
  '#ff3c3c', '#ffe040', '#3c9cff',
  '#ff9c3c', '#3cff9c', '#cc3cff',
  '#ff3ce0', '#3ce0e0',
] as const;

export const BG = '#080810';

export function stringColor(s: number): string {
  return STRING_COLORS[s] ?? FALLBACK;
}

export function stringDim(s: number): string {
  return STRING_DIM[s] ?? '#222222';
}

export function stringBright(s: number): string {
  return STRING_BRIGHT[s] ?? '#ffffff';
}
