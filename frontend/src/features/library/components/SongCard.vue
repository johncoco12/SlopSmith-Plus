<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Heart, Play, MoreVertical, Pencil, Trash2 } from 'lucide-vue-next'
import type { Song } from '@/types'

const props = defineProps<{
  song: Song & { mtime?: number; favorite?: boolean; tuningName?: string; trackId?: string }
  selected?: boolean
}>()

const emit = defineEmits<{
  open:            [song: Song]
  favorite:        [trackId: string]
  edit:            [song: Song]
  delete:          [song: Song]
  'filter-artist': [artist: string]
}>()

const { t } = useI18n()

const FORMAT_COLOR: Record<string, string> = {
  psarc:   'bg-blue-900/50 text-blue-300 border-blue-700/40',
  sloppak: 'bg-purple-900/50 text-purple-300 border-purple-700/40',
  loose:   'bg-gray-800 text-gray-400 border-gray-700/40',
}

const artUrl = computed(() =>
  props.song.trackId
    ? `/api/tracks/${encodeURIComponent(props.song.trackId)}/cover`
    : `/api/song/${encodeURIComponent(props.song.filename)}/art?t=${props.song.mtime ?? 0}`
)

const arrNames = computed(() =>
  (props.song.arrangements ?? []).map((a: unknown) =>
    (typeof a === 'object' && a !== null && 'name' in a)
      ? (a as { name: string }).name
      : String(a)
  )
)

// ── Favorite animation ─────────────────────────────────────────────────────────
const favBurst = ref(false)

function onFavorite() {
  favBurst.value = false
  requestAnimationFrame(() => {
    favBurst.value = true
    setTimeout(() => { favBurst.value = false }, 600)
  })
  emit('favorite', props.song.trackId ?? props.song.filename)
}

// ── Context menu ───────────────────────────────────────────────────────────────
const menuOpen = ref(false)

function openMenu(e: Event) {
  e.stopPropagation()
  menuOpen.value = true
}

function closeMenu() { menuOpen.value = false }

function onEdit(e: Event) {
  e.stopPropagation()
  closeMenu()
  emit('edit', props.song)
}

function onDelete(e: Event) {
  e.stopPropagation()
  closeMenu()
  emit('delete', props.song)
}
</script>

