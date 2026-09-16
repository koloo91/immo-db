<template>
  <div class="space-y-6">
    <!-- Top Header & Stats -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Grundstücks-Portfolio & Vergleich</h1>
        <p class="text-xs sm:text-sm text-base-content/70 mt-1">
          Verwalte Angebote, prüfe B-Pläne, tracke Makler-Gespräche und vergleiche amtliche BORIS-Bodenrichtwerte.
        </p>
      </div>

      <!-- View Switcher -->
      <div class="join bg-base-100 p-1 border border-base-300 rounded-xl shadow-xs self-start md:self-auto">
        <button 
          class="join-item btn btn-sm gap-2"
          :class="currentView === 'kanban' ? 'btn-primary' : 'btn-ghost'"
          @click="currentView = 'kanban'"
        >
          <Icon name="lucide:kanban" class="w-4 h-4" />
          <span>Pipeline (Kanban)</span>
        </button>
        <button 
          class="join-item btn btn-sm gap-2"
          :class="currentView === 'table' ? 'btn-primary' : 'btn-ghost'"
          @click="currentView = 'table'"
        >
          <Icon name="lucide:table" class="w-4 h-4" />
          <span>Vergleichstabelle</span>
        </button>
        <button 
          class="join-item btn btn-sm gap-2"
          :class="currentView === 'map' ? 'btn-primary' : 'btn-ghost'"
          @click="currentView = 'map'"
        >
          <Icon name="lucide:map" class="w-4 h-4" />
          <span>Karte</span>
        </button>
      </div>
    </div>

    <!-- Portfolio KPI Stats Bar -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="stat bg-base-100 border border-base-300 rounded-xl p-3 sm:p-4 shadow-xs">
        <div class="stat-figure text-primary">
          <Icon name="lucide:home" class="w-6 h-6 opacity-70" />
        </div>
        <div class="stat-title text-xs">Gesamt Grundstücke</div>
        <div class="stat-value text-xl sm:text-2xl font-mono">{{ properties.length }}</div>
        <div class="stat-desc text-[11px] text-base-content/60">Im Suchfokus</div>
      </div>

      <div class="stat bg-base-100 border border-base-300 rounded-xl p-3 sm:p-4 shadow-xs">
        <div class="stat-figure text-secondary">
          <Icon name="lucide:search" class="w-6 h-6 opacity-70" />
        </div>
        <div class="stat-title text-xs">In Prüfung / Besichtigung</div>
        <div class="stat-value text-xl sm:text-2xl font-mono text-secondary">
          {{ activePropertiesCount }}
        </div>
        <div class="stat-desc text-[11px] text-base-content/60">Aktive Pipeline</div>
      </div>

      <div class="stat bg-base-100 border border-base-300 rounded-xl p-3 sm:p-4 shadow-xs">
        <div class="stat-figure text-accent">
          <Icon name="lucide:euro" class="w-6 h-6 opacity-70" />
        </div>
        <div class="stat-title text-xs">Ø Angebotspreis/m²</div>
        <div class="stat-value text-xl sm:text-2xl font-mono text-accent">
          {{ avgPricePerSqm ? `${avgPricePerSqm} €` : '-' }}
        </div>
        <div class="stat-desc text-[11px] text-base-content/60">Über alle Angebote</div>
      </div>

      <div class="stat bg-base-100 border border-base-300 rounded-xl p-3 sm:p-4 shadow-xs">
        <div class="stat-figure text-success">
          <Icon name="lucide:trending-up" class="w-6 h-6 opacity-70" />
        </div>
        <div class="stat-title text-xs">Ø BORIS Bodenwert</div>
        <div class="stat-value text-xl sm:text-2xl font-mono text-success">
          {{ avgBorisValue ? `${avgBorisValue} €/m²` : '-' }}
        </div>
        <div class="stat-desc text-[11px] text-base-content/60">Amtliche Richtwerte</div>
      </div>
    </div>

    <!-- Main Content by View Mode -->
    <div v-if="pending" class="flex justify-center items-center py-20">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

    <div v-else>
      <!-- 1. Kanban View -->
      <div v-if="currentView === 'kanban'">
        <PropertyKanban 
          :properties="properties" 
          @status-change="handleStatusChange" 
        />
      </div>

      <!-- 2. Comparison Table View -->
      <div v-else-if="currentView === 'table'">
        <PropertyComparisonTable :properties="properties" />
      </div>

      <!-- 3. Interactive Map View -->
      <div v-else-if="currentView === 'map'" class="h-[650px] w-full">
        <PropertyMap :properties="properties" :zoom="10" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const currentView = ref<'kanban' | 'table' | 'map'>('kanban')

const { data: propertiesData, refresh, pending } = await useFetch<any[]>('/api/properties')

const properties = computed(() => propertiesData.value || [])

const activePropertiesCount = computed(() => {
  return properties.value.filter(p => ['contacted', 'docs_requested', 'in_review', 'visiting', 'offer_made'].includes(p.status)).length
})

const avgPricePerSqm = computed(() => {
  const valid = properties.value.filter(p => p.pricePerSqm && p.pricePerSqm > 0)
  if (valid.length === 0) return null
  const sum = valid.reduce((acc, p) => acc + p.pricePerSqm, 0)
  return Math.round(sum / valid.length)
})

const avgBorisValue = computed(() => {
  const valid = properties.value.filter(p => p.parcel?.borisBodenrichtwert && p.parcel.borisBodenrichtwert > 0)
  if (valid.length === 0) return null
  const sum = valid.reduce((acc, p) => acc + p.parcel.borisBodenrichtwert, 0)
  return Math.round(sum / valid.length)
})

const toast = useToast()

async function handleStatusChange(propertyId: string, newStatus: string) {
  try {
    await $fetch(`/api/properties/${propertyId}`, {
      method: 'PUT',
      body: { status: newStatus }
    })
    await refresh()
    toast.success('Status erfolgreich aktualisiert!')
  } catch (err: any) {
    toast.error('Fehler beim Ändern des Status: ' + (err.data?.statusMessage || err.message))
  }
}
</script>
