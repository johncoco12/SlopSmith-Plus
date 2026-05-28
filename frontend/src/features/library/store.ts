import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import {
  fetchLibraryGrid,
  fetchLibraryStats,
  fetchTuningNames,
  toggleFavorite as apiToggleFavorite,
  deleteTrack as apiDeleteTrack,
  updateTrack as apiUpdateTrack,
  type UpdateTrackPayload,
} from '@/features/library/api'
import { fetchScoresBatch } from '@/features/player/scoreApi'
import { useAuthStore } from '@/features/auth/store'
import type { Song, LibraryFilters } from '@/types'

const PAGE_SIZE = 24

const EMPTY_FILTERS = (): LibraryFilters => ({
  arrangements: { has: [], lacks: [] },
  stems: { has: [], lacks: [] },
  lyrics: null,
  tunings: [],
})

function createLibraryStore(id: string, favoritesOnly: boolean) {
  return defineStore(id, () => {
    const auth = useAuthStore()

    // Persisted
    const viewMode = useLocalStorage(`slopsmith.${id}View`, 'grid')
    const sortBy   = useLocalStorage(`slopsmith.${id}Sort`, 'artist')
    const formatFilter = useLocalStorage(`slopsmith.${id}Format`, '')
    const filters  = useLocalStorage<LibraryFilters>(`slopsmith.${id}Filters`, EMPTY_FILTERS())

    // Session
    const songs       = ref<Song[]>([])
    const total       = ref<number>(0)
    const loading     = ref<boolean>(false)
    const loadingMore = ref<boolean>(false)
    const hasMore     = ref<boolean>(true)
    const page        = ref<number>(0)
    const search      = ref<string>('')
    const tuningNames = ref<string[]>([])
    const treeStats   = ref<unknown>(null)
    const treeLetter  = ref<string>('')

    const activeFilterCount = computed(() => {
      const f = filters.value
      return (
        f.arrangements.has.length +
        f.arrangements.lacks.length +
        f.stems.has.length +
        f.stems.lacks.length +
        (f.lyrics !== null ? 1 : 0) +
        f.tunings.length
      )
    })

    function _params(p = 0) {
      const f = filters.value
      return {
        query: search.value,
        sort: sortBy.value,
        format: formatFilter.value,
        arrangementsHas:   f.arrangements.has,
        arrangementsLacks: f.arrangements.lacks,
        stemsHas:   f.stems.has,
        stemsLacks: f.stems.lacks,
        lyrics:  f.lyrics,
        tunings: f.tunings,
        page: p + 1,
        size: PAGE_SIZE,
        favoritesOnly,
      }
    }

    async function _mergeScores(items: Song[]): Promise<void> {
      const profileId = auth.profile?.id
      if (!profileId) return
      const ids = items.map(s => s.trackId ?? s.filename).filter(Boolean) as string[]
      const scoreMap = await fetchScoresBatch(ids).catch(() => new Map<string, number>())
      for (const s of items) {
        const key = s.trackId ?? s.filename
        if (key && scoreMap.has(key)) s.bestScore = scoreMap.get(key)
      }
    }

    async function loadPage(): Promise<void> {
      if (loading.value) return
      loading.value = true
      page.value = 0
      songs.value = []
      hasMore.value = true
      try {
        const data = await fetchLibraryGrid(_params(0)) as any
        const items: Song[] = data.songs ?? []
        await _mergeScores(items)
        songs.value = items
        total.value = data.total ?? items.length
        hasMore.value = items.length < total.value
      } finally {
        loading.value = false
      }
    }

    async function loadMore(): Promise<void> {
      if (loadingMore.value || !hasMore.value || loading.value) return
      loadingMore.value = true
      page.value++
      try {
        const data = await fetchLibraryGrid(_params(page.value)) as any
        const items: Song[] = data.songs ?? []
        await _mergeScores(items)
        songs.value.push(...items)
        if (data.total) total.value = data.total
        hasMore.value = songs.value.length < total.value
      } finally {
        loadingMore.value = false
      }
    }

    async function loadTuningNames(): Promise<void> {
      if (tuningNames.value.length) return
      tuningNames.value = await fetchTuningNames()
    }

    async function loadStats(): Promise<void> {
      treeStats.value = await fetchLibraryStats(favoritesOnly)
    }

    async function toggleFavorite(trackId: string): Promise<void> {
      const profileId = auth.profile?.id
      if (!profileId) return
      const result = await apiToggleFavorite(trackId, profileId) as { favorite: boolean }
      const song = songs.value.find(s => s.trackId === trackId || s.filename === trackId)
      if (song) {
        song.isFavorite = result.favorite
        if (favoritesOnly && !result.favorite) {
          songs.value = songs.value.filter(s => s !== song)
          total.value = Math.max(0, total.value - 1)
        }
      }
    }

    async function deleteTrack(trackId: string): Promise<void> {
      await apiDeleteTrack(trackId)
      const idx = songs.value.findIndex(s => s.trackId === trackId || s.filename === trackId)
      if (idx !== -1) {
        songs.value.splice(idx, 1)
        total.value = Math.max(0, total.value - 1)
      }
    }

    async function updateTrack(trackId: string, payload: UpdateTrackPayload): Promise<void> {
      await apiUpdateTrack(trackId, payload)
      const song = songs.value.find(s => s.trackId === trackId || s.filename === trackId)
      if (song) {
        if (payload.title     !== undefined) song.title      = payload.title
        if (payload.artist    !== undefined) song.artist     = payload.artist
        if (payload.album     !== undefined) song.album      = payload.album
        if (payload.year      !== undefined) song.year       = payload.year
        if (payload.hasLyrics !== undefined) song.has_lyrics = payload.hasLyrics
      }
    }

    function setViewMode(mode: string): void { viewMode.value = mode }
    function setSort(s: string): void  { sortBy.value = s;        loadPage() }
    function setFormat(f: string): void { formatFilter.value = f;  loadPage() }
    function setSearch(q: string): void { search.value = q;         loadPage() }
    function setFilters(f: LibraryFilters): void { filters.value = f;       loadPage() }
    function clearFilters(): void { filters.value = EMPTY_FILTERS(); loadPage() }

    return {
      viewMode, sortBy, formatFilter, filters,
      songs, total, loading, loadingMore, hasMore,
      search, tuningNames, treeStats, treeLetter,
      activeFilterCount,
      loadPage, loadMore, loadTuningNames, loadStats,
      toggleFavorite, deleteTrack, updateTrack,
      setViewMode, setSort, setFormat, setSearch, setFilters, clearFilters,
    }
  })
}

export const useLibraryStore   = createLibraryStore('library', false)
export const useFavoritesStore = createLibraryStore('favorites', true)