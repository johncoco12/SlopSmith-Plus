// Manages the active canvas renderer lifecycle: install, canvas context-type
// swapping, failure auto-revert, visibility tracking, and the rAF draw loop.
//
// Uses RendererDescriptor for metadata, requirements checking, and typed factories.
// Only manages canvas-type renderers; scene-type renderers (TresJS) are handled
// by PlayerCanvas via their Vue component lifecycle.

import type { CanvasRenderer, DrawHook, RenderBundle, RendererDescriptor, RendererSupportResult } from './types';
import { checkRendererSupport } from './rendererSupport';
import { DefaultRenderer } from '@/renderer/highway/DefaultRenderer';

const MAX_DRAW_FAILURES = 3;

type EmitFn = (event: string, detail?: unknown) => void;

export class RendererManager {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: CanvasRenderer | null = null;
  private defaultRenderer: DefaultRenderer;
  private rendererInited = false;
  private drawFailures = 0;
  private currentContextType: '2d' | 'webgl2' = '2d';
  private visibleOverride: boolean | null = null;
  private lastVisible: boolean | null = null;
  private animFrame: number | null = null;
  private hooks: DrawHook[] = [];
  private emit: EmitFn;

  // ── Descriptor registry ───────────────────────────────────────────────
  private descriptors = new Map<string, RendererDescriptor>();
  private instances = new Map<string, CanvasRenderer>();
  private _activeId: string = 'highway-2d';

  constructor(emit: EmitFn) {
    this.emit = emit;
    this.defaultRenderer = new DefaultRenderer();
    this.defaultRenderer.setHooks(this.hooks);
    this.renderer = this.defaultRenderer;
  }

  // ── Registry API ──────────────────────────────────────────────────────

  /** Register a renderer descriptor. Only canvas-type descriptors are managed here. */
  register(descriptor: RendererDescriptor): void {
    this.descriptors.set(descriptor.id, descriptor);
    this.emit('renderer:registered', { id: descriptor.id, name: descriptor.name });
  }

  /** Remove a registered renderer. If active, reverts to default. */
  unregister(id: string): void {
    if (!this.descriptors.has(id)) return;
    if (this._activeId === id) {
      this.switchTo('highway-2d');
    }
    this.descriptors.delete(id);
    this.instances.delete(id);
    this.emit('renderer:unregistered', { id });
  }

  /** Get a registered descriptor by id. */
  getDescriptor(id: string): RendererDescriptor | undefined {
    return this.descriptors.get(id);
  }

  /** List all registered descriptors. */
  getRegisteredDescriptors(): RendererDescriptor[] {
    return [...this.descriptors.values()];
  }

  /** List only canvas-type descriptors (those this manager can drive). */
  getCanvasDescriptors(): RendererDescriptor[] {
    return [...this.descriptors.values()].filter(d => d.type === 'canvas');
  }

  /** Check if a specific renderer is supported on this platform. */
  checkSupport(id: string): RendererSupportResult {
    const desc = this.descriptors.get(id);
    if (!desc) return { supported: false, reason: `Unknown renderer: ${id}` };
    return checkRendererSupport(desc.requirements);
  }

  /**
   * Switch to a canvas renderer by descriptor id.
   * Returns the support result — if unsupported, switch is rejected.
   */
  switchTo(id: string): RendererSupportResult {
    // Default / fallback
    if (id === 'highway-2d' || id === 'default') {
      this._activeId = 'highway-2d';
      this._setCanvasRenderer(null);
      this.emit('renderer:switched', { id: 'highway-2d' });
      return { supported: true };
    }

    const desc = this.descriptors.get(id);
    if (!desc) {
      return { supported: false, reason: `No renderer registered with id '${id}'` };
    }
    if (desc.type !== 'canvas') {
      return { supported: false, reason: `Renderer '${id}' is type '${desc.type}', not managed by RendererManager` };
    }

    // Check support before instantiation
    const support = checkRendererSupport(desc.requirements);
    if (!support.supported) {
      this.emit('renderer:unsupported', { id, reason: support.reason });
      return support;
    }

    // Get or create instance
    let instance = this.instances.get(id);
    if (!instance && desc.createRenderer) {
      instance = desc.createRenderer();
      this.instances.set(id, instance);
    }
    if (!instance) {
      return { supported: false, reason: `Renderer '${id}' has no createRenderer factory` };
    }

    this._activeId = id;
    this._setCanvasRenderer(instance);
    this.emit('renderer:switched', { id });
    return { supported: true };
  }

  /** Get the id of the currently active canvas renderer. */
  get activeId(): string { return this._activeId; }

  /** Get the descriptor of the currently active renderer. */
  get activeDescriptor(): RendererDescriptor | undefined {
    return this.descriptors.get(this._activeId);
  }

  /** List all registered renderer ids. */
  getRegistered(): string[] {
    return [...this.descriptors.keys()];
  }

  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  // ── Renderer lifecycle ──────────────────────────────────────────────────

  /** @deprecated Use switchTo(id) with descriptors. Kept for legacy plugin compat. */
  setRenderer(r: CanvasRenderer | null | undefined): void {
    this._setCanvasRenderer(r ?? null);
  }

  private _setCanvasRenderer(r: CanvasRenderer | null): void {
    this._destroyCurrentIfInited();
    let next: CanvasRenderer;
    if (r == null) {
      next = this.defaultRenderer;
    } else if (typeof r.draw === 'function') {
      next = r;
    } else {
      console.error('[RendererManager] renderer missing draw(); reverting to default.');
      next = this.defaultRenderer;
    }

    this.renderer = next;
    this.drawFailures = 0;

    if (!this.canvas) return;

    const nextType = this._resolveContextType(next);
    if (nextType !== this.currentContextType) {
      this._replaceCanvas(nextType);
    }

    this._initRenderer(next);
  }

