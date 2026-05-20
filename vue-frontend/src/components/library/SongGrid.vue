<script setup>
import SongCard from './SongCard.vue'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll'
import { ref } from 'vue'

const props = defineProps({
  songs:       { type: Array,   required: true },
  loading:     { type: Boolean, default: false },
  loadingMore: { type: Boolean, default: false },
  hasMore:     { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'favorite', 'edit', 'load-more'])

const selected = ref(null)
const sentinel = ref(null)

useInfiniteScroll(sentinel, () => {
  if (props.hasMore && !props.loadingMore) emit('load-more')
})

function selectCard(song) {
  selected.value = song.filename
  emit('open', song)
}
</script>

<template>
  <div class="px-4 py-5">
    <!-- Loading skeleton -->
    <div
      v-if="loading"
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
    >
      <div
        v-for="i in 18"
        :key="i"
        class="rounded-xl bg-dark-700 border border-white/[.04] animate-pulse"
      >
        <div class="aspect-square bg-dark-600 rounded-t-xl" />
        <div class="p-2.5 space-y-2">
          <div class="h-3 bg-dark-500 rounded-md w-4/5" />
          <div class="h-2.5 bg-dark-500 rounded-md w-3/5" />
          <div class="flex gap-1 pt-0.5">
            <div class="h-4 bg-dark-500 rounded w-12" />
            <div class="h-4 bg-dark-500 rounded w-6" />
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!songs.length"
      class="flex flex-col items-center justify-center py-32 gap-4 text-gray-500"
    >
      <span class="text-6xl opacity-40">🎸</span>
      <p class="t-body">No songs found</p>
    </div>

    <!-- Grid -->
    <div
      v-else
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
    >
      <SongCard
        v-for="song in songs"
        :key="song.filename"
        :song="song"
        :selected="selected === song.filename"
        @open="selectCard"
        @favorite="emit('favorite', $event)"
        @edit="emit('edit', $event)"
      />
    </div>

    <!-- Infinite scroll sentinel -->
    <div ref="sentinel" class="h-10 mt-4 flex items-center justify-center">
      <span v-if="loadingMore" class="t-caption animate-pulse">Loading more…</span>
    </div>
  </div>
</template>
