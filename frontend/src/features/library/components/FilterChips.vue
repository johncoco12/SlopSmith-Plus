<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'

import type { LibraryFilters } from '@/types'

const props = defineProps<{
  filters: LibraryFilters
}>()
const emit = defineEmits<{
  clear: []
  update: [filters: LibraryFilters]
}>()

const { t } = useI18n()

const chips = computed(() => {
  const f = props.filters
  const out = []
  f.arrangements.has.forEach(a   => out.push({ key: `arr-has-${a}`,  label: t('library.chips.arrangement', { name: a }),      remove: () => remove('arrangements', 'has', a)   }))
  f.arrangements.lacks.forEach(a => out.push({ key: `arr-lk-${a}`,   label: t('library.chips.noArrangement', { name: a }),         remove: () => remove('arrangements', 'lacks', a) }))
  f.stems.has.forEach(s          => out.push({ key: `stem-has-${s}`,  label: t('library.chips.stem', { name: s }),      remove: () => remove('stems', 'has', s)          }))
  f.stems.lacks.forEach(s        => out.push({ key: `stem-lk-${s}`,   label: t('library.chips.noStem', { name: s }),   remove: () => remove('stems', 'lacks', s)        }))
  if (f.lyrics === true)           out.push({ key: 'lyr-y',           label: t('library.chips.hasLyrics'),       remove: () => setLyrics(null)                   })
  if (f.lyrics === false)          out.push({ key: 'lyr-n',           label: t('library.chips.noLyrics'),        remove: () => setLyrics(null)                   })
  f.tunings.forEach(tu           => out.push({ key: `tun-${tu}`,       label: t('library.chips.tuning', { name: tu }),     remove: () => remove('tunings', null, tu)         }))
  return out
})

function remove(section: string, sub: string | null, val: string): void {
  const f = JSON.parse(JSON.stringify(props.filters)) as LibraryFilters
  if (sub) (f as any)[section][sub] = (f as any)[section][sub].filter((v: string) => v !== val)
  else     (f as any)[section]       = (f as any)[section].filter((v: string) => v !== val)
  emit('update', f)
}

function setLyrics(val: boolean | null): void {
  const f = JSON.parse(JSON.stringify(props.filters)) as LibraryFilters
  f.lyrics = val
  emit('update', f)
}
</script>

<template>
  <div v-if="chips.length" class="flex flex-wrap items-center gap-1.5">
    <span v-for="chip in chips" :key="chip.key" class="filter-chip">
      {{ chip.label }}
      <button
        :aria-label="`Remove ${chip.label} filter`"
        @click="chip.remove()"
      >
        <X :size="10" stroke-width="3" />
      </button>
    </span>
    <button
      class="t-caption hover:text-gray-300 transition ml-1"
      @click="emit('clear')"
    >{{ $t('library.chips.clearAll') }}</button>
  </div>
</template>
