import { createApp } from 'vue'
import * as Vue from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from './plugins/i18n'
import { installPluginSystem } from './plugins'
import './assets/style.css'
import './styles/typography.css'

// Expose Vue so dynamically-loaded plugin modules (client.js files) can import
// reactive primitives from the same instance and share the reactivity system.
;(window as any).__slopsmithVue = Vue

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

// Install plugin system: wires PluginEventBus, SlotManager, and backward-compat
// window.slopsmith adapter (so pitch_yin and other legacy scripts keep working)
installPluginSystem(app)

app.mount('#app')
