async function apiFetch(path, options = {}) {
  const { json = true, ...rest } = options
  const res = await fetch(path, rest)
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${msg}`)
  }
  return json ? res.json() : res
}

export const get     = path        => apiFetch(path)
export const del     = path        => apiFetch(path, { method: 'DELETE' })
export const getRaw  = path        => apiFetch(path, { json: false })

export function post(path, body) {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function postForm(path, formData) {
  return apiFetch(path, { method: 'POST', body: formData })
}
