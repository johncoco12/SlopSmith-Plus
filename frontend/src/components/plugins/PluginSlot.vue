<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { useSlotManager } from '@/plugins/SlotManager'

const props = defineProps<{
  name: string
}>()

const attrs = useAttrs()
const slotManager = useSlotManager()
const registrations = computed(() => slotManager.get(props.name))
const passedProps = computed(() => attrs)
</script>

<template>
  <template v-for="reg in registrations" :key="reg.pluginId">
    <component :is="reg.component" v-bind="{ ...reg.props, ...passedProps }" />
  </template>
</template>
