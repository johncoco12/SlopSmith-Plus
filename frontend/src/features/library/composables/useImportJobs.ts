import { ref, computed } from 'vue'
import { useAuthStore } from '@/features/auth/store'

export interface ImportJob {
  id:          string
  filename:    string
  format:      string
  status:      'queued' | 'processing' | 'completed' | 'failed'
  progress:    number
  error:       string | null
  trackId:     string | null
  createdAt:   number
  startedAt:   number | null
  completedAt: number | null
}

// Singleton state — shared across all usages
const jobs      = ref<ImportJob[]>([])
const uploading = ref(false)
let   pollTimer: ReturnType<typeof setInterval> | null = null
let   pollRefs  = 0

function authHeaders(): Record<string, string> {
  const auth = useAuthStore()
  return auth.token ? { Authorization: `Bearer ${auth.token}` } : {}
}

async function fetchJobs(): Promise<void> {
  try {
    const res = await fetch('/api/import/status', { headers: authHeaders() })
    if (!res.ok) return
    const data = await res.json() as { jobs: ImportJob[] }
    jobs.value = data.jobs ?? []
  } catch { /* ignore */ }
}

function startPolling(): void {
  pollRefs++
  if (pollTimer) return
  fetchJobs()
  pollTimer = setInterval(fetchJobs, 1500)
}

function stopPolling(): void {
  pollRefs = Math.max(0, pollRefs - 1)
  if (pollRefs > 0) return
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

export function useImportJobs() {
  const activeCount = computed(() =>
    jobs.value.filter(j => j.status === 'queued' || j.status === 'processing').length
  )

  async function upload(files: FileList): Promise<void> {
    const auth = useAuthStore()
    if (!files.length) return
    uploading.value = true
    const form = new FormData()
    for (const f of files) form.append('files', f)
    try {
      const res = await fetch('/api/import/upload', {
        method:  'POST',
        headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
        body:    form,
      })
      if (!res.ok) return
      const data = await res.json() as { jobs: { jobId: string }[] }
      if (data.jobs?.length) await fetchJobs()
    } finally {
      uploading.value = false
    }
  }

  return { jobs, uploading, activeCount, upload, fetchJobs, startPolling, stopPolling }
}
