import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import {
  fetchLibraryGrid,
  fetchLibraryStats,
  fetchTuningNames,
  toggleFavorite as apiToggleFavorite,
} from '@/api/library'

const PAGE_SIZE = 24

const EMPTY_FILTERS = () => ({
  arrangements: { has: [], lacks: [] },
  stems: { has: [], lacks: [] },
  lyrics: null,
  tunings: [],
})

function createLibraryStore(id, favoritesOnly) {
  return defineStore(id, () => {
    // Persisted
    const viewMode = useLocalStorage(`slopsmith.${id}View`, 'grid')
    const sortBy   = useLocalStorage(`slopsmith.${id}Sort`, 'artist')
    const formatFilter = useLocalStorage(`slopsmith.${id}Format`, '')
    const filters  = useLocalStorage(`slopsmith.${id}Filters`, EMPTY_FILTERS())

    // Session
    const songs       = ref([])
    const total       = ref(0)
    const loading     = ref(false)
    const loadingMore = ref(false)
    const hasMore     = ref(true)
    const page        = ref(0)
    const search      = ref('')
    const tuningNames = ref([])
    const treeStats   = ref(null)
    const treeLetter  = ref('')

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
        page: p,
        size: PAGE_SIZE,
        favoritesOnly,
      }
    }

    async function loadPage() {
      if (loading.value) return
      loading.value = true
      page.value = 0
      songs.value = []
      hasMore.value = true
      try {
        const data = await fetchLibraryGrid(_params(0))
        songs.value = data.songs ?? []
        total.value = data.total ?? songs.value.length
        hasMore.value = songs.value.length < total.value
      } finally {
        loading.value = false
      }
    }

    async function loadMore() {
      if (loadingMore.value || !hasMore.value || loading.value) return
      loadingMore.value = true
      page.value++
      try {
        const data = await fetchLibraryGrid(_params(page.value))
        const items = data.songs ?? []
        songs.value.push(...items)
        if (data.total) total.value = data.total
        hasMore.value = songs.value.length < total.value
      } finally {
        loadingMore.value = false
      }
    }

    async function loadTuningNames() {
      if (tuningNames.value.length) return
      tuningNames.value = await fetchTuningNames()
    }

    async function loadStats() {
      treeStats.value = await fetchLibraryStats(favoritesOnly)
    }

    async function toggleFavorite(filename) {
      await apiToggleFavorite(filename)
      const song = songs.value.find(s => s.filename === filename)
      if (song) song.isFavorite = !song.isFavorite
    }

    function setViewMode(mode) { viewMode.value = mode }
    function setSort(s)  { sortBy.value = s;        loadPage() }
    function setFormat(f){ formatFilter.value = f;  loadPage() }
    function setSearch(q){ search.value = q;         loadPage() }
    function setFilters(f){ filters.value = f;       loadPage() }
    function clearFilters(){ filters.value = EMPTY_FILTERS(); loadPage() }

    return {
      viewMode, sortBy, formatFilter, filters,
      songs, total, loading, loadingMore, hasMore,
      search, tuningNames, treeStats, treeLetter,
      activeFilterCount,
      loadPage, loadMore, loadTuningNames, loadStats,
      toggleFavorite,
      setViewMode, setSort, setFormat, setSearch, setFilters, clearFilters,
    }
  })
}

export const useLibraryStore   = createLibraryStore('library', false)
export const useFavoritesStore = createLibraryStore('favorites', true)
