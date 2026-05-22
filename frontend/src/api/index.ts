const TOKEN_KEY = 'slopsmith_token'

interface FetchOptions extends RequestInit {
  json?: boolean
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function apiFetch(path: string, options: FetchOptions = {}): Promise<unknown> {
  const { json = true, ...rest } = options
  const token = getToken()
  const headers = new Headers(rest.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (json && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(path, { ...rest, headers })
  if (res.status === 401) {
    if (!path.startsWith('/api/setup') && !path.startsWith('/api/startup-status')) {
      setToken(null)
      window.location.hash = '#/login'
    }
    throw new Error('Session expired')
  }
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

export function patch(path: string, body: unknown): Promise<unknown> {
  return apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function postForm(path: string, formData: FormData): Promise<unknown> {
  return apiFetch(path, { method: 'POST', body: formData })
}