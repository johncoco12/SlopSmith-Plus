<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight, Heart, Music2 } from 'lucide-vue-next'

import type { Song } from '@/types'

const props = defineProps<{
  songs: Song[]
  loading?: boolean
}>()
const emit = defineEmits<{
  open: [song: Song]
  favorite: [trackId: string]
}>()

const expanded = ref(new Set<string>())
const selected = ref<string | null>(null)
const { t } = useI18n()

interface ArtistEntry { name: string; albums: Record<string, Song[]> }

const tree = computed((): ArtistEntry[] => {
  const map: Record<string, ArtistEntry> = {}
  for (const song of props.songs) {
    const artist = song.artist || t('library.tree.unknownArtist')
    const album  = song.album  || t('library.tree.unknownAlbum')
    if (!map[artist]) map[artist] = { name: artist, albums: {} }
    if (!map[artist].albums[album]) map[artist].albums[album] = []
    map[artist].albums[album].push(song)
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
})

function toggle(key: string): void {
  if (expanded.value.has(key)) expanded.value.delete(key)
  else expanded.value.add(key)
}

function openSong(song: Song): void {
  selected.value = song.filename
  emit('open', song)
}

function artUrl(song: Song & { mtime?: number }): string {
  return song.trackId
    ? `/api/tracks/${encodeURIComponent(song.trackId)}/cover`
    : `/api/song/${encodeURIComponent(song.filename)}/art?t=${song.mtime ?? 0}`
}
</script>

<template>
  <div class="px-3 py-3">
    <!-- Skeleton -->
    <div v-if="loading" class="space-y-1.5 px-1">
      <div v-for="i in 8" :key="i" class="h-9 bg-dark-700 rounded-lg animate-pulse" />
    </div>

    <!-- Empty -->
    <div v-else-if="!songs.length" class="flex flex-col items-center justify-center py-32 gap-4 text-gray-500">
      <span class="text-6xl opacity-40">🎸</span>
      <p class="t-body">{{ $t('library.empty') }}</p>
    </div>

    <!-- Tree -->
    <div v-else class="space-y-0.5">
      <div v-for="artist in tree" :key="artist.name">
        <!-- Artist row -->
        <button
          class="artist-header w-full text-left"
          :aria-expanded="expanded.has(artist.name)"
          @click="toggle(artist.name)"
        >
          <ChevronRight
            :size="14"
            class="text-gray-500 transition-transform duration-150 shrink-0"
            :class="expanded.has(artist.name) ? 'rotate-90' : ''"
          />
          <span class="font-semibold text-gray-200 truncate">{{ artist.name }}</span>
          <span class="ml-auto t-micro shrink-0">
            {{ Object.values(artist.albums).flat().length }}
          </span>
        </button>

        <!-- Albums -->
        <div v-if="expanded.has(artist.name)" class="pl-5 space-y-0.5">
          <div v-for="(albumSongs, album) in artist.albums" :key="album">
            <!-- Album row -->
            <button
              class="artist-header w-full text-left text-gray-400"
              :aria-expanded="expanded.has(`${artist.name}/${album}`)"
              @click="toggle(`${artist.name}/${album}`)"
            >
              <ChevronRight
                :size="12"
                class="text-gray-600 transition-transform duration-150 shrink-0"
                :class="expanded.has(`${artist.name}/${album}`) ? 'rotate-90' : ''"
              />
              <span class="truncate text-xs text-gray-400">{{ album }}</span>
              <span class="ml-auto t-micro shrink-0">{{ albumSongs.length }}</span>
            </button>

            <!-- Songs -->
            <div v-if="expanded.has(`${artist.name}/${album}`)" class="pl-5 space-y-0.5">
              <div
                v-for="song in albumSongs"
                :key="song.filename"
                class="song-row group"
                :class="{ selected: selected === song.filename }"
                tabindex="0"
                :aria-label="`${song.title} by ${song.artist}`"
                @click="openSong(song)"
                @keydown.enter="openSong(song)"
              >
                <!-- Tiny art -->
                <div class="w-8 h-8 rounded-md bg-dark-600 overflow-hidden shrink-0 relative">
                  <img
                    :src="artUrl(song)"
                    :alt="song.album"
                    class="w-full h-full object-cover"
                    loading="lazy"
                    @error="$event.target.style.display='none'"
                  />
                  <div class="absolute inset-0 flex items-center justify-center -z-10">
                    <Music2 :size="14" class="text-gray-600" />
                  </div>
                </div>

                <span class="flex-1 truncate text-gray-200 text-sm">{{ song.title }}</span>

                <button
                  class="p-1 rounded transition-all duration-150 shrink-0"
                  :class="song.favorite
                    ? 'opacity-100 text-gold'
                    : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gold'"
                  :aria-label="song.favorite ? $t('library.song.removeFavorite') : $t('library.song.addFavorite')"
                  @click.stop="emit('favorite', song.trackId ?? song.filename)"
                >
                  <Heart :size="13" :fill="song.favorite ? 'currentColor' : 'none'" stroke-width="2" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