<template>
  <!-- Backdrop to close menu on outside click -->
  <div v-if="menuOpen" class="fixed inset-0 z-20" @click="closeMenu" @contextmenu.prevent="closeMenu" />

  <article
    class="song-card group"
    :class="{ selected, 'z-50': menuOpen }"
    tabindex="0"
    :aria-label="`${song.title} by ${song.artist}`"
    @click="emit('open', song)"
    @keydown.enter="emit('open', song)"
    @keydown.space.prevent="emit('open', song)"
  >
    <!-- ── Album art ──────────────────────────────────────────────────────── -->
    <div class="card-art">
      <img
        :src="artUrl"
        :alt="`${song.title} cover`"
        loading="lazy"
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <div class="absolute inset-0 flex items-center justify-center text-4xl select-none -z-10" aria-hidden="true">🎸</div>

      <!-- Play overlay -->
      <div class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        <div class="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20 shadow-lg">
          <Play :size="20" class="text-white translate-x-0.5" fill="currentColor" />
        </div>
      </div>

      <!-- ⋯ menu — top-left -->
      <div class="absolute top-2 left-2 z-30">
        <button
          class="p-1.5 rounded-full bg-black/60 backdrop-blur-sm text-gray-300 hover:text-white transition-all duration-150"
          :class="menuOpen ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100'"
          :aria-label="t('library.song.options', 'Options')"
          @click="openMenu"
        >
          <MoreVertical :size="15" />
        </button>

        <Transition name="menu">
          <div
            v-if="menuOpen"
            class="absolute top-full left-0 mt-1.5 z-30 w-44 rounded-xl bg-dark-700 border border-white/10 shadow-2xl overflow-hidden py-1"
            @click.stop
          >
            <button class="menu-item" @click="onEdit">
              <Pencil :size="13" class="text-gray-400 shrink-0" />
              <span>Edit metadata</span>
            </button>
            <div class="mx-3 my-1 border-t border-white/[.06]" />
            <button class="menu-item !text-red-400 hover:!bg-red-500/10" @click="onDelete">
              <Trash2 :size="13" class="shrink-0" />
              <span>Delete</span>
            </button>
          </div>
        </Transition>
      </div>

      <!-- Heart — top-right -->
      <button
        class="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 backdrop-blur-sm transition-all duration-150"
        :class="song.favorite
          ? 'opacity-100 text-rose-400'
          : 'opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-400'"
        :aria-label="song.favorite ? t('library.song.removeFavorite') : t('library.song.addFavorite')"
        @click.stop="onFavorite"
      >
        <span v-if="favBurst" class="fav-burst" aria-hidden="true" />
        <Heart
          :size="16"
          :fill="song.favorite ? 'currentColor' : 'none'"
          stroke-width="2"
          class="relative z-10"
          :class="favBurst ? 'fav-pop' : ''"
        />
      </button>
    </div>

    <!-- ── Info ──────────────────────────────────────────────────────────── -->
    <div class="p-3 space-y-1">
      <p class="text-sm font-semibold text-gray-100 truncate leading-snug">{{ song.title }}</p>

      <p class="text-xs text-gray-400 truncate">
        <button
          class="hover:text-gray-200 hover:underline underline-offset-2 transition-colors text-left"
          :title="t('library.song.filterByArtist', { artist: song.artist })"
          @click.stop="emit('filter-artist', song.artist)"
        >{{ song.artist }}</button>
      </p>

      <div class="flex flex-wrap gap-1 pt-1.5">
        <span
          v-if="song.format"
          class="pill border"
          :class="FORMAT_COLOR[song.format] ?? FORMAT_COLOR.loose"
        >{{ song.format }}</span>

        <span
          v-for="name in arrNames"
          :key="name"
          class="pill bg-dark-500 text-gray-300 border border-white/[.08]"
        >{{ name }}</span>

        <span
          v-if="song.tuningName"
          class="pill bg-dark-500 text-teal-400 border border-teal-700/40"
        >{{ song.tuningName }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.song-card {
  position: relative;
  background: theme('colors.dark.700');
  border: 1px solid theme('colors.white / 0.06');
  border-radius: 0.875rem;
  overflow: visible;
  cursor: pointer;
  transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
  outline: none;
}
.song-card:hover,
.song-card:focus-visible {
  box-shadow: 0 8px 32px -8px rgb(0 0 0 / 0.55);
  transform: translateY(-2px);
  border-color: theme('colors.white / 0.13');
}
.song-card.selected {
  border-color: theme('colors.accent.DEFAULT', '#4080e0');
  box-shadow: 0 0 0 2px theme('colors.accent.DEFAULT', '#4080e0');
}

/* clip art corners separately so overflow: visible works for the menu */
.card-art {
  position: relative;
  aspect-ratio: 1 / 1;
  background: theme('colors.dark.600');
  overflow: hidden;
  border-radius: 0.875rem 0.875rem 0 0;
}

.pill {
  padding: 0.125rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.6;
}

/* ── Heart burst ────────────────────────────────────────────────────────────── */
.fav-burst {
  position: absolute;
  inset: -5px;
  border-radius: 9999px;
  border: 2px solid #fb7185;
  animation: burst 0.55s ease-out forwards;
  pointer-events: none;
}

.fav-pop { animation: pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }

@keyframes burst {
  0%   { transform: scale(0.5); opacity: 1; }
  60%  { transform: scale(1.7); opacity: 0.35; }
  100% { transform: scale(2.4); opacity: 0; }
}

@keyframes pop {
  0%   { transform: scale(1); }
  45%  { transform: scale(1.5); }
  100% { transform: scale(1); }
}

/* ── Menu transition ────────────────────────────────────────────────────────── */
.menu-enter-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.menu-leave-active { transition: opacity 0.08s ease; }
.menu-enter-from   { opacity: 0; transform: scale(0.95) translateY(-4px); }
.menu-leave-to     { opacity: 0; }

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  color: theme('colors.gray.200');
  text-align: left;
  transition: background-color 0.1s;
}
.menu-item:hover { background: rgb(255 255 255 / 0.06); }
</style>
