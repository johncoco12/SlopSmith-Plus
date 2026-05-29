<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ShieldCheck, RefreshCw, AlertCircle } from 'lucide-vue-next'
import { post } from '@/api/index'
import { useAuthStore } from '@/features/auth/store'
import { listProfiles, createProfile, updateProfile, deleteProfile } from '@/features/profiles/api'
import { listGroups, createGroup, updateGroup, deleteGroup, listAvailablePermissions } from '@/features/admin/permissions'
import type { AvailablePermission } from '@/features/admin/permissions'
import type { SafeProfile, PermissionGroup, Permission } from '@/types'
import AppDialog from '@/components/ui/AppDialog.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import PluginsTab from '@/features/admin/components/PluginsTab.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const auth = useAuthStore()

type Tab = 'profiles' | 'groups' | 'plugins'
const activeTab = ref<Tab>('profiles')

const profiles = ref<SafeProfile[]>([])
const groups   = ref<PermissionGroup[]>([])
const loading  = ref(false)
const error    = ref('')

// ── Restart ──────────────────────────────────────────────────────────────────

const restarting    = ref(false)
const restartPrompt = ref(false)

async function waitForBackend(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500))
    try {
      const res = await fetch('/api/startup-status')
      if (res.ok) return
    } catch { /* still down */ }
  }
}

async function restartServer(): Promise<void> {
  restartPrompt.value = false
  restarting.value = true
  try { await post('/api/admin/restart', {}) } catch { /* expected */ }
  await waitForBackend()
  window.location.reload()
}

// ── Permissions ───────────────────────────────────────────────────────────────

const availablePerms = ref<AvailablePermission[]>([
  { name: 'admin',              description: t('admin.permissions.admin')              },
  { name: 'upload',             description: t('admin.permissions.upload')             },
  { name: 'edit_tracks',        description: t('admin.permissions.editTracks')        },
  { name: 'delete_tracks',      description: t('admin.permissions.deleteTracks')      },
  { name: 'manage_profiles',    description: t('admin.permissions.manageProfiles')    },
  { name: 'manage_permissions', description: t('admin.permissions.managePermissions') },
  { name: 'manage_settings',    description: t('admin.permissions.manageSettings')    },
])

async function loadAvailablePerms(): Promise<void> {
  try { availablePerms.value = await listAvailablePermissions() } catch { /* keep defaults */ }
}

// ── Profiles ──────────────────────────────────────────────────────────────────

const showProfileForm  = ref(false)
const editingProfile   = ref<SafeProfile | null>(null)
const profileForm      = ref({ name: '', pinCode: '', recoveryPhrase: '', recoveryPhraseHint: '' })
const profileFormError = ref('')
const profileSaving    = ref(false)
const confirmDeleteProfileId = ref<number | null>(null)

function openCreateProfile(): void {
  editingProfile.value  = null
  profileForm.value     = { name: '', pinCode: '', recoveryPhrase: '', recoveryPhraseHint: '' }
  profileFormError.value = ''
  showProfileForm.value = true
}

function openEditProfile(p: SafeProfile): void {
  editingProfile.value   = p
  profileForm.value      = { name: p.name, pinCode: '', recoveryPhrase: '', recoveryPhraseHint: '' }
  profileFormError.value = ''
  showProfileForm.value  = true
}

