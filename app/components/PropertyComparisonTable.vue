<template>
  <div class="space-y-4">
    <!-- Controls Bar -->
    <div class="flex flex-col sm:flex-row items-center justify-between gap-3 bg-base-100 p-3 rounded-xl border border-base-300">
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <div class="relative w-full sm:w-64">
          <Icon name="lucide:search" class="w-4 h-4 absolute left-3 top-3 text-base-content/40" />
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="Suchen nach Ort, Titel, Makler..." 
            class="input input-sm input-bordered pl-9 w-full"
          />
        </div>

        <select v-model="statusFilter" class="select select-sm select-bordered">
          <option value="all">Alle Status</option>
          <option value="new">Neu entdeckt</option>
          <option value="contacted">Makler kontaktiert</option>
          <option value="docs_requested">Unterlagen angefordert</option>
          <option value="in_review">In Prüfung</option>
          <option value="visiting">Besichtigung</option>
          <option value="offer_made">Angebot abgegeben</option>
          <option value="purchased">Gekauft</option>
          <option value="rejected">Archiviert</option>
        </select>
      </div>

      <div class="text-xs text-base-content/60 self-end sm:self-center font-mono">
        {{ filteredProperties.length }} von {{ properties.length }} Grundstücken
      </div>
    </div>

    <!-- Table Container -->
    <div class="overflow-x-auto bg-base-100 rounded-xl border border-base-300 shadow-sm">
      <table class="table table-sm md:table-md">
        <thead class="bg-base-200/60 text-xs">
          <tr>
            <th class="cursor-pointer hover:text-primary" @click="toggleSort('title')">
              Grundstück & Lage
              <Icon v-if="sortField === 'title'" :name="sortAsc ? 'lucide:arrow-up' : 'lucide:arrow-down'" class="w-3 h-3 inline ml-1" />
            </th>
            <th>Status</th>
            <th class="cursor-pointer hover:text-primary text-right" @click="toggleSort('askingPrice')">
              Kaufpreis
              <Icon v-if="sortField === 'askingPrice'" :name="sortAsc ? 'lucide:arrow-up' : 'lucide:arrow-down'" class="w-3 h-3 inline ml-1" />
            </th>
            <th class="cursor-pointer hover:text-primary text-right" @click="toggleSort('areaSqm')">
              Fläche
              <Icon v-if="sortField === 'areaSqm'" :name="sortAsc ? 'lucide:arrow-up' : 'lucide:arrow-down'" class="w-3 h-3 inline ml-1" />
            </th>
            <th class="cursor-pointer hover:text-primary text-right" @click="toggleSort('pricePerSqm')">
              Preis/m²
              <Icon v-if="sortField === 'pricePerSqm'" :name="sortAsc ? 'lucide:arrow-up' : 'lucide:arrow-down'" class="w-3 h-3 inline ml-1" />
            </th>
            <th class="text-center">Inserat</th>
            <th class="cursor-pointer hover:text-primary text-center" @click="toggleSort('aiScore')">
              KI-Score
              <Icon v-if="sortField === 'aiScore'" :name="sortAsc ? 'lucide:arrow-up' : 'lucide:arrow-down'" class="w-3 h-3 inline ml-1" />
            </th>
            <th class="text-right">BORIS Wert</th>
            <th class="text-center">BORIS Diff.</th>
            <th>Baurecht (GRZ/GFZ)</th>
            <th>Makler</th>
            <th class="text-right">Aktion</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="filteredProperties.length === 0">
            <td colspan="12" class="text-center py-12 text-base-content/50">
              Keine Grundstücke gefunden.
            </td>
          </tr>

          <tr 
            v-for="p in filteredProperties" 
            :key="p.id"
            class="hover:bg-base-200/40 transition-colors cursor-pointer group"
            @click="navigateTo(`/properties/${p.id}`)"
          >
            <!-- Title & Address with Thumbnail -->
            <td>
              <div class="flex items-center gap-3">
                <div v-if="p.primaryImageUrl" class="avatar shrink-0">
                  <div class="w-12 h-12 rounded-lg bg-base-200 overflow-hidden ring-1 ring-base-300">
                    <img :src="p.primaryImageUrl" :alt="p.title" class="object-cover w-full h-full" loading="lazy" />
                  </div>
                </div>
                <div v-else class="w-12 h-12 rounded-lg bg-base-200 flex items-center justify-center text-base-content/30 shrink-0 ring-1 ring-base-300">
                  <Icon name="lucide:image" class="w-5 h-5" />
                </div>
                <div class="min-w-0">
                  <div class="font-semibold text-sm group-hover:text-primary transition-colors flex items-center gap-1.5">
                    <span class="truncate max-w-[220px]">{{ p.title }}</span>
                    <a 
                      v-if="p.adUrl" 
                      :href="p.adUrl" 
                      target="_blank" 
                      rel="noopener"
                      class="text-base-content/40 hover:text-primary"
                      title="Inserat öffnen"
                      @click.stop
                    >
                      <Icon name="lucide:external-link" class="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <div class="text-xs text-base-content/60 flex items-center gap-1 mt-0.5">
                    <Icon name="lucide:map-pin" class="w-3 h-3 shrink-0" />
                    <span class="truncate max-w-[200px]">{{ p.address || 'Keine Adresse' }}</span>
                  </div>
                </div>
              </div>
            </td>

            <!-- Status Badge -->
            <td>
              <span class="badge badge-sm" :class="getStatusBadgeClass(p.status)">
                {{ getStatusLabel(p.status) }}
              </span>
            </td>

            <!-- Asking Price -->
            <td class="text-right font-semibold font-mono">
              <div>{{ p.askingPrice ? p.askingPrice.toLocaleString('de-DE') + ' €' : '-' }}</div>
              <div v-if="p.askingPrice && p.purchaseCostsPercent" class="text-[10px] text-base-content/50 font-normal">
                inkl. NK: {{ Math.round(p.askingPrice * (1 + p.purchaseCostsPercent / 100)).toLocaleString('de-DE') }} €
              </div>
            </td>

            <!-- Area -->
            <td class="text-right font-mono">
              {{ p.areaSqm ? p.areaSqm + ' m²' : '-' }}
            </td>

            <!-- Price per sqm -->
            <td class="text-right font-mono font-medium">
              {{ p.pricePerSqm ? Math.round(p.pricePerSqm) + ' €/m²' : '-' }}
            </td>

            <!-- Inseratsmeldung -->
            <td class="text-center">
              <span
                v-if="listingAlert(p)"
                class="badge badge-sm gap-1"
                :class="listingAlert(p)!.cls"
                :title="listingAlert(p)!.title"
              >
                <Icon :name="listingAlert(p)!.icon" class="w-3 h-3" />
                {{ listingAlert(p)!.label }}
              </span>
              <span v-else-if="p.listingStatus?.state === 'unverifiable'" class="text-base-content/30 text-xs" title="Portal lässt keine automatische Prüfung zu">
                n. p.
              </span>
              <span v-else class="text-base-content/30 text-xs">&ndash;</span>
            </td>

            <!-- KI-Gesamtbewertung -->
            <td class="text-center">
              <span
                v-if="p.latestAnalysis?.scoreOverall !== null && p.latestAnalysis?.scoreOverall !== undefined"
                class="badge badge-sm font-mono"
                :class="getScoreClass(p.latestAnalysis.scoreOverall)"
                :title="p.latestAnalysis.verdict || 'KI-Gesamtbewertung'"
              >
                {{ p.latestAnalysis.scoreOverall }}
              </span>
              <span v-else class="text-base-content/30 text-xs">&ndash;</span>
            </td>

            <!-- BORIS Value -->
            <td class="text-right font-mono">
              <span v-if="p.parcel?.borisBodenrichtwert" class="text-success font-semibold">
                {{ p.parcel.borisBodenrichtwert }} €/m²
              </span>
              <span v-else class="text-base-content/30">-</span>
            </td>

            <!-- BORIS Difference -->
            <td class="text-center font-mono">
              <span 
                v-if="p.parcel?.borisBodenrichtwert && p.pricePerSqm" 
                class="badge badge-sm font-semibold"
                :class="getBorisDiffClass(p.pricePerSqm, p.parcel.borisBodenrichtwert)"
              >
                {{ formatBorisDiff(p.pricePerSqm, p.parcel.borisBodenrichtwert) }}
              </span>
              <span v-else class="text-base-content/30">-</span>
            </td>

            <!-- Building Law & GRZ/GFZ -->
            <td class="text-xs">
              <div>{{ p.buildingLaw || 'Nicht spezifiziert' }}</div>
              <div v-if="p.grz || p.gfz" class="text-base-content/60 text-xs mt-0.5">
                <span v-if="p.grz">GRZ: {{ p.grz }}</span>
                <span v-if="p.gfz" class="ml-1">GFZ: {{ p.gfz }}</span>
              </div>
            </td>

            <!-- Broker -->
            <td class="text-xs">
              <div v-if="p.broker?.name" class="font-medium">{{ p.broker.name }}</div>
              <div v-if="p.broker?.company" class="text-base-content/60 text-xs truncate max-w-[130px]">{{ p.broker.company }}</div>
              <div v-if="!p.broker?.name && !p.broker?.company">
                <span class="badge badge-xs badge-success">Provisionsfrei</span>
              </div>
            </td>

            <!-- Actions -->
            <td class="text-right" @click.stop>
              <NuxtLink :to="`/properties/${p.id}`" class="btn btn-ghost btn-sm text-primary">
                Dossier
                <Icon name="lucide:arrow-right" class="w-3.5 h-3.5" />
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  properties: any[]
}>()

