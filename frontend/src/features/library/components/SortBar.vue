<script setup lang="ts">
import { LayoutGrid, List, Search, SlidersHorizontal } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  viewMode: string
  sortBy: string
  formatFilter?: string
  search?: string
  filterCount?: number
  total?: number
}>()
const emit = defineEmits<{
  'set-view': [mode: string]
  'set-sort': [sort: string]
  'set-format': [format: string]
  'set-search': [query: string]
  'toggle-filters': []
}>()

const FORMATS = [
  { value: '',        label: t('library.format.all')     },
  { value: 'psarc',   label: t('library.format.psarc')   },
  { value: 'sloppak', label: t('library.format.sloppak') },
  { value: 'loose',   label: t('library.format.folder')  },
]

let _debounce: ReturnType<typeof setTimeout> | null = null
function onSearch(e: Event): void {
  clearTimeout(_debounce ?? undefined)
  _debounce = setTimeout(() => emit('set-search', (e.target as HTMLInputElement).value), 250)
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
        :placeholder="total ? $t('library.search.placeholderWithCount', { count: total.toLocaleString() }) : $t('library.search.placeholder')"
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
        @change="emit('set-sort', ($event.target as HTMLSelectElement).value)"
      >
        <option value="artist">{{ $t('library.sort.artistAsc') }}</option>
        <option value="artist-desc">{{ $t('library.sort.artistDesc') }}</option>
        <option value="title">{{ $t('library.sort.titleAsc') }}</option>
        <option value="title-desc">{{ $t('library.sort.titleDesc') }}</option>
        <option value="recent">{{ $t('library.sort.recent') }}</option>
        <option value="year-desc">{{ $t('library.sort.yearDesc') }}</option>
        <option value="year">{{ $t('library.sort.yearAsc') }}</option>
        <option value="tuning">{{ $t('library.sort.tuning') }}</option>
      </select>

      <!-- Filter button -->
      <button
        class="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0
               bg-dark-600 border border-white/[.06] text-gray-400
               hover:text-gray-200 hover:bg-dark-500 transition-all"
        :class="(filterCount ?? 0) > 0 ? '!border-accent/40 !text-accent !bg-accent/10' : ''"
        @click="emit('toggle-filters')"
      >
        <SlidersHorizontal :size="13" />
        {{ $t('library.filters.button') }}
        <span
          v-if="(filterCount ?? 0) > 0"
          class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-accent text-white
                 text-[9px] flex items-center justify-center font-bold"
        >{{ filterCount }}</span>
      </button>
    </div>
  </div>
</template>
