export { Highway } from './Highway.js';
export { useHighway } from './useHighway.js';
export { DefaultRenderer } from './DefaultRenderer.js';

// Re-export from player layer for convenience
export { SongDataProvider, RendererManager } from '@/player';
export type {
  HighwayApi, ConnectOptions, Renderer, RenderBundle,
  DrawHook, NoteStateProvider, NoteState,
  ChartNote, ChartChordNote, ChartChord,
  Beat, Section, Anchor, ChordTemplate,
  Lyric, ToneChange, HandShape, SongInfo,
} from '@/player/types';
