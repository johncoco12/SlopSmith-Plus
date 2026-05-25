<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/features/auth/store'
import { listProfiles, createProfile, updateProfile, deleteProfile } from '@/features/profiles/api'
import { listGroups, createGroup, updateGroup, deleteGroup } from '@/features/admin/permissions'
import type { SafeProfile, PermissionGroup, Permission } from '@/types'

const router = useRouter()
const auth   = useAuthStore()
const { t } = useI18n()

// ── Tabs ────────────────────────────────────────────────────────────────────
type Tab = 'profiles' | 'groups'
const activeTab = ref<Tab>('profiles')

// ── Data ────────────────────────────────────────────────────────────────────
const profiles = ref<SafeProfile[]>([])
const groups   = ref<PermissionGroup[]>([])
const loading  = ref(false)
const error    = ref('')

// ── Permission list ──────────────────────────────────────────────────────────
const ALL_PERMS: { key: Permission; label: string }[] = [
  { key: 'admin',              label: t('admin.permissions.admin')              },
  { key: 'upload',             label: t('admin.permissions.upload')             },
  { key: 'edit_tracks',        label: t('admin.permissions.editTracks')        },
  { key: 'delete_tracks',      label: t('admin.permissions.deleteTracks')      },
  { key: 'manage_profiles',    label: t('admin.permissions.manageProfiles')    },
  { key: 'manage_permissions', label: t('admin.permissions.managePermissions') },
  { key: 'manage_settings',    label: t('admin.permissions.manageSettings')    },
]

// ── Profile form ─────────────────────────────────────────────────────────────
const showProfileForm  = ref(false)
const editingProfile   = ref<SafeProfile | null>(null)
const profileForm = ref({ name: '', pinCode: '', recoveryPhrase: '', recoveryPhraseHint: '' })
const profileFormError = ref('')
const profileSaving    = ref(false)
const confirmDeleteProfileId = ref<number | null>(null)

function openCreateProfile() {
  editingProfile.value = null
  profileForm.value = { name: '', pinCode: '', recoveryPhrase: '', recoveryPhraseHint: '' }
  profileFormError.value = ''
  showProfileForm.value = true
}

function openEditProfile(p: SafeProfile) {
  editingProfile.value = p
  profileForm.value = { name: p.name, pinCode: '', recoveryPhrase: '', recoveryPhraseHint: '' }
  profileFormError.value = ''
  showProfileForm.value = true
}

function cancelProfileForm() {
  showProfileForm.value = false
  editingProfile.value = null
}

async function saveProfile() {
  profileFormError.value = ''
  profileSaving.value = true
  try {
    if (editingProfile.value) {
      const patch: Record<string, unknown> = { name: profileForm.value.name }
      if (profileForm.value.pinCode) patch.pinCode = profileForm.value.pinCode
      await updateProfile(editingProfile.value.id, patch)
    } else {
      await createProfile({
        name:               profileForm.value.name,
        pinCode:            profileForm.value.pinCode,
        recoveryPhrase:     profileForm.value.recoveryPhrase,
        recoveryPhraseHint: profileForm.value.recoveryPhraseHint,
      })
    }
    await loadAll()
    showProfileForm.value = false
  } catch (e: any) {
    profileFormError.value = e.message ?? t('admin.profiles.saveError')
  } finally {
    profileSaving.value = false
  }
}

async function toggleLock(p: SafeProfile) {
  try {
    await updateProfile(p.id, { locked: !p.locked })
    await loadAll()
  } catch (e: any) {
    error.value = e.message ?? t('admin.profiles.updateError')
  }
}

async function confirmDeleteProfile(id: number) {
  confirmDeleteProfileId.value = id
}

async function doDeleteProfile() {
  if (confirmDeleteProfileId.value === null) return
  try {
    await deleteProfile(confirmDeleteProfileId.value)
    await loadAll()
  } catch (e: any) {
    error.value = e.message ?? t('admin.profiles.deleteError')
  } finally {
    confirmDeleteProfileId.value = null
  }
}

