import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchPlugins, fetchStartupStatus, updatePlugin as apiUpdate } from '@/features/plugins/api'
import type { Plugin, StartupStatus } from '@/types'

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<Plugin[]>([])
  const loaded  = ref<boolean>(false)

  const navPlugins      = computed(() => plugins.value.filter(p => p.nav))
  const settingsPlugins = computed(() => plugins.value.filter(p => p.has_settings))
  const vizPlugins      = computed(() => plugins.value.filter(p => p.type === 'visualization'))

  async function load(): Promise<void> {
    if (loaded.value) return
    await _waitForStartup()
    try {
      plugins.value = await fetchPlugins() as Plugin[]
      await Promise.allSettled(plugins.value.filter(p => p.has_script).map(_loadScript))
      loaded.value = true
      window.slopsmith?.emit('plugins:ready', {})
    } catch (e) {
      console.error('[Plugins] load failed', e)
    }
  }

  async function _waitForStartup(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const st = await fetchStartupStatus() as StartupStatus
        if (!st.running && (st.phase === 'complete' || st.phase === 'ready')) return
        if (st.phase === 'error') return
      } catch {}
      await new Promise(r => setTimeout(r, 500))
    }
  }

  function _loadScript(plugin: Plugin): Promise<void> {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script')
      el.src = `/api/plugins/${plugin.id}/screen.js?v=${plugin.version ?? 0}`
      el.onload = () => resolve()
      el.onerror = () => {
        console.warn(`[Plugin] ${plugin.id} script failed to load`)
        reject()
      }
      document.head.appendChild(el)
    })
  }

  async function update(pluginId: string): Promise<void> {
    await apiUpdate(pluginId)
  }

  return { plugins, loaded, navPlugins, settingsPlugins, vizPlugins, load, update }
})
