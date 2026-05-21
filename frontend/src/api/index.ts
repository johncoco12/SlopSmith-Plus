interface FetchOptions extends RequestInit {
  json?: boolean
}

async function apiFetch(path: string, options: FetchOptions = {}): Promise<unknown> {
  const { json = true, ...rest } = options
  const res = await fetch(path, rest)
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${msg}`)
  }
  return json ? res.json() : res
}

export const get    = (path: string): Promise<unknown> => apiFetch(path)
export const del    = (path: string): Promise<unknown> => apiFetch(path, { method: 'DELETE' })
export const getRaw = (path: string): Promise<unknown> => apiFetch(path, { json: false })

export function post(path: string, body: unknown): Promise<unknown> {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function postForm(path: string, formData: FormData): Promise<unknown> {
  return apiFetch(path, { method: 'POST', body: formData })
}
