import { get, post } from './index.js'

// Convert "artist-desc" → {sort:"artist", dir:"desc"}, "recent" → {sort:"recent", dir:"asc"}, etc.
function parseSortBy(sortBy) {
  if (sortBy.endsWith('-desc')) return { sort: sortBy.slice(0, -5), dir: 'desc' }
  return { sort: sortBy, dir: 'asc' }
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
} = {}) {
  const { sort: sortKey, dir } = parseSortBy(sort)
  const p = new URLSearchParams()
  if (query)  p.set('q', query)
  p.set('sort', sortKey)
  p.set('dir', dir)
  p.set('page', page)
  p.set('size', size)
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

export const fetchLibraryStats = (favoritesOnly = false) =>
  get(`/api/library/stats?favorites=${favoritesOnly ? 1 : 0}`)

export async function fetchTuningNames() {
  const data = await get('/api/library/tuning-names')
  // API returns {tunings:[{name,sort_key,count}]} — extract just the names
  return (data.tunings ?? data).map(t => t.name ?? t)
}

export const toggleFavorite = (filename) =>
  post('/api/favorites/toggle', { filename })
