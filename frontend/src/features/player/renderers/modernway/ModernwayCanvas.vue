<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { provide } from 'vue'
import { usePlayer } from '@/features/player'
import { renderBundleKey } from '@/features/player/renderers/keys'
import ModernwayScene from './ModernwayScene.vue'
import ModernwayOverlays from './ModernwayOverlays.vue'

// Renderer-agnostic player: loads data, drives timing, produces bundle
const { bundle } = usePlayer()

// Provide bundle to TresJS scene children
provide(renderBundleKey, bundle as any)
</script>

<template>
  <div class="relative flex-1 min-h-0 w-full">
    <TresCanvas
      clear-color="#101820"
      :antialias="true"
      :alpha="false"
      window-size
      class="block w-full h-full"
    >
      <ModernwayScene />
    </TresCanvas>
    <ModernwayOverlays />
  </div>
</template>


