// Pure data utility — resolves hit-detection state for a note.
// Extracted from painters/notes.ts so the player layer doesn't depend on renderer code.

import type { NoteStateProvider, NoteState, NoteStateRaw, ChartNote } from '../types'

export function resolveNoteState(
  provider: NoteStateProvider,
  note: ChartNote,
  chartTime: number,
): NoteState | null {
  let raw: NoteStateRaw | null | undefined | false | 0
  try { raw = provider(note, chartTime) } catch { return null }
  if (!raw) return null
  const state = typeof raw === 'string' ? raw : raw.state
  if (state !== 'hit' && state !== 'active' && state !== 'miss') return null
  const rawObj = typeof raw === 'object' ? raw : null
  const alpha = rawObj && Number.isFinite(rawObj.alpha) ? Math.max(0, Math.min(1, rawObj.alpha!)) : 1
  if (alpha <= 0) return null
  const color = rawObj && typeof rawObj.color === 'string' ? rawObj.color : null
  return { state, alpha, color }
}