const searchQuery = ref('')
const statusFilter = ref('all')
const sortField = ref<'title' | 'askingPrice' | 'areaSqm' | 'pricePerSqm'>('askingPrice')
const sortAsc = ref(true)

/**
 * Offene Meldung aus der Inseratsprüfung. Wird nur angezeigt, solange sie nicht
 * bestätigt wurde - sonst stünde der Hinweis dauerhaft auf der Karte.
 */
function listingAlert(p: any): { label: string, cls: string, icon: string, title: string } | null {
  const l = p.listingStatus
  if (!l) return null

  const priceOpen = l.pendingPrice && (!l.alertAckAt || (l.pendingPriceSeenAt && l.pendingPriceSeenAt > l.alertAckAt))
  if (priceOpen) {
    const down = p.askingPrice ? l.pendingPrice < p.askingPrice : false
    return {
      label: `${down ? '↓' : '↑'} ${Number(l.pendingPrice).toLocaleString('de-DE')} €`,
      cls: down ? 'badge-success' : 'badge-warning',
      icon: 'lucide:tag',
      title: 'Preis im Inserat hat sich geändert - im Grundstück bestätigen'
    }
  }

  if (l.state === 'offline' && !l.alertAckAt) {
    return { label: 'Inserat offline', cls: 'badge-error', icon: 'lucide:circle-x', title: 'Das Inserat ist nicht mehr auffindbar' }
  }
  if (l.state === 'suspect' && !l.alertAckAt) {
    return { label: 'Inserat auffällig', cls: 'badge-warning', icon: 'lucide:circle-alert', title: 'Inserat liefert keine Daten mehr - wird beobachtet' }
  }
  return null
}

