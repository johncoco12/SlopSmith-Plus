<script setup>
import { computed } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  filters: { type: Object, required: true },
})
const emit = defineEmits(['clear', 'update'])

const chips = computed(() => {
  const f = props.filters
  const out = []
  f.arrangements.has.forEach(a   => out.push({ key: `arr-has-${a}`,  label: `Arr: ${a}`,      remove: () => remove('arrangements', 'has', a)   }))
  f.arrangements.lacks.forEach(a => out.push({ key: `arr-lk-${a}`,   label: `No ${a}`,         remove: () => remove('arrangements', 'lacks', a) }))
  f.stems.has.forEach(s          => out.push({ key: `stem-has-${s}`,  label: `Stem: ${s}`,      remove: () => remove('stems', 'has', s)          }))
  f.stems.lacks.forEach(s        => out.push({ key: `stem-lk-${s}`,   label: `No stem: ${s}`,   remove: () => remove('stems', 'lacks', s)        }))
  if (f.lyrics === true)           out.push({ key: 'lyr-y',           label: 'Has lyrics',       remove: () => setLyrics(null)                   })
  if (f.lyrics === false)          out.push({ key: 'lyr-n',           label: 'No lyrics',        remove: () => setLyrics(null)                   })
  f.tunings.forEach(t            => out.push({ key: `tun-${t}`,       label: `Tuning: ${t}`,     remove: () => remove('tunings', null, t)         }))
  return out
})

function remove(section, sub, val) {
  const f = JSON.parse(JSON.stringify(props.filters))
  if (sub) f[section][sub] = f[section][sub].filter(v => v !== val)
  else     f[section]       = f[section].filter(v => v !== val)
  emit('update', f)
}

function setLyrics(val) {
  const f = JSON.parse(JSON.stringify(props.filters))
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
    >Clear all</button>
  </div>
</template>