  isDefault(): boolean {
    return this.renderer === this.defaultRenderer || this.renderer == null;
  }

  // ── Draw loop ──────────────────────────────────────────────────────────

  startLoop(makeBundle: () => RenderBundle | undefined): void {
    if (this.animFrame != null) return;
    const step = () => {
      this.animFrame = requestAnimationFrame(step);
      if (!this.canvas || !this.renderer) return;
      this._checkVisibility();
      if (this.lastVisible === false) return;
      const bundle = makeBundle();
      try {
        this.renderer.draw(bundle);
        this.drawFailures = 0;
      } catch (e) {
        this.drawFailures++;
        console.error('[RendererManager] draw error:', e);
        if (this.drawFailures >= MAX_DRAW_FAILURES && !this.isDefault()) {
          this._revertToDefault();
          this.emit('viz:reverted', { reason: 'draw-failure' });
        }
      }
    };
    this.animFrame = requestAnimationFrame(step);
  }

  stopLoop(): void {
    if (this.animFrame != null) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }

  // ── Resize ────────────────────────────────────────────────────────────

  resize(container: Element | null, renderScale: number): void {
    if (!this.canvas) return;
    let w: number, h: number;
    if (container) {
      const rect = container.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
    } else {
      const controls = document.getElementById('player-controls');
      w = document.documentElement.clientWidth;
      h = document.documentElement.clientHeight - (controls?.offsetHeight ?? 50);
    }
    this.canvas.style.width  = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width  = Math.round(w * renderScale);
    this.canvas.height = Math.round(h * renderScale);

    if (this.rendererInited && typeof this.renderer?.resize === 'function') {
      try { this.renderer.resize(this.canvas.width, this.canvas.height); } catch (e) {
        console.error('[RendererManager] resize error:', e);
      }
    }
  }

  // ── Visibility ────────────────────────────────────────────────────────

  setVisible(v: boolean | null): void {
    this.visibleOverride = v;
    this._checkVisibility();
  }

  isVisible(): boolean {
    if (this.visibleOverride !== null) return this.visibleOverride;
    return !!(this.canvas && this.canvas.offsetParent !== null);
  }

  // ── Draw hooks ────────────────────────────────────────────────────────

  addHook(fn: DrawHook): void { this.hooks.push(fn); }
  removeHook(fn: DrawHook): void { this.hooks = this.hooks.filter(h => h !== fn); }
  fireHooks(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    for (const fn of this.hooks) {
      try { fn(ctx, W, H); } catch { /* ignore */ }
    }
  }

  getDefaultRenderer(): DefaultRenderer { return this.defaultRenderer; }

  // ── Private helpers ───────────────────────────────────────────────────

  private _destroyCurrentIfInited(): void {
    if (this.renderer && this.rendererInited && typeof this.renderer.destroy === 'function') {
      try { this.renderer.destroy(); } catch (e) { console.error('[RendererManager] destroy error:', e); }
    }
    this.rendererInited = false;
  }

  private _initRenderer(r: CanvasRenderer): void {
    if (!this.canvas) return;
    let ok = typeof r.init !== 'function';
    if (typeof r.init === 'function') {
      try {
        r.init(this.canvas);
        ok = true;
      } catch (e) {
        console.error('[RendererManager] init error:', e);
        if (r !== this.defaultRenderer) {
          if (typeof r.destroy === 'function') try { r.destroy(); } catch { /* ignore */ }
          this._revertToDefault();
          this.emit('viz:reverted', { reason: 'init-failure' });
          return;
        }
      }
    }
    this.rendererInited = ok;
    if (!ok) return;
    if (typeof r.resize === 'function' && this.canvas) {
      try { r.resize(this.canvas.width, this.canvas.height); } catch { /* ignore */ }
    }
    // Async ready contract.
    if (r !== this.defaultRenderer && r.readyPromise) {
      r.readyPromise.then(
        () => this.emit('viz:renderer:ready', {}),
        (e) => {
          console.error('[RendererManager] async init failure:', e);
          this._revertToDefault();
          this.emit('viz:reverted', { reason: 'async-init-failure' });
        },
      );
    } else if (r !== this.defaultRenderer) {
      this.emit('viz:renderer:ready', {});
    }
  }

  private _revertToDefault(): void {
    this._destroyCurrentIfInited();
    this.renderer = this.defaultRenderer;
    this._activeId = 'highway-2d';
    this.drawFailures = 0;
    if (this.canvas && this.currentContextType !== '2d') {
      this._replaceCanvas('2d');
    }
    this._initRenderer(this.defaultRenderer);
  }

  private _resolveContextType(r: CanvasRenderer): '2d' | 'webgl2' {
    if (r === this.defaultRenderer) return '2d';
    if (r.contextType === 'webgl2') return 'webgl2';
    return '2d';
  }

  private _replaceCanvas(newType: '2d' | 'webgl2'): void {
    if (!this.canvas) return;
    const oldCanvas = this.canvas;
    const newCanvas = oldCanvas.cloneNode(false) as HTMLCanvasElement;
    oldCanvas.replaceWith(newCanvas);
    this.canvas = newCanvas;
    this.currentContextType = newType;
    this.lastVisible = null;
    this.emit('highway:canvas-replaced', { oldCanvas, newCanvas, contextType: newType });
  }

  private _checkVisibility(): void {
    const v = this.isVisible();
    if (v === this.lastVisible) return;
    this.lastVisible = v;
    this.emit('highway:visibility', { visible: v, canvas: this.canvas });
  }
}