async function saveProfile(): Promise<void> {
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

async function toggleLock(p: SafeProfile): Promise<void> {
  try { await updateProfile(p.id, { locked: !p.locked }); await loadAll() }
  catch (e: any) { error.value = e.message ?? t('admin.profiles.updateError') }
}

async function doDeleteProfile(): Promise<void> {
  if (confirmDeleteProfileId.value === null) return
  try { await deleteProfile(confirmDeleteProfileId.value); await loadAll() }
  catch (e: any) { error.value = e.message ?? t('admin.profiles.deleteError') }
  finally { confirmDeleteProfileId.value = null }
}

// ── Groups ────────────────────────────────────────────────────────────────────

const showGroupForm        = ref(false)
const editingGroup         = ref<PermissionGroup | null>(null)
const groupForm            = ref<{ name: string; permissions: string[]; profileIds: number[] }>({ name: '', permissions: [], profileIds: [] })
const groupFormError       = ref('')
const groupSaving          = ref(false)
const confirmDeleteGroupId = ref<number | null>(null)

function openCreateGroup(): void {
  editingGroup.value  = null
  groupForm.value     = { name: '', permissions: [], profileIds: [] }
  groupFormError.value = ''
  showGroupForm.value = true
}

function openEditGroup(g: PermissionGroup): void {
  editingGroup.value   = g
  groupForm.value      = { name: g.name, permissions: [...g.permissions], profileIds: [...g.profileIds] }
  groupFormError.value = ''
  showGroupForm.value  = true
}

function togglePermission(perm: string): void {
  const idx = groupForm.value.permissions.indexOf(perm)
  if (idx === -1) groupForm.value.permissions.push(perm)
  else groupForm.value.permissions.splice(idx, 1)
}

function toggleProfileInGroup(id: number): void {
  const idx = groupForm.value.profileIds.indexOf(id)
  if (idx === -1) groupForm.value.profileIds.push(id)
  else groupForm.value.profileIds.splice(idx, 1)
}

async function saveGroup(): Promise<void> {
  groupFormError.value = ''
  groupSaving.value = true
  try {
    if (editingGroup.value) {
      await updateGroup(editingGroup.value.id, { name: groupForm.value.name, permissions: groupForm.value.permissions as Permission[], profileIds: groupForm.value.profileIds })
    } else {
      await createGroup({ name: groupForm.value.name, permissions: groupForm.value.permissions as Permission[], profileIds: groupForm.value.profileIds })
    }
    await loadAll()
    showGroupForm.value = false
  } catch (e: any) {
    groupFormError.value = e.message ?? t('admin.groups.saveError')
  } finally {
    groupSaving.value = false
  }
}

async function doDeleteGroup(): Promise<void> {
  if (confirmDeleteGroupId.value === null) return
  try { await deleteGroup(confirmDeleteGroupId.value); await loadAll() }
  catch (e: any) { error.value = e.message ?? t('admin.groups.deleteError') }
  finally { confirmDeleteGroupId.value = null }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROFILE_COLORS = ['#4080e0','#e8c040','#ef4444','#22c55e','#a855f7','#f97316','#06b6d4','#ec4899','#84cc16','#6366f1']
function profileColor(id: number) { return PROFILE_COLORS[id % PROFILE_COLORS.length] }
function profileName(id: number)  { return profiles.value.find(p => p.id === id)?.name ?? `#${id}` }
function fmtDate(d: string)       { return new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) }

async function loadAll(): Promise<void> {
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

onMounted(() => { loadAll(); loadAvailablePerms() })
</script>

<template>
  <AppDialog :open="open" size="xl" @close="emit('close')">

    <template #header>
      <div class="flex items-center justify-between flex-1 min-w-0 mr-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-white/[.05] border border-white/[.07] flex items-center justify-center shrink-0">
            <ShieldCheck :size="15" class="text-gray-300" />
          </div>
          <h2 class="text-sm font-semibold text-gray-100">{{ $t('admin.title') }}</h2>
        </div>
        <button
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition
                 text-orange-400 border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 shrink-0"
          :disabled="restarting"
          @click="restartPrompt = true"
        >
          <RefreshCw :size="12" />
          Restart
        </button>
      </div>
    </template>

    <!-- Restart overlay -->
    <Teleport to="body">
      <div
        v-if="restarting"
        class="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-dark-800/95 backdrop-blur-sm"
      >
        <RefreshCw :size="32" class="text-accent animate-spin" />
        <p class="text-sm font-medium text-gray-200">Restarting server…</p>
        <p class="text-xs text-gray-500">The page will reload automatically</p>
      </div>
    </Teleport>

    <!-- Restart confirm -->
    <ConfirmDialog
      :open="restartPrompt"
      title="Restart the server?"
      description="The app will be unavailable for a few seconds."
      confirm-label="Restart"
      variant="warning"
      @confirm="restartServer"
      @cancel="restartPrompt = false"
    />

    <!-- Error banner -->
    <div
      v-if="error"
      class="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400"
    >
      <AlertCircle :size="13" class="shrink-0" />
      {{ error }}
      <button class="ml-auto text-gray-500 hover:text-gray-300" @click="error = ''">✕</button>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 mb-5 bg-dark-800 p-1 rounded-xl border border-white/[.05] w-fit">
      <button
        v-for="tab in [
          { key: 'profiles', label: $t('admin.tabs.profiles') },
          { key: 'groups',   label: $t('admin.tabs.groups')   },
          { key: 'plugins',  label: $t('admin.tabs.plugins')  },
        ]"
        :key="tab.key"
        class="px-4 py-1.5 rounded-lg text-sm font-medium transition"
        :class="activeTab === tab.key
          ? 'bg-accent text-white shadow'
          : 'text-gray-400 hover:text-gray-200'"
        @click="activeTab = (tab.key as Tab)"
      >{{ tab.label }}</button>
    </div>

    <!-- ── Profiles tab ── -->
    <div v-if="activeTab === 'profiles'">

      <!-- Profile form dialog -->
      <AppDialog :open="showProfileForm" size="sm" @close="showProfileForm = false">
        <template #header>
          <h2 class="text-sm font-semibold text-gray-100">
            {{ editingProfile ? $t('admin.profiles.editTitle') : $t('admin.profiles.createTitle') }}
          </h2>
        </template>

        <div class="space-y-4">
          <div>
            <label class="settings-label">{{ $t('admin.profiles.nameLabel') }}</label>
            <input v-model="profileForm.name" type="text" class="settings-input w-full" :placeholder="$t('admin.profiles.namePlaceholder')" />
          </div>
          <div>
            <label class="settings-label">{{ editingProfile ? $t('admin.profiles.newPinLabel') : $t('admin.profiles.pinLabel') }}</label>
            <input v-model="profileForm.pinCode" type="password" class="settings-input w-full" :placeholder="$t('admin.profiles.pinPlaceholder')" autocomplete="new-password" />
          </div>
          <template v-if="!editingProfile">
            <div>
              <label class="settings-label">{{ $t('admin.profiles.recoveryLabel') }}</label>
              <input v-model="profileForm.recoveryPhrase" type="password" class="settings-input w-full" :placeholder="$t('admin.profiles.recoveryPlaceholder')" autocomplete="new-password" />
            </div>
            <div>
              <label class="settings-label">{{ $t('admin.profiles.recoveryHintLabel') }} <span class="text-gray-500">{{ $t('common.optional') }}</span></label>
              <input v-model="profileForm.recoveryPhraseHint" type="text" class="settings-input w-full" :placeholder="$t('admin.profiles.recoveryHintPlaceholder')" />
            </div>
          </template>
          <div v-if="profileFormError" class="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            <AlertCircle :size="13" class="shrink-0 mt-px" />{{ profileFormError }}
          </div>
        </div>

        <template #footer>
          <div class="flex items-center gap-3">
            <button class="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-200 border border-white/[.06] hover:border-white/15 transition-colors" @click="showProfileForm = false">{{ $t('common.cancel') }}</button>
            <button
              class="flex-1 py-2 rounded-xl text-sm font-semibold bg-accent hover:bg-accent/90 text-white transition-colors disabled:opacity-50"
              :disabled="profileSaving"
              @click="saveProfile"
            >{{ profileSaving ? $t('common.saving') : $t('common.save') }}</button>
          </div>
        </template>
      </AppDialog>

      <ConfirmDialog
        :open="confirmDeleteProfileId !== null"
        :title="$t('admin.profiles.deleteConfirm')"
        :confirm-label="$t('common.delete')"
        :cancel-label="$t('common.cancel')"
        variant="danger"
        @confirm="doDeleteProfile"
        @cancel="confirmDeleteProfileId = null"
      />

      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-gray-400">{{ profiles.length }} profile{{ profiles.length === 1 ? '' : 's' }}</p>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/90 text-white transition-colors"
          @click="openCreateProfile"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          New Profile
        </button>
      </div>

      <div v-if="loading" class="text-center py-10 text-gray-500 text-sm">{{ $t('common.loading') }}</div>
      <div v-else class="space-y-2">
        <div
          v-for="p in profiles"
          :key="p.id"
          class="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[.06] bg-white/[.02]"
        >
          <div
            class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 select-none"
            :style="{ background: profileColor(p.id) }"
          >{{ p.name.charAt(0).toUpperCase() }}</div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium text-gray-100">{{ p.name }}</span>
              <span v-if="p.locked" class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-400 font-medium">{{ $t('admin.profiles.locked') }}</span>
              <span v-if="p.id === auth.profile?.id" class="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent font-medium">{{ $t('admin.profiles.you') }}</span>
            </div>
            <p class="text-xs text-gray-500 mt-0.5">{{ $t('admin.profiles.createdAt', { date: fmtDate(p.createdAt) }) }}</p>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button
              class="p-1.5 rounded-lg border text-xs transition"
              :class="p.locked
                ? 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20'
                : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20'"
              :title="p.locked ? 'Unlock' : 'Lock'"
              @click="toggleLock(p)"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path v-if="p.locked" stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                <path v-else stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
              </svg>
            </button>
            <button class="p-1.5 rounded-lg border text-gray-400 border-white/[.06] bg-white/[.02] hover:bg-white/[.07] hover:text-gray-200 transition" title="Edit" @click="openEditProfile(p)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>
            </button>
            <button
              class="p-1.5 rounded-lg border text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition disabled:opacity-30"
              title="Delete"
              :disabled="p.id === auth.profile?.id"
              @click="confirmDeleteProfileId = p.id"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
            </button>
          </div>
        </div>
        <div v-if="profiles.length === 0" class="text-center py-10 text-gray-500 text-sm">{{ $t('admin.profiles.empty') }}</div>
      </div>
    </div>

    <!-- ── Groups tab ── -->
    <div v-else-if="activeTab === 'groups'">

      <!-- Group form dialog -->
      <AppDialog :open="showGroupForm" size="md" @close="showGroupForm = false">
        <template #header>
          <h2 class="text-sm font-semibold text-gray-100">
            {{ editingGroup ? $t('admin.groups.editTitle') : $t('admin.groups.createTitle') }}
          </h2>
        </template>

        <div class="space-y-5">
          <div>
            <label class="settings-label">{{ $t('admin.groups.nameLabel') }}</label>
            <input v-model="groupForm.name" type="text" class="settings-input w-full" :placeholder="$t('admin.groups.namePlaceholder')" />
          </div>

          <div>
            <label class="settings-label block mb-2">{{ $t('admin.groups.permissionsLabel') }}</label>
            <div class="grid grid-cols-2 gap-1.5">
              <label
                v-for="perm in availablePerms.filter(p => !p.pluginId)"
                :key="perm.name"
                class="flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition select-none text-xs font-medium"
                :title="perm.description"
                :class="groupForm.permissions.includes(perm.name)
                  ? 'bg-accent/15 border-accent/40 text-accent'
                  : 'bg-dark-600 border-white/[.06] text-gray-400 hover:border-white/20'"
              >
                <input type="checkbox" class="hidden" :checked="groupForm.permissions.includes(perm.name)" @change="togglePermission(perm.name)" />
                <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path v-if="groupForm.permissions.includes(perm.name)" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                  <path v-else stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
                {{ perm.name }}
              </label>
            </div>

            <template v-if="availablePerms.some(p => !!p.pluginId)">
              <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mt-3 mb-1.5">Plugin permissions</p>
              <div class="grid grid-cols-2 gap-1.5">
                <label
                  v-for="perm in availablePerms.filter(p => !!p.pluginId)"
                  :key="perm.name"
                  class="flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition select-none"
                  :title="`${perm.description} (${perm.pluginId})`"
                  :class="groupForm.permissions.includes(perm.name)
                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
                    : 'bg-dark-600 border-white/[.06] text-gray-400 hover:border-white/20'"
                >
                  <input type="checkbox" class="hidden" :checked="groupForm.permissions.includes(perm.name)" @change="togglePermission(perm.name)" />
                  <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path v-if="groupForm.permissions.includes(perm.name)" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                    <path v-else stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                  <div class="min-w-0">
                    <p class="text-xs font-medium truncate">{{ perm.name }}</p>
                    <p class="text-[10px] text-gray-600 truncate">{{ perm.pluginId }}</p>
                  </div>
                </label>
              </div>
            </template>
          </div>

          <div>
            <label class="settings-label block mb-2">{{ $t('admin.groups.assignProfilesLabel') }}</label>
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
                <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" :style="{ background: profileColor(p.id) }">{{ p.name.charAt(0).toUpperCase() }}</span>
                {{ p.name }}
              </button>
            </div>
          </div>

          <div v-if="groupFormError" class="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            <AlertCircle :size="13" class="shrink-0 mt-px" />{{ groupFormError }}
          </div>
        </div>

        <template #footer>
          <div class="flex items-center gap-3">
            <button class="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-200 border border-white/[.06] hover:border-white/15 transition-colors" @click="showGroupForm = false">{{ $t('common.cancel') }}</button>
            <button
              class="flex-1 py-2 rounded-xl text-sm font-semibold bg-accent hover:bg-accent/90 text-white transition-colors disabled:opacity-50"
              :disabled="groupSaving"
              @click="saveGroup"
            >{{ groupSaving ? $t('common.saving') : $t('common.save') }}</button>
          </div>
        </template>
      </AppDialog>

      <ConfirmDialog
        :open="confirmDeleteGroupId !== null"
        :title="$t('admin.groups.deleteConfirm')"
        :confirm-label="$t('common.delete')"
        :cancel-label="$t('common.cancel')"
        variant="danger"
        @confirm="doDeleteGroup"
        @cancel="confirmDeleteGroupId = null"
      />

      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-gray-400">{{ groups.length }} group{{ groups.length === 1 ? '' : 's' }}</p>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/90 text-white transition-colors"
          @click="openCreateGroup"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          New Group
        </button>
      </div>

      <div v-if="loading" class="text-center py-10 text-gray-500 text-sm">{{ $t('common.loading') }}</div>
      <div v-else class="space-y-2">
        <div
          v-for="g in groups"
          :key="g.id"
          class="px-4 py-3 rounded-xl border border-white/[.06] bg-white/[.02]"
        >
          <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center shrink-0 mt-0.5">
              <svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/>
              </svg>
            </div>

            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-100">{{ g.name }}</p>
              <div class="flex flex-wrap gap-1 mt-1.5">
                <span v-for="perm in g.permissions" :key="perm" class="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-medium">{{ perm }}</span>
                <span v-if="g.permissions.length === 0" class="text-xs text-gray-600 italic">{{ $t('admin.groups.noPermissions') }}</span>
              </div>
              <div class="flex flex-wrap items-center gap-1.5 mt-2">
                <span class="text-xs text-gray-500">{{ $t('admin.groups.members') }}</span>
                <template v-if="g.profileIds.length > 0">
                  <span
                    v-for="pid in g.profileIds" :key="pid"
                    class="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border"
                    :style="{ borderColor: profileColor(pid) + '55', background: profileColor(pid) + '22', color: profileColor(pid) }"
                  >
                    <span class="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white" :style="{ background: profileColor(pid) }">{{ profileName(pid).charAt(0).toUpperCase() }}</span>
                    {{ profileName(pid) }}
                  </span>
                </template>
                <span v-else class="text-xs text-gray-600 italic">{{ $t('admin.groups.noMembers') }}</span>
              </div>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              <button class="p-1.5 rounded-lg border text-gray-400 border-white/[.06] bg-white/[.02] hover:bg-white/[.07] hover:text-gray-200 transition" title="Edit" @click="openEditGroup(g)">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>
              </button>
              <button class="p-1.5 rounded-lg border text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition" title="Delete" @click="confirmDeleteGroupId = g.id">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div v-if="groups.length === 0" class="text-center py-10 text-gray-500 text-sm">{{ $t('admin.groups.empty') }}</div>
      </div>
    </div>

    <!-- ── Plugins tab ── -->
    <div v-else-if="activeTab === 'plugins'">
      <PluginsTab />
    </div>

  </AppDialog>
</template>
