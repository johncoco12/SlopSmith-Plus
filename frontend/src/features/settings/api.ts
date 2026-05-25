import { get, post, getRaw, postForm } from '@/api/index'

export const fetchSettings  = (): Promise<unknown> => get('/api/settings')
export const saveSettings   = (data: unknown): Promise<unknown> => post('/api/settings', data)
export const fetchVersion   = (): Promise<unknown> => get('/api/version')
export const startRescan     = (): Promise<unknown> => post('/api/rescan', {})
export const startFullRescan = (): Promise<unknown> => post('/api/rescan/full', {})
export const fetchScanStatus = (): Promise<unknown> => get('/api/scan-status')

export async function exportSettings(): Promise<void> {
  const res  = await getRaw('/api/settings/export') as Response
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'slopsmith-settings.json' })
  a.click()
  URL.revokeObjectURL(url)
}

export async function importSettings(file: File): Promise<unknown> {
  const form = new FormData()
  form.append('file', file)
  return postForm('/api/settings/import', form)
}

export async function exportDiagnostics({ include = [], redact = false }: { include?: string[]; redact?: boolean } = {}): Promise<void> {
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
