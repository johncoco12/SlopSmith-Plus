import { onUnmounted } from 'vue'

// Global registry: key → [{handler, scope, condition}]
const registry = new Map()

// One global listener — never re-added
let _listening = false
function _ensureListener() {
  if (_listening) return
  _listening = true
  document.addEventListener('keydown', e => {
    const tag = e.target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
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
export function useShortcuts(_scope = 'global') {
  const owned = [] // [{key, entry}] — cleaned up on unmount

  _ensureListener()

  function register(key, handler, { condition = null } = {}) {
    const entry = { handler, condition }
    if (!registry.has(key)) registry.set(key, [])
    registry.get(key).push(entry)
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
