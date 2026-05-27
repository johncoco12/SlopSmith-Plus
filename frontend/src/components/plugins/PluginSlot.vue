<script setup lang="ts">
import { computed } from 'vue'
import { useSlotManager } from '@/plugins/SlotManager'

const props = defineProps<{
  name: string
  [key: string]: unknown
}>()

const slotManager = useSlotManager()
const registrations = computed(() => slotManager.get(props.name))
const passedProps = computed(() => {
  const { name, ...rest } = props
  return rest
})
</script>

<template>
  <template v-for="reg in registrations" :key="reg.pluginId">
    <component :is="reg.component" v-bind="{ ...reg.props, ...passedProps }" />
  </template>
</template>
