// Built-in renderer descriptors.
// Each renderer declares its id, name, type, requirements, and factory.

import type { RendererDescriptor } from '../types'
import { DefaultRenderer } from '@/features/player/renderers/highway/DefaultRenderer'
import { TabRenderer } from '@/features/player/renderers/tabmaster/TabRenderer'

/**
 * Highway 2D — the default canvas-based note highway renderer.
 * Minimal requirements, works everywhere.
 */
export const Highway2D: RendererDescriptor = {
  id: 'highway-2d',
  name: 'Highway 2D',
  description: 'Classic 2D canvas note highway with full feature support',
  type: 'canvas',
  requirements: {
    contextType: '2d',
  },
  createRenderer: () => new DefaultRenderer(),
}

/**
 * TabMaster — horizontal-scrolling tab notation renderer.
 * Displays fret numbers on string lines with a playback cursor.
 */
export const TabMaster: RendererDescriptor = {
  id: 'tabmaster',
  name: 'Tab',
  description: 'Guitar tablature notation with playback cursor and hit effects',
  type: 'canvas',
  requirements: {
    contextType: '2d',
  },
  createRenderer: () => new TabRenderer(),
}

/**
 * Modernway 3D — TresJS-based 3D highway scene.
 * Requires WebGL2 for Three.js rendering.
 */
export const Modernway3D: RendererDescriptor = {
  id: 'modernway-3d',
  name: 'Modernway 3D',
  description: '3D perspective highway powered by Three.js / TresJS',
  type: 'scene',
  requirements: {
    contextType: 'webgl2',
    minWidth: 480,
    minHeight: 320,
  },
  sceneComponent: () => import('@/features/player/renderers/modernway/ModernwayScene.vue'),
}

/**
 * All built-in renderer descriptors in display order.
 */
export const BUILTIN_RENDERERS: RendererDescriptor[] = [
  Highway2D,
  TabMaster,
  Modernway3D,
]
