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
} from '@/features/settings/api'
import type { Settings, VersionInfo, ScanStatus } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  const loaded = ref<boolean>(false)

  // Settings fields
  const dlcPath            = ref<string>('')
  const lefty              = ref<boolean>(false)
  const defaultArrangement = ref<string>('auto')
  const psarcPlatform      = ref<string>('all')
  const demucsUrl          = ref<string>('')

  // Version info
  const version    = ref<string>('')
  const sourceUrl  = ref<string>('')
  const licenseUrl = ref<string>('')

  // Scan state
  const scanning   = ref<boolean>(false)
  const scanStatus = ref<string>('')

  async function load(): Promise<void> {
    if (loaded.value) return
    try {
      const [s, v] = await Promise.all([fetchSettings(), fetchVersion()]) as [Settings, VersionInfo]
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

  async function save(): Promise<void> {
    await apiSave({
      dlc_path:            dlcPath.value,
      lefty:               lefty.value,
      default_arrangement: defaultArrangement.value,
      psarc_platform:      psarcPlatform.value,
      demucs_url:          demucsUrl.value,
    })
  }

  async function rescan(full = false): Promise<void> {
    scanning.value = true
    scanStatus.value = 'Starting scan…'
    try {
      if (full) await startFullRescan()
      else      await startRescan()
      const poll = setInterval(async () => {
        try {
          const st = await fetchScanStatus() as ScanStatus
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
