import type { InjectionKey } from 'vue'
import type { RenderBundle } from '../types'

export const renderBundleKey: InjectionKey<RenderBundle> = Symbol('render-bundle')
