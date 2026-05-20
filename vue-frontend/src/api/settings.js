import { get, post, getRaw, postForm } from './index.js'

export const fetchSettings  = () => get('/api/settings')
export const saveSettings   = (data) => post('/api/settings', data)
export const fetchVersion   = () => get('/api/version')
export const startRescan     = () => post('/api/rescan', {})
export const startFullRescan = () => post('/api/rescan/full', {})
export const fetchScanStatus = () => get('/api/scan-status')

export async function exportSettings() {
  const res  = await getRaw('/api/settings/export')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'slopsmith-settings.json' })
  a.click()
  URL.revokeObjectURL(url)
}

export async function importSettings(file) {
  const form = new FormData()
  form.append('file', file)
  return postForm('/api/settings/import', form)
}

export async function exportDiagnostics({ include = [], redact = false } = {}) {
  const res  = await fetch('/api/diagnostics/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ include, redact }),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'slopsmith-diagnostics.zip' })
  a.click()
  URL.revokeObjectURL(url)
}
