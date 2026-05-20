import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  fetchSettings,
  saveSettings as apiSave,
  exportSettings as apiExport,
  importSettings as apiImport,
  fetchVersion,
  startRescan,
  startFullRescan,
  fetchScanStatus,
} from '@/api/settings'

export const useSettingsStore = defineStore('settings', () => {
  const loaded = ref(false)

  // Settings fields
  const dlcPath            = ref('')
  const lefty              = ref(false)
  const defaultArrangement = ref('auto')
  const psarcPlatform      = ref('all')
  const demucsUrl          = ref('')

  // Version info
  const version    = ref('')
  const sourceUrl  = ref('')
  const licenseUrl = ref('')

  // Scan state
  const scanning   = ref(false)
  const scanStatus = ref('')

  async function load() {
    if (loaded.value) return
    try {
      const [s, v] = await Promise.all([fetchSettings(), fetchVersion()])
      dlcPath.value            = s.dlc_path ?? s.dlcPath ?? ''
      lefty.value              = s.lefty ?? false
      defaultArrangement.value = s.default_arrangement ?? s.defaultArrangement ?? 'auto'
      psarcPlatform.value      = s.psarc_platform ?? s.psarcPlatform ?? 'all'
      demucsUrl.value          = s.demucs_url ?? s.demucsUrl ?? ''
      version.value    = v.version    ?? ''
      sourceUrl.value  = v.source_url ?? ''
      licenseUrl.value = v.license_url ?? ''
      loaded.value = true
    } catch (e) {
      console.error('Settings load failed', e)
    }
  }

  async function save() {
    await apiSave({
      dlc_path:            dlcPath.value,
      lefty:               lefty.value,
      default_arrangement: defaultArrangement.value,
      psarc_platform:      psarcPlatform.value,
      demucs_url:          demucsUrl.value,
    })
  }

  async function rescan(full = false) {
    scanning.value = true
    scanStatus.value = 'Starting scan…'
    try {
      if (full) await startFullRescan()
      else      await startRescan()
      const poll = setInterval(async () => {
        try {
          const st = await fetchScanStatus()
          scanStatus.value = st.message ?? st.status ?? ''
          if (!st.scanning) { clearInterval(poll); scanning.value = false }
        } catch {
          clearInterval(poll)
          scanning.value = false
          scanStatus.value = 'Scan failed'
        }
      }, 1000)
    } catch {
      scanning.value = false
      scanStatus.value = 'Scan failed'
    }
  }

  return {
    loaded,
    dlcPath, lefty, defaultArrangement, psarcPlatform, demucsUrl,
    version, sourceUrl, licenseUrl,
    scanning, scanStatus,
    load, save, rescan,
    export: apiExport,
    import: apiImport,
  }
})
