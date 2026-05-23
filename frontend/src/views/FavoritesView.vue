<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFavoritesStore } from '@/stores/library'
import SortBar from '@/components/library/SortBar.vue'
import FilterChips from '@/components/library/FilterChips.vue'
import FilterDrawer from '@/components/library/FilterDrawer.vue'
import SongGrid from '@/components/library/SongGrid.vue'
import SongTree from '@/components/library/SongTree.vue'

defineOptions({ name: 'FavoritesView' })

const router     = useRouter()
const favorites  = useFavoritesStore()
const drawerOpen = ref(false)

onMounted(() => {
  favorites.loadPage()
  favorites.loadTuningNames()
})

function openSong(song) {
  router.push({
    name: 'player',
    params: { trackId: song.trackId ?? song.filename },
    query: { arrangement: 0 },
  })
}

function editSong(song) {
  router.push({ name: 'plugin', params: { id: 'editor' }, query: { filename: song.filename } })
}
</script>

<template>
  <div class="min-h-screen bg-dark-800">

    <!-- Hero header -->
    <div class="px-6 pt-8 pb-5">
      <h1 class="text-3xl font-bold tracking-tight text-gray-50">{{ $t('favorites.title') }}</h1>
      <p v-if="favorites.total" class="t-caption mt-1">
        {{ $t('favorites.songCount', { count: favorites.total.toLocaleString() }) }}
      </p>
      <p v-else-if="!favorites.loading" class="t-caption mt-1">{{ $t('favorites.empty') }}</p>
    </div>

    <!-- Sticky toolbar -->
    <div class="sticky top-14 z-20 bg-dark-800/95 backdrop-blur-md border-b border-white/[.05] px-4 pt-3 pb-3 space-y-2">
      <SortBar
        :view-mode="favorites.viewMode"
        :sort-by="favorites.sortBy"
        :format-filter="favorites.formatFilter"
        :search="favorites.search"
        :filter-count="favorites.activeFilterCount"
        :total="favorites.total"
        @set-view="favorites.setViewMode"
        @set-sort="favorites.setSort"
        @set-format="favorites.setFormat"
        @set-search="favorites.setSearch"
        @toggle-filters="drawerOpen = true"
      />
      <FilterChips
        :filters="favorites.filters"
        @clear="favorites.clearFilters"
        @update="favorites.setFilters"
      />
    </div>

    <!-- Content -->
    <SongGrid
      v-if="favorites.viewMode === 'grid'"
      :songs="favorites.songs"
      :loading="favorites.loading"
      :loading-more="favorites.loadingMore"
      :has-more="favorites.hasMore"
      @open="openSong"
      @favorite="favorites.toggleFavorite"
      @edit="editSong"
      @load-more="favorites.loadMore"
    />
    <SongTree
      v-else
      :songs="favorites.songs"
      :loading="favorites.loading"
      @open="openSong"
      @favorite="favorites.toggleFavorite"
    />

    <FilterDrawer
      :open="drawerOpen"
      :filters="favorites.filters"
      :tuning-names="favorites.tuningNames"
      @update="f => { favorites.setFilters(f); drawerOpen = false }"
      @clear="favorites.clearFilters"
      @close="drawerOpen = false"
    />
  </div>
</template>
