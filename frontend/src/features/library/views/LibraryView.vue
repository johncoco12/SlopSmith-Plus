<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLibraryStore } from '@/features/library/store'
import SortBar from '@/features/library/components/SortBar.vue'
import FilterChips from '@/features/library/components/FilterChips.vue'
import FilterDrawer from '@/features/library/components/FilterDrawer.vue'
import SongGrid from '@/features/library/components/SongGrid.vue'
import SongTree from '@/features/library/components/SongTree.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { Song } from '@/types'

defineOptions({ name: 'LibraryView' })

const router     = useRouter()
const library    = useLibraryStore()
const drawerOpen = ref(false)

const pendingDelete = ref<(Song & { trackId?: string }) | null>(null)

onMounted(() => {
  library.loadPage()
  library.loadTuningNames()
})

function openSong(song: Song): void {
  router.push({
    name: 'player',
    params: { trackId: song.trackId ?? song.filename },
    query: { arrangement: 0 },
  })
}

function editSong(song: Song): void {
  router.push({ name: 'plugin', params: { id: 'editor' }, query: { filename: song.filename } })
}

function deleteSong(song: Song): void {
  pendingDelete.value = song
}

async function confirmDelete() {
  const song = pendingDelete.value
  if (!song) return
  pendingDelete.value = null
  await library.deleteTrack(song.trackId ?? song.filename)
}
</script>

<template>
  <div class="min-h-screen bg-dark-800">

    <!-- Hero header -->
    <div class="px-6 pt-8 pb-5">
      <h1 class="text-3xl font-bold tracking-tight text-gray-50">{{ $t('library.title') }}</h1>
      <p v-if="library.total" class="t-caption mt-1">
        {{ $t('library.songCount', { count: library.total.toLocaleString() }) }}
      </p>
    </div>

    <!-- Sticky toolbar -->
    <div class="sticky top-14 z-20 bg-dark-800/95 backdrop-blur-md border-b border-white/[.05] px-4 pt-3 pb-3 space-y-2">
      <SortBar
        :view-mode="library.viewMode"
        :sort-by="library.sortBy"
        :format-filter="library.formatFilter"
        :search="library.search"
        :filter-count="library.activeFilterCount"
        :total="library.total"
        @set-view="library.setViewMode"
        @set-sort="library.setSort"
        @set-format="library.setFormat"
        @set-search="library.setSearch"
        @toggle-filters="drawerOpen = true"
      />
      <FilterChips
        :filters="library.filters"
        @clear="library.clearFilters"
        @update="library.setFilters"
      />
    </div>

    <!-- Content -->
    <SongGrid
      v-if="library.viewMode === 'grid'"
      :songs="library.songs"
      :loading="library.loading"
      :loading-more="library.loadingMore"
      :has-more="library.hasMore"
      @open="openSong"
      @favorite="library.toggleFavorite"
      @edit="editSong"
      @delete="deleteSong"
      @load-more="library.loadMore"
      @filter-artist="library.setSearch"
    />
    <SongTree
      v-else
      :songs="library.songs"
      :loading="library.loading"
      @open="openSong"
      @favorite="library.toggleFavorite"
    />

    <FilterDrawer
      :open="drawerOpen"
      :filters="library.filters"
      :tuning-names="library.tuningNames"
      @update="f => { library.setFilters(f); drawerOpen = false }"
      @clear="library.clearFilters"
      @close="drawerOpen = false"
    />

    <ConfirmDialog
      :open="pendingDelete !== null"
      :title="`Delete &quot;${pendingDelete?.title}&quot;?`"
      description="This cannot be undone."
      confirm-label="Delete"
      variant="danger"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>
