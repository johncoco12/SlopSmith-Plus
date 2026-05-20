<script setup>
import { reactive, watch, computed } from 'vue'
import { X, Plus, Minus, Music2 } from 'lucide-vue-next'
import AppCheckbox from '@/components/common/AppCheckbox.vue'

const props = defineProps({
  open:        { type: Boolean, required: true },
  filters:     { type: Object,  required: true },
  tuningNames: { type: Array,   default: () => [] },
})
const emit = defineEmits(['update', 'clear', 'close'])

const local = reactive({
  arrangements: { has: [], lacks: [] },
  stems:        { has: [], lacks: [] },
  lyrics:       null,
  tunings:      [],
})

watch(() => props.open, open => {
  if (open) Object.assign(local, JSON.parse(JSON.stringify(props.filters)))
})

// ── helpers ───────────────────────────────────────────────────────────────

function getState(section, val) {
  if (local[section].has.includes(val))   return 'require'
  if (local[section].lacks.includes(val)) return 'exclude'
  return 'any'
}

function toggleState(section, val, target) {
  const current = getState(section, val)
  local[section].has   = local[section].has.filter(v => v !== val)
  local[section].lacks = local[section].lacks.filter(v => v !== val)
  if (current !== target) {
    if (target === 'require') local[section].has.push(val)
    else                      local[section].lacks.push(val)
  }
}

const sectionCount = (section) =>
  local[section].has.length + local[section].lacks.length

const totalActive = computed(() =>
  local.arrangements.has.length + local.arrangements.lacks.length +
  local.stems.has.length + local.stems.lacks.length +
  (local.lyrics !== null ? 1 : 0) +
  local.tunings.length
)

function apply() { emit('update', JSON.parse(JSON.stringify(local))) }

