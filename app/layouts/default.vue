<template>
  <div class="flex flex-col min-h-screen">
    <!-- Navbar -->
    <header class="sticky top-0 z-40 bg-base-100/90 backdrop-blur border-b border-base-300">
      <div class="navbar max-w-7xl mx-auto px-4">
        <!-- Brand -->
        <div class="navbar-start gap-2">
          <NuxtLink to="/" class="btn btn-ghost text-xl font-bold gap-2 text-primary">
            <Icon name="lucide:map-pin" class="w-6 h-6 text-emerald-600" />
            <span>ImmoDB <span class="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-mono font-normal">AI</span></span>
          </NuxtLink>
        </div>

        <!-- Center Nav -->
        <div class="navbar-center hidden md:flex">
          <ul class="menu menu-horizontal px-1 gap-1 font-medium">
            <li>
              <NuxtLink to="/" active-class="active">
                <Icon name="lucide:layout-dashboard" class="w-4 h-4" />
                Übersicht & Vergleich
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/settings" active-class="active">
                <Icon name="lucide:settings" class="w-4 h-4" />
                Dienste & API
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Navbar End: Status & Actions -->
        <div class="navbar-end gap-3">
          <!-- Globale Suche -->
          <button
            class="btn btn-ghost btn-sm gap-2 border border-base-300 text-base-content/60 hover:text-base-content font-normal"
            title="Alles durchsuchen (⌘K)"
            @click="palette?.toggle()"
          >
            <Icon name="lucide:search" class="w-4 h-4" />
            <span class="hidden md:inline">Suchen</span>
            <kbd class="kbd kbd-xs hidden md:inline-flex">⌘K</kbd>
          </button>

          <!-- Geobasis Daemon Status Indicator -->
          <NuxtLink 
            to="/settings" 
            class="badge gap-1.5 py-3 cursor-pointer text-xs font-mono transition-colors"
            :class="geobasisOnline ? 'badge-success badge-outline text-success' : 'badge-warning badge-outline text-warning'"
            :title="geobasisOnline ? 'Geobasis Daemon verbunden (Port 8080)' : 'Geobasis Daemon offline. Klicke für Details.'"
          >
            <span class="w-2 h-2 rounded-full" :class="geobasisOnline ? 'bg-success animate-pulse' : 'bg-warning'"></span>
            <span class="hidden sm:inline">Geobasis:</span>
            <span>{{ geobasisOnline ? 'Online' : 'Offline' }}</span>
          </NuxtLink>

          <!-- Theme Toggle -->
          <button 
            class="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:text-base-content"
            :title="currentTheme === 'night' ? 'Zum hellen Design wechseln' : 'Zum dunklen Design wechseln'"
            @click="toggleTheme"
          >
            <Icon :name="currentTheme === 'night' ? 'lucide:sun' : 'lucide:moon'" class="w-4 h-4" />
          </button>

          <!-- New Property Button -->
          <button 
            class="btn btn-primary btn-sm gap-2 shadow-xs"
            @click="openNewModal = true"
          >
            <Icon name="lucide:plus-circle" class="w-4 h-4" />
            <span class="hidden sm:inline">Grundstück erfassen</span>
          </button>
        </div>
      </div>
    </header>

    <CommandPalette ref="palette" />

    <!-- Main Body -->
    <main class="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
      <slot />
    </main>

    <!-- Modal for adding a new property -->
    <NewPropertyModal v-if="openNewModal" @close="openNewModal = false" @created="onPropertyCreated" />

    <!-- Global Toast Notifications -->
    <AppToast />

    <!-- Footer -->
    <footer class="footer footer-center p-4 bg-base-100 text-base-content border-t border-base-300 text-xs">
      <aside class="flex flex-col sm:flex-row items-center gap-2 text-base-content/70">
        <span>ImmoDB AI &bull; Grundstücks-Tracker & KI-Analyse</span>
        <span class="hidden sm:inline">&bull;</span>
        <span>Anbindung an <strong>geobasis-cli</strong> (LGB Kataster & BORIS Brandenburg)</span>
        <span class="hidden sm:inline">&bull;</span>
        <span>Gemini 2.5 Flash Multimodal</span>
      </aside>
    </footer>
  </div>
</template>

<script setup lang="ts">
const palette = ref<{ toggle: () => void } | null>(null)

import { ref, onMounted, onUnmounted } from 'vue'
import { useTheme } from '~/composables/useTheme'

const { currentTheme, toggleTheme } = useTheme()

const openNewModal = ref(false)
const geobasisOnline = ref(false)

async function checkGeobasis() {
  try {
    const res = await $fetch<any>('/api/geobasis/health')
    geobasisOnline.value = res.online === true
  } catch {
    geobasisOnline.value = false
  }
}

function onPropertyCreated(id: string) {
  openNewModal.value = false
  navigateTo(`/properties/${id}`)
}

onMounted(() => {
  checkGeobasis()
  const interval = setInterval(checkGeobasis, 15000)
  onUnmounted(() => clearInterval(interval))
})
</script>
