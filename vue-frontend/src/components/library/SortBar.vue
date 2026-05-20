<script setup>
import { LayoutGrid, List, Search, SlidersHorizontal } from 'lucide-vue-next'

const props = defineProps({
  viewMode:     { type: String, required: true },
  sortBy:       { type: String, required: true },
  formatFilter: { type: String, default: '' },
  search:       { type: String, default: '' },
  filterCount:  { type: Number, default: 0 },
  total:        { type: Number, default: 0 },
})
const emit = defineEmits(['set-view', 'set-sort', 'set-format', 'set-search', 'toggle-filters'])

const FORMATS = [
  { value: '',        label: 'All'     },
  { value: 'psarc',   label: 'PSARC'   },
  { value: 'sloppak', label: 'Sloppak' },
  { value: 'loose',   label: 'Folder'  },
]

let _debounce = null
function onSearch(e) {
  clearTimeout(_debounce)
  _debounce = setTimeout(() => emit('set-search', e.target.value), 250)
}
</script>

<template>
  <div class="space-y-2.5">
    <!-- Search bar -->
    <div class="relative">
      <Search
        :size="16"
        class="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
      />
      <input
        type="search"
        :value="search"
        :placeholder="total ? `Search ${total.toLocaleString()} songs…` : 'Search songs, artists, albums…'"
        class="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm
               bg-dark-600 border border-white/[.06] text-gray-100 placeholder-gray-500
               focus:outline-none focus:ring-2 focus:ring-accent/35 focus:border-accent/30 transition"
        @input="onSearch"
      />
    </div>

    <!-- Controls row -->
    <div class="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5 -mb-0.5">

      <!-- Format pills -->
      <div class="flex items-center gap-1 shrink-0">
        <button
          v-for="f in FORMATS"
          :key="f.value"
          class="px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap"
          :class="formatFilter === f.value
            ? 'bg-accent text-white shadow-sm shadow-accent/30'
            : 'bg-dark-600 text-gray-500 hover:text-gray-200 border border-white/[.06] hover:border-white/10'"
          @click="emit('set-format', f.value)"
        >{{ f.label }}</button>
      </div>

      <!-- Divider -->
      <div class="w-px h-4 bg-white/[.08] shrink-0" />

      <!-- View toggle -->
      <div class="flex rounded-lg overflow-hidden border border-white/[.06] shrink-0">
        <button
          class="p-1.5 transition"
          :class="viewMode === 'grid' ? 'bg-accent/20 text-accent' : 'bg-dark-600 text-gray-500 hover:text-gray-200'"
          title="Grid view"
          @click="emit('set-view', 'grid')"
        >
          <LayoutGrid :size="14" />
        </button>
        <button
          class="p-1.5 transition border-l border-white/[.06]"
          :class="viewMode === 'tree' ? 'bg-accent/20 text-accent' : 'bg-dark-600 text-gray-500 hover:text-gray-200'"
          title="Tree view"
          @click="emit('set-view', 'tree')"
        >
          <List :size="14" />
        </button>
      </div>

      <!-- Sort -->
      <select
        :value="sortBy"
        class="px-2.5 py-1.5 rounded-lg text-xs bg-dark-600 border border-white/[.06]
               text-gray-400 focus:outline-none focus:ring-1 focus:ring-accent/40 shrink-0 cursor-pointer"
        @change="emit('set-sort', $event.target.value)"
      >
        <option value="artist">Artist A–Z</option>
        <option value="artist-desc">Artist Z–A</option>
        <option value="title">Title A–Z</option>
        <option value="title-desc">Title Z–A</option>
        <option value="recent">Recently added</option>
        <option value="year-desc">Newest year</option>
        <option value="year">Oldest year</option>
        <option value="tuning">Tuning</option>
      </select>

      <!-- Filter button -->
      <button
        class="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0
               bg-dark-600 border border-white/[.06] text-gray-400
               hover:text-gray-200 hover:bg-dark-500 transition-all"
        :class="filterCount > 0 ? '!border-accent/40 !text-accent !bg-accent/10' : ''"
        @click="emit('toggle-filters')"
      >
        <SlidersHorizontal :size="13" />
        Filters
        <span
          v-if="filterCount > 0"
          class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-accent text-white
                 text-[9px] flex items-center justify-center font-bold"
        >{{ filterCount }}</span>
      </button>
    </div>
  </div>
</template>
