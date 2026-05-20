<script setup>
defineProps({
  label: { type: String, required: true },
  state: { type: String, default: 'any' }, // 'any' | 'require' | 'exclude'
})
defineEmits(['click'])
</script>

<template>
  <button
    type="button"
    class="filter-pill"
    :class="`state-${state}`"
    @click="$emit('click')"
  >
    <span
      v-if="state !== 'any'"
      class="mr-0.5"
      aria-hidden="true"
    >{{ state === 'require' ? '+' : '–' }}</span>
    {{ label }}
  </button>
</template>
