<script setup lang="ts">
import { reactive, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Minus, Plus, Music2 } from 'lucide-vue-next'
import AppCheckbox from '@/components/ui/AppCheckbox.vue'
import AppDialog from '@/components/ui/AppDialog.vue'

import type { LibraryFilters } from '@/types'

const props = defineProps<{
  open: boolean
  filters: LibraryFilters
  tuningNames?: string[]
}>()
const emit = defineEmits<{
  update: [filters: LibraryFilters]
  clear: []
  close: []
}>()

const local = reactive<{
  arrangements: { has: string[]; lacks: string[] }
  stems:        { has: string[]; lacks: string[] }
  lyrics:       boolean | null
  tunings:      string[]
}>({
  arrangements: { has: [], lacks: [] },
  stems:        { has: [], lacks: [] },
  lyrics:       null,
  tunings:      [],
})

watch(() => props.open, open => {
  if (open) Object.assign(local, JSON.parse(JSON.stringify(props.filters)))
})

// ── helpers ───────────────────────────────────────────────────────────────

type FilterSection = 'arrangements' | 'stems'
type TriState = 'require' | 'exclude' | 'any'

function getState(section: FilterSection, val: string): TriState {
  if (local[section].has.includes(val))   return 'require'
  if (local[section].lacks.includes(val)) return 'exclude'
  return 'any'
}

function toggleState(section: FilterSection, val: string, target: TriState): void {
  const current = getState(section, val)
  local[section].has   = local[section].has.filter((v: string) => v !== val)
  local[section].lacks = local[section].lacks.filter((v: string) => v !== val)
  if (current !== target) {
    if (target === 'require') local[section].has.push(val)
    else                      local[section].lacks.push(val)
  }
}

const sectionCount = (section: FilterSection) =>
  local[section].has.length + local[section].lacks.length

const totalActive = computed(() =>
  local.arrangements.has.length + local.arrangements.lacks.length +
  local.stems.has.length + local.stems.lacks.length +
  (local.lyrics !== null ? 1 : 0) +
  local.tunings.length
)

function apply(): void { emit('update', JSON.parse(JSON.stringify(local)) as LibraryFilters) }

function clear() {
  Object.assign(local, {
    arrangements: { has: [], lacks: [] },
    stems:        { has: [], lacks: [] },
    lyrics: null, tunings: [],
  })
  emit('clear')
}

const ARRANGEMENTS = ['Lead', 'Rhythm', 'Bass']
const STEMS        = ['guitar', 'bass', 'drums', 'vocals', 'piano', 'other']

const { t } = useI18n()
</script>

