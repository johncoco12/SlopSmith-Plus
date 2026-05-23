// Player layer — renderer-agnostic data backbone
//
// Exports the shared infrastructure that all renderers consume:
// - SongDataProvider: loads chart data, produces RenderBundle
// - RendererManager: registry + draw loop for canvas-based renderers
// - usePlayer: Vue composable that wires everything together
// - Renderer descriptors, support checking, and types

export { SongDataProvider } from './SongDataProvider'
export { RendererManager } from './RendererManager'
export { usePlayer } from './usePlayer'
export type { UsePlayerReturn } from './usePlayer'
export { resolveNoteState } from './noteState'
export { ChartClock } from './clock'
export { ChartState } from './chartState'
export { MasteryFilter } from './masteryFilter'
export { ProjectionHelper } from './projection'
export { HighwayRestClient } from './restClient'
export { HitDetector } from './hitDetection'
export { checkRendererSupport, isRendererSupported, getSupportedRenderers } from './rendererSupport'
export { Highway2D, Modernway3D, BUILTIN_RENDERERS } from './rendererDescriptors'
export type {
  HighwayApi, ConnectOptions,
  // Renderer interfaces
  CanvasRenderer, Renderer, RendererDescriptor,
  RendererType, RendererRequirements, RendererSupportResult,
  // Data types
  RenderBundle, DrawHook, NoteStateProvider, NoteState,
  ChartNote, ChartChordNote, ChartChord,
  Beat, Section, Anchor, ChordTemplate,
  Lyric, ToneChange, HandShape, SongInfo,
  DrawContext,
} from './types'
