import { get, post } from './index'

// Convert "artist-desc" → {sort:"artist", dir:"desc"}, "recent" → {sort:"recent", dir:"asc"}, etc.
function parseSortBy(sortBy: string): { sort: string; dir: string } {
  if (sortBy.endsWith('-desc')) return { sort: sortBy.slice(0, -5), dir: 'desc' }
  return { sort: sortBy, dir: 'asc' }
}

interface FetchLibraryGridParams {
  query?: string
  sort?: string
  format?: string
  arrangementsHas?: string[]
  arrangementsLacks?: string[]
  stemsHas?: string[]
  stemsLacks?: string[]
  lyrics?: boolean | null
  tunings?: string[]
  page?: number
  size?: number
  favoritesOnly?: boolean
}

export function fetchLibraryGrid({
  query = '',
  sort = 'artist',
  format = '',
  arrangementsHas   = [],
  arrangementsLacks = [],
  stemsHas          = [],
  stemsLacks        = [],
  lyrics            = null,
  tunings           = [],
  page              = 0,
  size              = 24,
  favoritesOnly     = false,
}: FetchLibraryGridParams = {}): Promise<unknown> {
  const { sort: sortKey, dir } = parseSortBy(sort)
  const p = new URLSearchParams()
  if (query)  p.set('q', query)
  p.set('sort', sortKey)
  p.set('dir', dir)
  p.set('page', String(page))
  p.set('size', String(size))
  if (format) p.set('format', format)
  if (arrangementsHas.length)   p.set('arrangements_has',   arrangementsHas.join(','))
  if (arrangementsLacks.length) p.set('arrangements_lacks', arrangementsLacks.join(','))
  if (stemsHas.length)          p.set('stems_has',          stemsHas.join(','))
  if (stemsLacks.length)        p.set('stems_lacks',        stemsLacks.join(','))
  if (lyrics !== null)          p.set('has_lyrics',         lyrics ? '1' : '0')
  if (tunings.length)           p.set('tunings',            tunings.join(','))
  if (favoritesOnly)            p.set('favorites', '1')
  return get(`/api/library?${p}`)
}

export const fetchLibraryStats = (favoritesOnly = false): Promise<unknown> =>
  get(`/api/library/stats?favorites=${favoritesOnly ? 1 : 0}`)

export async function fetchTuningNames(): Promise<string[]> {
  const data = await get('/api/library/tuning-names') as any
  // API returns {tunings:[{name,sort_key,count}]} — extract just the names
  return (data.tunings ?? data).map((t: any) => t.name ?? t)
}

export const toggleFavorite = (filename: string): Promise<unknown> =>
  post('/api/favorites/toggle', { filename })
