import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  checkSetup,
  initialSetup,
  login as apiLogin,
  logout as apiLogout,
  getSession,
  getMyPermissions,
} from '@/features/auth/api'
import { setToken } from '@/api/index'
import type { SafeProfile, Permission, PERMISSIONS } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const isSetupDone = ref<boolean | null>(null)
  const profile = ref<SafeProfile | null>(null)
  const token = ref<string | null>(localStorage.getItem('slopsmith_token'))
  const permissions = ref<Permission[]>([])

  const isLoggedIn = computed(() => !!profile.value && !!token.value)
  const isAdmin = computed(() => permissions.value.includes('admin'))

  async function checkSetupStatus(): Promise<boolean> {
    const res = await checkSetup()
    isSetupDone.value = res.setup
    return res.setup
  }

  async function setup(data: {
    name: string
    pinCode: string
    recoveryPhrase: string
    recoveryPhraseHint?: string
  }): Promise<SafeProfile> {
    const p = await initialSetup(data)
    isSetupDone.value = true
    return p
  }

  async function login(name: string, pinCode: string): Promise<void> {
    const res = await apiLogin(name, pinCode)
    token.value = res.token
    profile.value = res.profile
    setToken(res.token)
    await refreshPermissions()
  }

  async function logout(): Promise<void> {
    try { await apiLogout() } catch { /* ignore */ }
    token.value = null
    profile.value = null
    permissions.value = []
    setToken(null)
  }

  async function restoreSession(): Promise<boolean> {
    if (!token.value) return false
    try {
      const res = await getSession()
      profile.value = res.profile
      await refreshPermissions()
      return true
    } catch {
      token.value = null
      profile.value = null
      setToken(null)
      return false
    }
  }

  async function refreshPermissions(): Promise<void> {
    try {
      const res = await getMyPermissions()
      permissions.value = res.permissions
    } catch {
      permissions.value = []
    }
  }

  function hasPermission(perm: Permission): boolean {
    if (permissions.value.includes('admin')) return true
    return permissions.value.includes(perm)
  }

  return {
    isSetupDone,
    profile,
    token,
    permissions,
    isLoggedIn,
    isAdmin,
    checkSetupStatus,
    setup,
    login,
    logout,
    restoreSession,
    refreshPermissions,
    hasPermission,
  }
})