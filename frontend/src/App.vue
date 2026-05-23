<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppNav from '@/components/layout/AppNav.vue'
import { useSettingsStore } from '@/stores/settings'
import { usePluginsStore } from '@/stores/plugins'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const settings = useSettingsStore()
const plugins = usePluginsStore()
const auth = useAuthStore()

const isPlayer = computed(() => route.name === 'player')
const showLayout = computed(() => route.name !== 'player' && route.name !== 'setup' && route.name !== 'profiles')

onMounted(async () => {
  await settings.load()
  await plugins.load()
})
</script>

<template>
  <div class="min-h-screen bg-dark-800 text-gray-200 font-sans">
    <AppNav v-if="showLayout" />
    <main :class="isPlayer ? '' : 'pt-14'">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['LibraryView', 'FavoritesView']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
  </div>
</template>