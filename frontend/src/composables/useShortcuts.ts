import { onUnmounted } from 'vue'

interface ShortcutOptions {
  condition?: (() => boolean) | null
}

interface ShortcutEntry {
  handler: (e: KeyboardEvent) => void
  condition: (() => boolean) | null
}

// Global registry: key → [{handler, scope, condition}]
const registry = new Map<string, ShortcutEntry[]>()

// One global listener — never re-added
let _listening = false
function _ensureListener(): void {
  if (_listening) return
  _listening = true
  document.addEventListener('keydown', e => {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
    const list = registry.get(e.key) ?? registry.get(e.code) ?? []
    for (const { handler, condition } of list) {
      if (condition && !condition()) continue
      handler(e)
    }
  })
}

/**
 * Returns a `register(key, handler, opts?)` function.
 * Automatically unregisters all shortcuts when the calling component unmounts.
 *
 * @param {string} _scope  Informational only — 'global'|'player'|'library' etc.
 */
export function useShortcuts(_scope = 'global'): { register: (key: string, handler: (e: KeyboardEvent) => void, opts?: ShortcutOptions) => void } {
  const owned: Array<{ key: string; entry: ShortcutEntry }> = [] // [{key, entry}] — cleaned up on unmount

  _ensureListener()

  function register(key: string, handler: (e: KeyboardEvent) => void, { condition = null }: ShortcutOptions = {}): void {
    const entry: ShortcutEntry = { handler, condition }
    if (!registry.has(key)) registry.set(key, [])
    registry.get(key)!.push(entry)
    owned.push({ key, entry })
  }

  onUnmounted(() => {
    for (const { key, entry } of owned) {
      const list = registry.get(key)
      if (!list) continue
      const idx = list.indexOf(entry)
      if (idx !== -1) list.splice(idx, 1)
      if (!list.length) registry.delete(key)
    }
    owned.length = 0
  })

  return { register }
}
