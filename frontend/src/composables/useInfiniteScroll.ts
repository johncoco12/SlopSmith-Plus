import { watch, onUnmounted } from 'vue'
import type { Ref } from 'vue'

/**
 * Calls `callback` when `sentinelRef` element enters the viewport.
 * Re-attaches automatically when the ref changes (e.g. after list re-render).
 */
export function useInfiniteScroll(
  sentinelRef: Ref<Element | null>,
  callback: () => void,
  { threshold = 0.1 }: { threshold?: number } = {}
): void {
  let observer: IntersectionObserver | null = null

  function attach(el: Element | null): void {
    detach()
    if (!el) return
    observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) callback() },
      { threshold }
    )
    observer.observe(el)
  }

  function detach(): void {
    observer?.disconnect()
    observer = null
  }

  watch(sentinelRef, el => attach(el), { immediate: true })
  onUnmounted(detach)
}
