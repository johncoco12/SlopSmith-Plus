<script setup lang="ts">
import { ref, watch } from 'vue'
import { Music2, AlertCircle } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppToggle from '@/components/ui/AppToggle.vue'
import type { Song } from '@/types'
import type { UpdateTrackPayload } from '@/features/library/api'

const props = defineProps<{
  open: boolean
  song: Song | null
  saveFn: (trackId: string, payload: UpdateTrackPayload) => Promise<void>
}>()

const emit = defineEmits<{ close: [] }>()

const title     = ref('')
const artist    = ref('')
const album     = ref('')
const year      = ref('')
const hasLyrics = ref(false)
const saving    = ref(false)
const error     = ref<string | null>(null)

watch(() => props.open, open => {
  if (!open || !props.song) return
  const s = props.song
  title.value     = s.title     ?? ''
  artist.value    = s.artist    ?? ''
  album.value     = s.album     ?? ''
  year.value      = String(s.year ?? '')
  hasLyrics.value = s.has_lyrics ?? false
  error.value     = null
  saving.value    = false
})

async function save(): Promise<void> {
  if (!props.song) return
  const trackId = props.song.trackId ?? props.song.filename
  if (!trackId) return

  saving.value = true
  error.value  = null
  try {
    await props.saveFn(trackId, {
      title:     title.value.trim(),
      artist:    artist.value.trim(),
      album:     album.value.trim(),
      year:      year.value.trim(),
      hasLyrics: hasLyrics.value,
    })
    emit('close')
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to save changes'
  } finally {
    saving.value = false
  }
}

const FORMAT_LABEL: Record<string, string> = {
  psarc:   'PSARC',
  sloppak: 'Sloppak',
  loose:   'Loose',
}
</script>

<template>
  <AppDialog :open="open" size="md" @close="emit('close')">

    <template #header>
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-8 h-8 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center shrink-0">
          <Music2 :size="15" class="text-accent" />
        </div>
        <div class="min-w-0">
          <h2 class="text-sm font-semibold text-gray-100 leading-tight">Edit Track</h2>
          <p v-if="song" class="text-[11px] text-gray-500 truncate leading-tight mt-px">
            {{ song.artist }} — {{ song.title }}
          </p>
        </div>
      </div>
    </template>

    <form v-if="song" class="space-y-5" @submit.prevent="save">

      <!-- Title -->
      <div>
        <label class="settings-label">Title</label>
        <input
          v-model="title"
          type="text"
          class="settings-input w-full"
          placeholder="Track title"
          :disabled="saving"
        />
      </div>

      <!-- Artist -->
      <div>
        <label class="settings-label">Artist</label>
        <input
          v-model="artist"
          type="text"
          class="settings-input w-full"
          placeholder="Artist name"
          :disabled="saving"
        />
      </div>

      <!-- Album + Year -->
      <div class="grid grid-cols-[1fr_120px] gap-3">
        <div>
          <label class="settings-label">Album</label>
          <input
            v-model="album"
            type="text"
            class="settings-input w-full"
            placeholder="Album name"
            :disabled="saving"
          />
        </div>
        <div>
          <label class="settings-label">Year</label>
          <input
            v-model="year"
            type="text"
            class="settings-input w-full"
            placeholder="2024"
            maxlength="10"
            :disabled="saving"
          />
        </div>
      </div>

      <!-- Divider -->
      <div class="h-px bg-white/[.05]" />

      <!-- Has Lyrics -->
      <AppToggle v-model="hasLyrics" :disabled="saving">Has Lyrics</AppToggle>

      <!-- Read-only metadata badges -->
      <template v-if="song.format || song.tuning || song.arrangements?.length">
        <div class="h-px bg-white/[.05]" />
        <div class="flex flex-wrap gap-x-5 gap-y-2">
          <div v-if="song.format" class="flex items-center gap-1.5">
            <span class="text-[11px] text-gray-600 uppercase tracking-wider">Format</span>
            <span class="text-[11px] font-medium text-gray-400 bg-white/[.05] px-2 py-0.5 rounded">
              {{ FORMAT_LABEL[song.format] ?? song.format }}
            </span>
          </div>
          <div v-if="song.tuning" class="flex items-center gap-1.5">
            <span class="text-[11px] text-gray-600 uppercase tracking-wider">Tuning</span>
            <span class="text-[11px] font-medium text-gray-400 bg-white/[.05] px-2 py-0.5 rounded">
              {{ song.tuning }}
            </span>
          </div>
          <div v-if="song.arrangements?.length" class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[11px] text-gray-600 uppercase tracking-wider">Arrangements</span>
            <span
              v-for="arr in song.arrangements"
              :key="arr"
              class="text-[11px] font-medium text-gray-400 bg-white/[.05] px-2 py-0.5 rounded"
            >{{ arr }}</span>
          </div>
        </div>
      </template>

      <!-- Error -->
      <div
        v-if="error"
        class="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400"
      >
        <AlertCircle :size="13" class="shrink-0 mt-px" />
        {{ error }}
      </div>

    </form>

    <template #footer>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-200
                 border border-white/[.06] hover:border-white/15 transition-colors"
          :disabled="saving"
          @click="emit('close')"
        >Cancel</button>
        <button
          type="button"
          class="flex-1 py-2 rounded-xl text-sm font-semibold bg-accent hover:bg-accent/90
                 text-white transition-colors shadow-sm shadow-accent/25
                 disabled:opacity-50 disabled:cursor-not-allowed
                 flex items-center justify-center gap-2"
          :disabled="saving"
          @click="save"
        >
          <svg v-if="saving" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {{ saving ? 'Saving…' : 'Save Changes' }}
        </button>
      </div>
    </template>

  </AppDialog>
</template>
