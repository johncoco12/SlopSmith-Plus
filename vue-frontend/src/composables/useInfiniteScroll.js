import { watch, onUnmounted } from 'vue'

/**
 * Calls `callback` when `sentinelRef` element enters the viewport.
 * Re-attaches automatically when the ref changes (e.g. after list re-render).
 *
 * @param {import('vue').Ref<Element|null>} sentinelRef
 * @param {() => void} callback
 * @param {{ threshold?: number }} opts
 */
export function useInfiniteScroll(sentinelRef, callback, { threshold = 0.1 } = {}) {
  let observer = null

  function attach(el) {
    detach()
    if (!el) return
    observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) callback() },
      { threshold }
    )
    observer.observe(el)
  }

  function detach() {
    observer?.disconnect()
    observer = null
  }

  watch(sentinelRef, el => attach(el), { immediate: true })
  onUnmounted(detach)
}