function clear() {
  Object.assign(local, {
    arrangements: { has: [], lacks: [] },
    stems:        { has: [], lacks: [] },
    lyrics: null, tunings: [],
  })
  emit('clear')
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0" enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100" leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" @click="emit('close')" />
    </Transition>

    <!-- Panel -->
    <Transition
      enter-active-class="transition-transform duration-250 ease-out"
      enter-from-class="translate-x-full" enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-x-0" leave-to-class="translate-x-full"
    >
      <div
        v-if="open"
        class="fixed right-0 top-0 bottom-0 w-[320px] bg-dark-700 border-l border-white/[.05] z-50 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <!-- ── Header ── -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-white/[.05] shrink-0">
          <div class="flex items-center gap-2.5">
            <h2 class="text-base font-semibold text-gray-100">Filters</h2>
            <Transition
              enter-active-class="transition-all duration-150"
              enter-from-class="scale-75 opacity-0" enter-to-class="scale-100 opacity-100"
              leave-active-class="transition-all duration-100"
              leave-from-class="scale-100 opacity-100" leave-to-class="scale-75 opacity-0"
            >
              <span
                v-if="totalActive > 0"
                class="px-1.5 py-px rounded-md bg-accent/20 text-accent text-xs font-semibold tabular-nums"
              >{{ totalActive }}</span>
            </Transition>
          </div>
          <button
            class="p-1.5 rounded-lg hover:bg-dark-600 text-gray-500 hover:text-gray-100 transition"
            aria-label="Close filters"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- ── Body ── -->
        <div class="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          <!-- Hint -->
          <p class="text-xs text-gray-500 leading-relaxed -mt-1">
            <span class="text-green-400 font-medium">+</span> require &nbsp;·&nbsp;
            <span class="text-red-400 font-medium">−</span> exclude &nbsp;·&nbsp;
            click again to clear
          </p>

          <!-- ── Arrangements ── -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Arrangements</p>
              <span v-if="sectionCount('arrangements') > 0" class="text-[10px] font-semibold text-accent">
                {{ sectionCount('arrangements') }} active
              </span>
            </div>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="arr in ['Lead', 'Rhythm', 'Bass']"
                :key="arr"
                class="flex items-stretch rounded-lg border overflow-hidden text-xs font-medium transition-all duration-150"
                :class="{
                  'border-green-600/40 bg-green-900/10': getState('arrangements', arr) === 'require',
                  'border-red-600/40   bg-red-900/10':   getState('arrangements', arr) === 'exclude',
                  'border-white/[.08]  bg-dark-600':     getState('arrangements', arr) === 'any',
                }"
              >
                <button
                  class="flex items-center px-2.5 py-1.5 transition-colors"
                  :class="getState('arrangements', arr) === 'exclude'
                    ? 'text-red-400'
                    : 'text-gray-600 hover:text-red-400'"
                  :title="`Exclude ${arr}`"
                  @click="toggleState('arrangements', arr, 'exclude')"
                >
                  <Minus :size="11" stroke-width="2.5" />
                </button>
                <span
                  class="px-2.5 py-1.5 border-x border-white/[.06] transition-colors"
                  :class="{
                    'text-green-300': getState('arrangements', arr) === 'require',
                    'text-red-300':   getState('arrangements', arr) === 'exclude',
                    'text-gray-300':  getState('arrangements', arr) === 'any',
                  }"
                >{{ arr }}</span>
                <button
                  class="flex items-center px-2.5 py-1.5 transition-colors"
                  :class="getState('arrangements', arr) === 'require'
                    ? 'text-green-400'
                    : 'text-gray-600 hover:text-green-400'"
                  :title="`Require ${arr}`"
                  @click="toggleState('arrangements', arr, 'require')"
                >
                  <Plus :size="11" stroke-width="2.5" />
                </button>
              </div>
            </div>
          </section>

          <div class="h-px bg-white/[.04]" />

          <!-- ── Stems ── -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <div>
                <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Stems</p>
                <p class="text-[10px] text-gray-600 mt-0.5">Sloppak only</p>
              </div>
              <span v-if="sectionCount('stems') > 0" class="text-[10px] font-semibold text-accent">
                {{ sectionCount('stems') }} active
              </span>
            </div>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="s in ['guitar','bass','drums','vocals','piano','other']"
                :key="s"
                class="flex items-stretch rounded-lg border overflow-hidden text-xs font-medium transition-all duration-150"
                :class="{
                  'border-green-600/40 bg-green-900/10': getState('stems', s) === 'require',
                  'border-red-600/40   bg-red-900/10':   getState('stems', s) === 'exclude',
                  'border-white/[.08]  bg-dark-600':     getState('stems', s) === 'any',
                }"
              >
                <button
                  class="flex items-center px-2.5 py-1.5 transition-colors"
                  :class="getState('stems', s) === 'exclude' ? 'text-red-400' : 'text-gray-600 hover:text-red-400'"
                  :title="`Exclude ${s}`"
                  @click="toggleState('stems', s, 'exclude')"
                >
                  <Minus :size="11" stroke-width="2.5" />
                </button>
                <span
                  class="px-2.5 py-1.5 border-x border-white/[.06] capitalize transition-colors"
                  :class="{
                    'text-green-300': getState('stems', s) === 'require',
                    'text-red-300':   getState('stems', s) === 'exclude',
                    'text-gray-300':  getState('stems', s) === 'any',
                  }"
                >{{ s }}</span>
                <button
                  class="flex items-center px-2.5 py-1.5 transition-colors"
                  :class="getState('stems', s) === 'require' ? 'text-green-400' : 'text-gray-600 hover:text-green-400'"
                  :title="`Require ${s}`"
                  @click="toggleState('stems', s, 'require')"
                >
                  <Plus :size="11" stroke-width="2.5" />
                </button>
              </div>
            </div>
          </section>

          <div class="h-px bg-white/[.04]" />

          <!-- ── Lyrics ── -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Lyrics</p>
              <span v-if="local.lyrics !== null" class="text-[10px] font-semibold text-accent">1 active</span>
            </div>
            <div class="flex gap-2">
              <button
                class="flex-1 py-2 rounded-lg text-xs font-medium border transition-all"
                :class="local.lyrics === true
                  ? 'bg-green-900/25 border-green-600/40 text-green-300'
                  : 'bg-dark-600 border-white/[.08] text-gray-400 hover:text-gray-200 hover:border-white/15'"
                @click="local.lyrics = local.lyrics === true ? null : true"
              >Has lyrics</button>
              <button
                class="flex-1 py-2 rounded-lg text-xs font-medium border transition-all"
                :class="local.lyrics === false
                  ? 'bg-red-900/25 border-red-600/40 text-red-300'
                  : 'bg-dark-600 border-white/[.08] text-gray-400 hover:text-gray-200 hover:border-white/15'"
                @click="local.lyrics = local.lyrics === false ? null : false"
              >No lyrics</button>
            </div>
          </section>

          <!-- ── Tunings ── -->
          <template v-if="tuningNames.length">
            <div class="h-px bg-white/[.04]" />

            <section>
              <div class="flex items-center justify-between mb-3">
                <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Tuning</p>
                <span v-if="local.tunings.length > 0" class="text-[10px] font-semibold text-accent">
                  {{ local.tunings.length }} selected
                </span>
              </div>
              <div class="space-y-px max-h-52 overflow-y-auto -mx-1 px-1 rounded-lg">
                <div
                  v-for="t in tuningNames"
                  :key="t"
                  class="px-2 py-1.5 rounded-lg transition-colors"
                  :class="local.tunings.includes(t) ? 'bg-accent/10' : 'hover:bg-dark-600'"
                >
                  <AppCheckbox v-model="local.tunings" :value="t">{{ t }}</AppCheckbox>
                </div>
              </div>
            </section>
          </template>
        </div>

        <!-- ── Footer ── -->
        <div class="shrink-0 px-5 py-4 border-t border-white/[.05] flex gap-2.5">
          <button
            class="flex-1 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-200 transition-colors"
            @click="clear"
          >Clear all</button>
          <button
            class="flex-1 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent/90 text-white transition-colors shadow-sm shadow-accent/20"
            @click="apply"
          >Apply</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