<template>
  <AppDialog :open="open" size="lg" @close="emit('close')">

    <!-- Custom header with active count badge -->
    <template #header>
      <div class="flex items-center gap-2.5">
        <h2 class="text-sm font-semibold text-gray-100">{{ t('library.filters.title') }}</h2>
        <Transition
          enter-active-class="transition-all duration-150"
          enter-from-class="scale-75 opacity-0"
          enter-to-class="scale-100 opacity-100"
          leave-active-class="transition-all duration-100"
          leave-from-class="scale-100 opacity-100"
          leave-to-class="scale-75 opacity-0"
        >
          <span
            v-if="totalActive > 0"
            class="px-1.5 py-px rounded-md bg-accent/20 text-accent text-xs font-semibold tabular-nums"
          >{{ totalActive }}</span>
        </Transition>
      </div>
    </template>

    <!-- Body -->
    <div class="space-y-7">

      <!-- Hint -->
      <p class="text-xs text-gray-500 leading-relaxed -mt-1 flex items-center gap-2">
        <span><span class="text-green-400 font-semibold">+</span> require</span>
        <span class="text-white/20">·</span>
        <span><span class="text-red-400 font-semibold">−</span> exclude</span>
        <span class="text-white/20">·</span>
        <span>click again to clear</span>
      </p>

      <!-- ── 2-column grid: Arrangements + Stems ── -->
      <div class="grid grid-cols-2 gap-x-8 gap-y-6">

        <!-- Arrangements -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
              {{ t('library.filters.arrangements') }}
            </p>
            <Transition
              enter-active-class="transition-all duration-150"
              enter-from-class="opacity-0"
              leave-active-class="transition-all duration-100"
              leave-to-class="opacity-0"
            >
              <span
                v-if="sectionCount('arrangements') > 0"
                class="text-[10px] font-semibold text-accent"
              >{{ sectionCount('arrangements') }} active</span>
            </Transition>
          </div>
          <div class="flex flex-col gap-1.5">
            <div
              v-for="arr in ARRANGEMENTS"
              :key="arr"
              class="flex items-stretch rounded-xl border overflow-hidden h-9 transition-all duration-150 select-none"
              :class="{
                'border-green-600/40 bg-green-900/10 shadow-[0_0_0_1px_rgba(74,222,128,0.08)]':
                  getState('arrangements', arr) === 'require',
                'border-red-600/40 bg-red-900/10 shadow-[0_0_0_1px_rgba(248,113,113,0.08)]':
                  getState('arrangements', arr) === 'exclude',
                'border-white/[.08] bg-dark-600/60':
                  getState('arrangements', arr) === 'any',
              }"
            >
              <button
                class="w-9 flex items-center justify-center shrink-0 transition-colors"
                :class="getState('arrangements', arr) === 'exclude'
                  ? 'text-red-400'
                  : 'text-gray-600 hover:text-red-400'"
                :title="`Exclude ${arr}`"
                @click="toggleState('arrangements', arr, 'exclude')"
              >
                <Minus :size="12" stroke-width="2.5" />
              </button>
              <span
                class="flex-1 flex items-center justify-center text-xs font-medium border-x border-white/[.06]
                       transition-colors"
                :class="{
                  'text-green-300': getState('arrangements', arr) === 'require',
                  'text-red-300':   getState('arrangements', arr) === 'exclude',
                  'text-gray-300':  getState('arrangements', arr) === 'any',
                }"
              >{{ arr }}</span>
              <button
                class="w-9 flex items-center justify-center shrink-0 transition-colors"
                :class="getState('arrangements', arr) === 'require'
                  ? 'text-green-400'
                  : 'text-gray-600 hover:text-green-400'"
                :title="`Require ${arr}`"
                @click="toggleState('arrangements', arr, 'require')"
              >
                <Plus :size="12" stroke-width="2.5" />
              </button>
            </div>
          </div>
        </section>

        <!-- Stems -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                {{ t('library.filters.stems') }}
              </p>
              <p class="text-[10px] text-gray-600 mt-0.5">{{ t('library.filters.sloppakOnly') }}</p>
            </div>
            <Transition
              enter-active-class="transition-all duration-150"
              enter-from-class="opacity-0"
              leave-active-class="transition-all duration-100"
              leave-to-class="opacity-0"
            >
              <span
                v-if="sectionCount('stems') > 0"
                class="text-[10px] font-semibold text-accent"
              >{{ sectionCount('stems') }} active</span>
            </Transition>
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <div
              v-for="s in STEMS"
              :key="s"
              class="flex items-stretch rounded-xl border overflow-hidden h-9 transition-all duration-150 select-none"
              :class="{
                'border-green-600/40 bg-green-900/10 shadow-[0_0_0_1px_rgba(74,222,128,0.08)]':
                  getState('stems', s) === 'require',
                'border-red-600/40 bg-red-900/10 shadow-[0_0_0_1px_rgba(248,113,113,0.08)]':
                  getState('stems', s) === 'exclude',
                'border-white/[.08] bg-dark-600/60':
                  getState('stems', s) === 'any',
              }"
            >
              <button
                class="w-7 flex items-center justify-center shrink-0 transition-colors"
                :class="getState('stems', s) === 'exclude'
                  ? 'text-red-400'
                  : 'text-gray-600 hover:text-red-400'"
                :title="`Exclude ${s}`"
                @click="toggleState('stems', s, 'exclude')"
              >
                <Minus :size="11" stroke-width="2.5" />
              </button>
              <span
                class="flex-1 flex items-center justify-center text-[11px] font-medium border-x border-white/[.06]
                       capitalize transition-colors"
                :class="{
                  'text-green-300': getState('stems', s) === 'require',
                  'text-red-300':   getState('stems', s) === 'exclude',
                  'text-gray-300':  getState('stems', s) === 'any',
                }"
              >{{ s }}</span>
              <button
                class="w-7 flex items-center justify-center shrink-0 transition-colors"
                :class="getState('stems', s) === 'require'
                  ? 'text-green-400'
                  : 'text-gray-600 hover:text-green-400'"
                :title="`Require ${s}`"
                @click="toggleState('stems', s, 'require')"
              >
                <Plus :size="11" stroke-width="2.5" />
              </button>
            </div>
          </div>
        </section>
      </div>

      <div class="h-px bg-white/[.05]" />

      <!-- ── Lyrics ── -->
      <section>
        <div class="flex items-center justify-between mb-3">
          <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
            {{ t('library.filters.lyrics') }}
          </p>
          <span v-if="local.lyrics !== null" class="text-[10px] font-semibold text-accent">1 active</span>
        </div>
        <div class="flex gap-2">
          <button
            class="flex-1 h-9 rounded-xl text-xs font-medium border transition-all duration-150"
            :class="local.lyrics === true
              ? 'bg-green-900/20 border-green-600/40 text-green-300 shadow-[0_0_0_1px_rgba(74,222,128,0.08)]'
              : 'bg-dark-600/60 border-white/[.08] text-gray-400 hover:text-gray-200 hover:border-white/15'"
            @click="local.lyrics = local.lyrics === true ? null : true"
          >{{ t('library.filters.hasLyrics') }}</button>
          <button
            class="flex-1 h-9 rounded-xl text-xs font-medium border transition-all duration-150"
            :class="local.lyrics === false
              ? 'bg-red-900/20 border-red-600/40 text-red-300 shadow-[0_0_0_1px_rgba(248,113,113,0.08)]'
              : 'bg-dark-600/60 border-white/[.08] text-gray-400 hover:text-gray-200 hover:border-white/15'"
            @click="local.lyrics = local.lyrics === false ? null : false"
          >{{ t('library.filters.noLyrics') }}</button>
        </div>
      </section>

      <!-- ── Tunings ── -->
      <template v-if="tuningNames?.length">
        <div class="h-px bg-white/[.05]" />

        <section>
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-1.5">
              <Music2 :size="12" class="text-gray-600" />
              <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                {{ t('library.filters.tuning') }}
              </p>
            </div>
            <span v-if="local.tunings.length > 0" class="text-[10px] font-semibold text-accent">
              {{ local.tunings.length }} selected
            </span>
          </div>
          <div class="grid grid-cols-3 gap-1 max-h-44 overflow-y-auto -mx-1 px-1 rounded-xl">
            <div
              v-for="tuning in tuningNames"
              :key="tuning"
              class="px-2 py-1.5 rounded-lg transition-colors"
              :class="local.tunings.includes(tuning) ? 'bg-accent/10' : 'hover:bg-dark-600'"
            >
              <AppCheckbox v-model="local.tunings" :value="tuning">{{ tuning }}</AppCheckbox>
            </div>
          </div>
        </section>
      </template>
    </div>

    <!-- Footer -->
    <template #footer>
      <div class="flex items-center gap-3">
        <button
          class="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-200
                 border border-white/[.06] hover:border-white/15 transition-colors"
          @click="clear"
        >{{ t('library.filters.clearAll') }}</button>
        <button
          class="flex-1 py-2 rounded-xl text-sm font-semibold bg-accent hover:bg-accent/90
                 text-white transition-colors shadow-sm shadow-accent/25"
          @click="apply"
        >{{ t('library.filters.apply') }}</button>
      </div>
    </template>

  </AppDialog>
</template>
