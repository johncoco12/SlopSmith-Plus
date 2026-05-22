<script setup lang="ts">
import { computed } from 'vue'
import { Heart, Play, Pencil } from 'lucide-vue-next'

import type { Song } from '@/types'

const props = defineProps<{
  song: Song & { mtime?: number; favorite?: boolean; tuningName?: string }
  selected?: boolean
}>()
const emit = defineEmits<{
  open: [song: Song]
  favorite: [filename: string]
  edit: [song: Song]
}>()

const FORMAT_COLOR = {
  psarc:   'bg-blue-900/50 text-blue-300 border-blue-700/40',
  sloppak: 'bg-purple-900/50 text-purple-300 border-purple-700/40',
  loose:   'bg-gray-800 text-gray-400 border-gray-700/40',
}

const artUrl = computed(() =>
  `/api/song/${encodeURIComponent(props.song.filename)}/art?t=${props.song.mtime ?? 0}`
)
const arrNames = computed(() =>
  (props.song.arrangements ?? []).map(a => a.name ?? a)
)
</script>

<template>
  <article
    class="song-card group"
    :class="{ selected }"
    tabindex="0"
    :aria-label="`${song.title} by ${song.artist}`"
    @click="emit('open', song)"
    @keydown.enter="emit('open', song)"
    @keydown.space.prevent="emit('open', song)"
  >
    <!-- Album art -->
    <div class="card-art">
      <img
        :src="artUrl"
        :alt="`${song.album} cover`"
        loading="lazy"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        @error="$event.target.style.display='none'"
      />
      <!-- Emoji fallback behind the image -->
      <div
        class="absolute inset-0 flex items-center justify-center text-4xl select-none -z-10"
        aria-hidden="true"
      >🎸</div>

      <!-- Play overlay -->
      <div class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div class="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
          <Play :size="20" class="text-white translate-x-0.5" fill="currentColor" />
        </div>
      </div>

      <!-- Favorite button -->
      <button
        class="absolute top-2 right-2 p-2 rounded-full bg-black/60 transition-all duration-150"
        :class="song.favorite
          ? 'opacity-100 text-gold'
          : 'opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gold'"
        :aria-label="song.favorite ? 'Remove from favorites' : 'Add to favorites'"
        @click.stop="emit('favorite', song.filename)"
      >
        <Heart :size="16" :fill="song.favorite ? 'currentColor' : 'none'" stroke-width="2" />
      </button>
    </div>

    <!-- Info -->
    <div class="p-3 space-y-1">
      <!-- Title row with edit button -->
      <div class="flex items-start gap-1">
        <p class="flex-1 text-sm font-medium text-gray-100 truncate leading-snug">{{ song.title }}</p>
        <button
          class="shrink-0 p-1.5 -mt-0.5 -mr-1 rounded-md text-gray-500 opacity-0 group-hover:opacity-100 hover:text-gray-100 hover:bg-white/[.08] transition-all"
          title="Edit song"
          @click.stop="emit('edit', song)"
        >
          <Pencil :size="14" />
        </button>
      </div>

      <p class="t-caption truncate">{{ song.artist }}</p>

      <div class="flex items-center flex-wrap gap-1.5 pt-2">
        <span
          v-if="song.format"
          class="px-2 py-0.5 rounded-md text-xs border font-medium"
          :class="FORMAT_COLOR[song.format] ?? FORMAT_COLOR.loose"
        >{{ song.format }}</span>

        <span
          v-for="name in arrNames"
          :key="name"
          class="px-2 py-0.5 rounded-md text-xs bg-dark-500 text-gray-300 border border-white/[.08]"
        >{{ name }}</span>

        <span
          v-if="song.tuningName"
          class="px-2 py-0.5 rounded-md text-xs bg-dark-500 text-teal-400 border border-teal-700/40"
        >{{ song.tuningName }}</span>
      </div>
    </div>
  </article>
</template>