// ── Group form ────────────────────────────────────────────────────────────────
const showGroupForm   = ref(false)
const editingGroup    = ref<PermissionGroup | null>(null)
const groupForm = ref<{ name: string; permissions: Permission[]; profileIds: number[] }>({
  name: '', permissions: [], profileIds: [],
})
const groupFormError  = ref('')
const groupSaving     = ref(false)
const confirmDeleteGroupId = ref<number | null>(null)

function openCreateGroup() {
  editingGroup.value = null
  groupForm.value = { name: '', permissions: [], profileIds: [] }
  groupFormError.value = ''
  showGroupForm.value = true
}

function openEditGroup(g: PermissionGroup) {
  editingGroup.value = g
  groupForm.value = {
    name:        g.name,
    permissions: [...g.permissions],
    profileIds:  [...g.profileIds],
  }
  groupFormError.value = ''
  showGroupForm.value = true
}

function cancelGroupForm() {
  showGroupForm.value = false
  editingGroup.value = null
}

function togglePermission(perm: Permission) {
  const idx = groupForm.value.permissions.indexOf(perm)
  if (idx === -1) groupForm.value.permissions.push(perm)
  else groupForm.value.permissions.splice(idx, 1)
}

function toggleProfileInGroup(id: number) {
  const idx = groupForm.value.profileIds.indexOf(id)
  if (idx === -1) groupForm.value.profileIds.push(id)
  else groupForm.value.profileIds.splice(idx, 1)
}

async function saveGroup() {
  groupFormError.value = ''
  groupSaving.value = true
  try {
    if (editingGroup.value) {
      await updateGroup(editingGroup.value.id, {
        name:        groupForm.value.name,
        permissions: groupForm.value.permissions,
        profileIds:  groupForm.value.profileIds,
      })
    } else {
      await createGroup({
        name:        groupForm.value.name,
        permissions: groupForm.value.permissions,
        profileIds:  groupForm.value.profileIds,
      })
    }
    await loadAll()
    showGroupForm.value = false
  } catch (e: any) {
    groupFormError.value = e.message ?? t('admin.groups.saveError')
  } finally {
    groupSaving.value = false
  }
}

async function confirmDeleteGroup(id: number) {
  confirmDeleteGroupId.value = id
}