function getScoreClass(score: number) {
  if (score >= 70) return 'badge-success'
  if (score >= 45) return 'badge-warning'
  return 'badge-error'
}

function toggleSort(field: 'title' | 'askingPrice' | 'areaSqm' | 'pricePerSqm' | 'aiScore') {
  if (sortField.value === field) {
    sortAsc.value = !sortAsc.value
  } else {
    sortField.value = field
    sortAsc.value = true
  }
}

const filteredProperties = computed(() => {
  let list = [...(props.properties || [])]

  // Filter Status
  if (statusFilter.value !== 'all') {
    list = list.filter(p => p.status === statusFilter.value)
  }

  // Filter Search
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(p => 
      p.title?.toLowerCase().includes(q) ||
      p.address?.toLowerCase().includes(q) ||
      p.broker?.name?.toLowerCase().includes(q) ||
      p.broker?.company?.toLowerCase().includes(q) ||
      p.parcel?.flstkennz?.toLowerCase().includes(q)
    )
  }

  // Sort
  list.sort((a, b) => {
    // Der KI-Score liegt in der zuletzt erstellten Bewertung, nicht direkt am Grundstück.
    let valA = sortField.value === 'aiScore' ? a.latestAnalysis?.scoreOverall ?? null : a[sortField.value]
    let valB = sortField.value === 'aiScore' ? b.latestAnalysis?.scoreOverall ?? null : b[sortField.value]

    if (valA === null || valA === undefined) return 1
    if (valB === null || valB === undefined) return -1

    if (typeof valA === 'string') {
      return sortAsc.value ? valA.localeCompare(valB) : valB.localeCompare(valA)
    }

    return sortAsc.value ? valA - valB : valB - valA
  })

  return list
})

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    new: 'Neu',
    contacted: 'Kontaktiert',
    docs_requested: 'Unterlagen',
    in_review: 'In Prüfung',
    visiting: 'Besichtigung',
    offer_made: 'Angebot',
    purchased: 'Gekauft',
    rejected: 'Archiv'
  }
  return map[status] || status
}

function getStatusBadgeClass(status: string) {
  const map: Record<string, string> = {
    new: 'badge-ghost',
    contacted: 'badge-ghost',
    docs_requested: 'badge-ghost',
    in_review: 'badge-primary badge-outline',
    visiting: 'badge-primary',
    offer_made: 'badge-warning',
    purchased: 'badge-success',
    rejected: 'badge-ghost opacity-60'
  }
  return map[status] || 'badge-ghost'
}

function formatBorisDiff(pricePerSqm: number, boris: number) {
  if (!boris) return ''
  const diff = Math.round(((pricePerSqm - boris) / boris) * 100)
  return diff > 0 ? `+${diff}%` : `${diff}%`
}

function getBorisDiffClass(pricePerSqm: number, boris: number) {
  if (!boris) return 'badge-ghost'
  const diff = ((pricePerSqm - boris) / boris) * 100
  if (diff <= 0) return 'badge-success text-success-content'
  if (diff <= 25) return 'badge-warning text-warning-content'
  return 'badge-error text-error-content'
}
</script>
