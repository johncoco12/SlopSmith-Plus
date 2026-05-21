import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/style.css'
import './styles/typography.css'

// Bootstrap window.slopsmith with a full event emitter so highway.js can
// call emit/on/off.  diagnostics.js (loaded earlier in <head>) already set
// window.slopsmith = { diagnostics: ... } — we extend it, not replace it.
;(function () {
  const existing = (typeof window.slopsmith === 'object' && window.slopsmith !== null)
    ? window.slopsmith
    : null
  const bus = Object.assign(new EventTarget(), {
    emit(event: string, detail?: unknown) { this.dispatchEvent(new CustomEvent(event, { detail })) },
    on(event: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions)  { this.addEventListener(event, fn, opts) },
    off(event: string, fn: EventListenerOrEventListenerObject, opts?: EventListenerOptions) { this.removeEventListener(event, fn, opts) },
  }) as typeof window.slopsmith
  window.slopsmith = bus
  if (existing) {
    for (const key of Object.keys(existing)) {
      if (!(key in bus)) (bus as Record<string, unknown>)[key] = (existing as Record<string, unknown>)[key]
    }
  }
})()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
