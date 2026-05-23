// Renderer support checking — determines at runtime whether a renderer
// can run on the current device/browser.

import type { RendererRequirements, RendererSupportResult, RendererDescriptor } from './types'

let _webgl2Supported: boolean | null = null
let _webgpuSupported: boolean | null = null

/** Check if WebGL2 is available (cached). */
function hasWebGL2(): boolean {
  if (_webgl2Supported === null) {
    try {
      const c = document.createElement('canvas')
      _webgl2Supported = !!c.getContext('webgl2')
    } catch {
      _webgl2Supported = false
    }
  }
  return _webgl2Supported
}

/** Check if WebGPU is available (cached). */
function hasWebGPU(): boolean {
  if (_webgpuSupported === null) {
    _webgpuSupported = typeof navigator !== 'undefined' && 'gpu' in navigator
  }
  return _webgpuSupported
}

/** Check if specific WebGL2 extensions are available. */
function hasWebGLExtensions(extensions: string[]): { ok: boolean; missing: string[] } {
  if (!hasWebGL2()) return { ok: false, missing: extensions }
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (!gl) return { ok: false, missing: extensions }
    const missing = extensions.filter(ext => !gl.getExtension(ext))
    return { ok: missing.length === 0, missing }
  } catch {
    return { ok: false, missing: extensions }
  }
}

/**
 * Check whether the current platform satisfies a renderer's requirements.
 * Returns { supported: true } if all requirements are met, otherwise
 * { supported: false, reason: '...' } explaining why.
 */
export function checkRendererSupport(requirements: RendererRequirements): RendererSupportResult {
  // Context type
  if (requirements.contextType === 'webgl2' && !hasWebGL2()) {
    return { supported: false, reason: 'WebGL2 is not supported on this device' }
  }
  if (requirements.contextType === 'webgpu' && !hasWebGPU()) {
    return { supported: false, reason: 'WebGPU is not supported in this browser' }
  }

  // Viewport size
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (requirements.minWidth && vw < requirements.minWidth) {
    return { supported: false, reason: `Viewport too narrow (${vw}px < ${requirements.minWidth}px required)` }
  }
  if (requirements.minHeight && vh < requirements.minHeight) {
    return { supported: false, reason: `Viewport too short (${vh}px < ${requirements.minHeight}px required)` }
  }

  // WebGL extensions
  if (requirements.webglExtensions?.length) {
    const { ok, missing } = hasWebGLExtensions(requirements.webglExtensions)
    if (!ok) {
      return { supported: false, reason: `Missing WebGL extensions: ${missing.join(', ')}` }
    }
  }

  return { supported: true }
}

/**
 * Check support for a full descriptor (convenience wrapper).
 */
export function isRendererSupported(descriptor: RendererDescriptor): RendererSupportResult {
  return checkRendererSupport(descriptor.requirements)
}

/**
 * Filter a list of descriptors to only those supported on this platform.
 */
export function getSupportedRenderers(descriptors: RendererDescriptor[]): RendererDescriptor[] {
  return descriptors.filter(d => checkRendererSupport(d.requirements).supported)
}