async function doDeleteGroup() {
  if (confirmDeleteGroupId.value === null) return
  try {
    await deleteGroup(confirmDeleteGroupId.value)
    await loadAll()
  } catch (e: any) {
    error.value = e.message ?? t('admin.groups.deleteError')
  } finally {
    confirmDeleteGroupId.value = null
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const PROFILE_COLORS = [
  '#4080e0','#e8c040','#ef4444','#22c55e','#a855f7',
  '#f97316','#06b6d4','#ec4899','#84cc16','#6366f1',
]
function profileColor(id: number) { return PROFILE_COLORS[id % PROFILE_COLORS.length] }
function profileName(id: number)  { return profiles.value.find(p => p.id === id)?.name ?? `#${id}` }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

// ── Load ─────────────────────────────────────────────────────────────────────
async function loadAll() {
  loading.value = true
  error.value   = ''
  try {
    const [p, g] = await Promise.all([listProfiles(), listGroups()])
    profiles.value = p
    groups.value   = g
  } catch (e: any) {
    error.value = e.message ?? t('admin.loadError')
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="min-h-screen bg-dark-800 px-4 pb-12">

    <!-- Header -->
    <div class="flex items-center gap-3 py-4 border-b border-white/[.06] mb-6">
      <button
        class="p-1.5 rounded-lg hover:bg-dark-600 transition text-gray-400 hover:text-gray-200"
        aria-label="Back"
        @click="router.back()"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-accent" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <h1 class="text-base font-semibold text-gray-100">{{ $t('admin.title') }}</h1>
      </div>
    </div>

    <!-- Global error -->
    <div v-if="error" class="max-w-3xl mx-auto mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
      <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
      {{ error }}
      <button class="ml-auto text-gray-500 hover:text-gray-300" @click="error = ''">✕</button>
    </div>

    <div class="max-w-3xl mx-auto">

      <!-- Tabs -->
      <div class="flex gap-1 mb-6 bg-dark-700 p-1 rounded-xl border border-white/[.06] w-fit">
        <button
          v-for="tab in ([{ key: 'profiles', label: $t('admin.tabs.profiles') }, { key: 'groups', label: $t('admin.tabs.groups') }] as const)"
          :key="tab.key"
          class="px-4 py-1.5 rounded-lg text-sm font-medium transition"
          :class="activeTab === tab.key
            ? 'bg-accent text-white shadow'
            : 'text-gray-400 hover:text-gray-200'"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- ════════════════ PROFILES TAB ════════════════ -->
      <div v-if="activeTab === 'profiles'">

        <!-- Profile Form Modal -->
        <div v-if="showProfileForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" @click.self="cancelProfileForm">
          <div class="bg-dark-700 border border-white/[.08] rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 class="text-base font-semibold text-gray-100 mb-5">
              {{ editingProfile ? $t('admin.profiles.editTitle') : $t('admin.profiles.createTitle') }}
            </h2>

            <div class="space-y-4">
              <div>
                <label class="settings-label">{{ $t('admin.profiles.nameLabel') }}</label>
                <input v-model="profileForm.name" type="text" class="settings-input" :placeholder="$t('admin.profiles.namePlaceholder')" />
              </div>
              <div>
                <label class="settings-label">
                  {{ editingProfile ? $t('admin.profiles.newPinLabel') : $t('admin.profiles.pinLabel') }}
                </label>
                <input v-model="profileForm.pinCode" type="password" class="settings-input" :placeholder="$t('admin.profiles.pinPlaceholder')" autocomplete="new-password" />
              </div>
              <template v-if="!editingProfile">
                <div>
                  <label class="settings-label">{{ $t('admin.profiles.recoveryLabel') }}</label>
                  <input v-model="profileForm.recoveryPhrase" type="password" class="settings-input" :placeholder="$t('admin.profiles.recoveryPlaceholder')" autocomplete="new-password" />
                </div>
                <div>
                  <label class="settings-label">{{ $t('admin.profiles.recoveryHintLabel') }} <span class="text-gray-500">{{ $t('common.optional') }}</span></label>
                  <input v-model="profileForm.recoveryPhraseHint" type="text" class="settings-input" :placeholder="$t('admin.profiles.recoveryHintPlaceholder')" />
                </div>
              </template>
            </div>

            <div v-if="profileFormError" class="mt-3 text-sm text-red-400">{{ profileFormError }}</div>

            <div class="flex justify-end gap-2 mt-6">
              <button class="settings-btn" @click="cancelProfileForm">{{ $t('common.cancel') }}</button>
              <button
                class="settings-btn primary"
                :disabled="profileSaving"
                @click="saveProfile"
              >
                {{ profileSaving ? $t('common.saving') : $t('common.save') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Confirm delete profile -->
        <div v-if="confirmDeleteProfileId !== null" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div class="bg-dark-700 border border-white/[.08] rounded-2xl p-6 w-full max-w-sm shadow-xl text-center">
            <p class="text-gray-200 mb-4">{{ $t('admin.profiles.deleteConfirm') }}</p>
            <div class="flex justify-center gap-3">
              <button class="settings-btn" @click="confirmDeleteProfileId = null">{{ $t('common.cancel') }}</button>
              <button class="settings-btn !bg-red-500/20 !border-red-500/40 !text-red-400 hover:!bg-red-500/30" @click="doDeleteProfile">{{ $t('common.delete') }}</button>
            </div>
          </div>
        </div>

        <!-- Profiles header -->
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-400">{{ profiles.length }} profile{{ profiles.length === 1 ? '' : 's' }}</p>
          <button class="settings-btn primary" @click="openCreateProfile">
            <span class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
              New Profile
            </span>
          </button>
        </div>

        <div v-if="loading" class="text-center py-12 text-gray-500 text-sm">{{ $t('common.loading') }}</div>

        <!-- Profile cards -->
        <div v-else class="space-y-2">
          <div
            v-for="p in profiles"
            :key="p.id"
            class="settings-section !space-y-0 flex items-center gap-4"
          >
            <!-- Avatar -->
            <div
              class="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0 select-none"
              :style="{ background: profileColor(p.id) }"
            >
              {{ p.name.charAt(0).toUpperCase() }}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium text-gray-100">{{ p.name }}</span>
                <span
                  v-if="p.locked"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-400 font-medium"
                >{{ $t('admin.profiles.locked') }}</span>
                <span
                  v-if="p.id === auth.profile?.id"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent font-medium"
                >{{ $t('admin.profiles.you') }}</span>
              </div>
              <p class="text-xs text-gray-500 mt-0.5">{{ $t('admin.profiles.createdAt', { date: fmtDate(p.createdAt) }) }}</p>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1 shrink-0">
              <button
                class="settings-btn text-xs"
                :class="p.locked ? '!text-green-400 !border-green-500/30 !bg-green-500/10' : '!text-yellow-400 !border-yellow-500/30 !bg-yellow-500/10'"
                :title="p.locked ? 'Unlock' : 'Lock'"
                @click="toggleLock(p)"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path v-if="p.locked" stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                  <path v-else stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                </svg>
              </button>
              <button class="settings-btn text-xs" title="Edit" @click="openEditProfile(p)">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>
              </button>
              <button
                class="settings-btn text-xs !text-red-400 !border-red-500/30 !bg-red-500/10 hover:!bg-red-500/20"
                title="Delete"
                :disabled="p.id === auth.profile?.id"
                @click="confirmDeleteProfile(p.id)"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
              </button>
            </div>
          </div>

          <div v-if="profiles.length === 0" class="text-center py-12 text-gray-500 text-sm">{{ $t('admin.profiles.empty') }}</div>
        </div>
      </div>

      <!-- ════════════════ GROUPS TAB ════════════════ -->
      <div v-else-if="activeTab === 'groups'">

        <!-- Group form modal -->
        <div v-if="showGroupForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" @click.self="cancelGroupForm">
          <div class="bg-dark-700 border border-white/[.08] rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-base font-semibold text-gray-100 mb-5">
              {{ editingGroup ? $t('admin.groups.editTitle') : $t('admin.groups.createTitle') }}
            </h2>

            <div class="space-y-5">
              <!-- Name -->
              <div>
                <label class="settings-label">{{ $t('admin.groups.nameLabel') }}</label>
                <input v-model="groupForm.name" type="text" class="settings-input" :placeholder="$t('admin.groups.namePlaceholder')" />
              </div>

              <!-- Permissions -->
              <div>
                <label class="settings-label mb-2 block">{{ $t('admin.groups.permissionsLabel') }}</label>
                <div class="grid grid-cols-2 gap-2">
                  <label
                    v-for="perm in ALL_PERMS"
                    :key="perm.key"
                    class="flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition select-none"
                    :class="groupForm.permissions.includes(perm.key)
                      ? 'bg-accent/15 border-accent/40 text-accent'
                      : 'bg-dark-600 border-white/[.06] text-gray-400 hover:border-white/20'"
                  >
                    <input
                      type="checkbox"
                      class="hidden"
                      :checked="groupForm.permissions.includes(perm.key)"
                      @change="togglePermission(perm.key)"
                    />
                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <path v-if="groupForm.permissions.includes(perm.key)" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                      <path v-else stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                    <span class="text-xs font-medium">{{ perm.label }}</span>
                  </label>
                </div>
              </div>

              <!-- Profiles -->
              <div>
                <label class="settings-label mb-2 block">{{ $t('admin.groups.assignProfilesLabel') }}</label>
                <div v-if="profiles.length === 0" class="text-xs text-gray-500">{{ $t('admin.groups.noProfiles') }}</div>
                <div v-else class="flex flex-wrap gap-2">
                  <button
                    v-for="p in profiles"
                    :key="p.id"
                    type="button"
                    class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition"
                    :class="groupForm.profileIds.includes(p.id)
                      ? 'text-white border-transparent'
                      : 'bg-dark-600 border-white/[.06] text-gray-400 hover:border-white/20'"
                    :style="groupForm.profileIds.includes(p.id) ? { background: profileColor(p.id), borderColor: profileColor(p.id) } : {}"
                    @click="toggleProfileInGroup(p.id)"
                  >
                    <span
                      class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      :style="{ background: profileColor(p.id) }"
                    >{{ p.name.charAt(0).toUpperCase() }}</span>
                    {{ p.name }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="groupFormError" class="mt-3 text-sm text-red-400">{{ groupFormError }}</div>

            <div class="flex justify-end gap-2 mt-6">
              <button class="settings-btn" @click="cancelGroupForm">{{ $t('common.cancel') }}</button>
              <button
                class="settings-btn primary"
                :disabled="groupSaving"
                @click="saveGroup"
              >
                {{ groupSaving ? $t('common.saving') : $t('common.save') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Confirm delete group -->
        <div v-if="confirmDeleteGroupId !== null" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div class="bg-dark-700 border border-white/[.08] rounded-2xl p-6 w-full max-w-sm shadow-xl text-center">
            <p class="text-gray-200 mb-4">{{ $t('admin.groups.deleteConfirm') }}</p>
            <div class="flex justify-center gap-3">
              <button class="settings-btn" @click="confirmDeleteGroupId = null">{{ $t('common.cancel') }}</button>
              <button class="settings-btn !bg-red-500/20 !border-red-500/40 !text-red-400 hover:!bg-red-500/30" @click="doDeleteGroup">{{ $t('common.delete') }}</button>
            </div>
          </div>
        </div>

        <!-- Groups header -->
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-400">{{ groups.length }} group{{ groups.length === 1 ? '' : 's' }}</p>
          <button class="settings-btn primary" @click="openCreateGroup">
            <span class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
              New Group
            </span>
          </button>
        </div>

        <div v-if="loading" class="text-center py-12 text-gray-500 text-sm">{{ $t('common.loading') }}</div>

        <!-- Group cards -->
        <div v-else class="space-y-2">
          <div
            v-for="g in groups"
            :key="g.id"
            class="settings-section !space-y-0"
          >
            <div class="flex items-start gap-4">
              <!-- Icon -->
              <div class="w-10 h-10 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                <svg class="w-5 h-5 text-accent" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/>
                </svg>
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-100">{{ g.name }}</p>

                <!-- Permissions pills -->
                <div class="flex flex-wrap gap-1 mt-1.5">
                  <span
                    v-for="perm in g.permissions"
                    :key="perm"
                    class="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-medium"
                  >{{ perm }}</span>
                  <span v-if="g.permissions.length === 0" class="text-xs text-gray-600 italic">{{ $t('admin.groups.noPermissions') }}</span>
                </div>

                <!-- Assigned profiles -->
                <div class="flex flex-wrap items-center gap-1.5 mt-2">
                  <span class="text-xs text-gray-500">{{ $t('admin.groups.members') }}</span>
                  <template v-if="g.profileIds.length > 0">
                    <span
                      v-for="pid in g.profileIds"
                      :key="pid"
                      class="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border"
                      :style="{ borderColor: profileColor(pid) + '55', background: profileColor(pid) + '22', color: profileColor(pid) }"
                    >
                      <span
                        class="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                        :style="{ background: profileColor(pid) }"
                      >{{ profileName(pid).charAt(0).toUpperCase() }}</span>
                      {{ profileName(pid) }}
                    </span>
                  </template>
                  <span v-else class="text-xs text-gray-600 italic">{{ $t('admin.groups.noMembers') }}</span>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1 shrink-0">
                <button class="settings-btn text-xs" title="Edit" @click="openEditGroup(g)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>
                </button>
                <button
                  class="settings-btn text-xs !text-red-400 !border-red-500/30 !bg-red-500/10 hover:!bg-red-500/20"
                  title="Delete"
                  @click="confirmDeleteGroup(g.id)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                </button>
              </div>
            </div>
          </div>

          <div v-if="groups.length === 0" class="text-center py-12 text-gray-500 text-sm">{{ $t('admin.groups.empty') }}</div>
        </div>
      </div>

    </div>
  </div>
</template>
