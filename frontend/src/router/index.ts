import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'library',
      component: () => import('@/views/LibraryView.vue'),
    },
    {
      path: '/favorites',
      name: 'favorites',
      component: () => import('@/views/FavoritesView.vue'),
    },
    {
      path: '/player/:trackId',
      name: 'player',
      component: () => import('@/views/PlayerView.vue'),
    },
    {
      path: '/modernway/:trackId',
      name: 'modernway',
      component: () => import('@/views/ModernwayPlayerView.vue'),
    },
    {
      path: '/gear',
      name: 'gear',
      component: () => import('@/views/GearView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/audio-settings',
      name: 'audio-settings',
      component: () => import('@/views/AudioSettingsView.vue'),
    },
    {
      path: '/plugin/:id',
      name: 'plugin',
      component: () => import('@/views/PluginView.vue'),
    },
    {
      path: '/setup',
      name: 'setup',
      component: () => import('@/views/SetupView.vue'),
      meta: { public: true },
    },
    {
      path: '/profiles',
      name: 'profiles',
      component: () => import('@/views/ProfileSelectorView.vue'),
      meta: { public: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Allow public routes
  if (to.meta.public) {
    // Redirect away from setup if already done
    if (to.name === 'setup' && auth.isSetupDone === true) {
      return { name: 'profiles' }
    }
    return true
  }

  // Check setup status on first navigation
  if (auth.isSetupDone === null) {
    try {
      const setupDone = await auth.checkSetupStatus()
      if (!setupDone) return { name: 'setup' }
    } catch {
      // API unreachable — let them through
      return true
    }
  } else if (auth.isSetupDone === false) {
    return { name: 'setup' }
  }

  // Check auth
  if (!auth.isLoggedIn) {
    const restored = await auth.restoreSession()
    if (!restored) return { name: 'profiles' }
  }

  return true
})

export default router