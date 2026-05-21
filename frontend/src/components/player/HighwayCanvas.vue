<script setup lang="ts">
import { useHighway } from '@/highway'

// Initialises createHighway() once mounted and registers it in the player store.
// The canvas id="highway" must be in the DOM before createHighway() runs —
// Vue guarantees this because onMounted in the composable fires after this
// component's DOM is ready.
useHighway()
</script>

<template>
  <canvas
    id="highway"
    class="flex-1 block w-full min-h-0"
    aria-label="Note highway"
  />
</template>
