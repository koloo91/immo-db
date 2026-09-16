<template>
  <div class="space-y-4">
    <!-- Board Columns Scroll Container -->
    <div class="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x select-none">
      <div 
        v-for="col in columns" 
        :key="col.id" 
        class="flex-shrink-0 w-80 bg-base-100 rounded-xl border border-base-300 shadow-sm flex flex-col max-h-[75vh]"
      >
        <!-- Column Header -->
        <div class="p-3 border-b border-base-200 flex items-center justify-between bg-base-200/50 rounded-t-xl">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full" :class="col.color"></span>
            <span class="font-semibold text-sm">{{ col.title }}</span>
          </div>
          <span class="badge badge-sm badge-ghost font-mono">
            {{ getPropertiesInCol(col.id).length }}
          </span>
        </div>

        <!-- Cards Container -->
        <div class="p-3 space-y-3 overflow-y-auto flex-1">
          <div 
            v-if="getPropertiesInCol(col.id).length === 0" 
            class="text-center py-8 text-xs text-base-content/40 border-2 border-dashed border-base-300 rounded-lg"
          >
            Keine Grundstücke
          </div>

          <div 
            v-for="p in getPropertiesInCol(col.id)" 
            :key="p.id"
            class="card bg-base-100 border border-base-300 shadow-xs hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group overflow-hidden"
            @click="navigateTo(`/properties/${p.id}`)"
          >
            <!-- Card Thumbnail -->
            <div v-if="p.primaryImageUrl" class="h-32 w-full overflow-hidden bg-base-200 relative">
              <img 
                :src="p.primaryImageUrl" 
                :alt="p.title" 
                class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                loading="lazy" 
              />
              <div class="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"></div>
            </div>

            <div class="card-body p-3.5 space-y-2">
              <!-- Title & Price -->
              <div>
                <h4 class="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
                  {{ p.title }}
                </h4>
                <div class="text-xs text-base-content/70 flex items-center gap-1 mt-0.5">
                  <Icon name="lucide:map-pin" class="w-3.5 h-3.5 text-base-content/50 shrink-0" />
                  <span class="truncate">{{ p.address || 'Keine Adresse hinterlegt' }}</span>
                </div>
              </div>

              <!-- Metrics Badges -->
              <div class="flex flex-wrap items-center gap-1.5 pt-1">
                <span v-if="p.askingPrice" class="badge badge-sm font-semibold badge-neutral">
                  {{ p.askingPrice.toLocaleString('de-DE') }} €
                </span>
                <span v-if="p.areaSqm" class="badge badge-sm badge-ghost">
                  {{ p.areaSqm }} m²
                </span>
                <span v-if="p.pricePerSqm" class="badge badge-sm badge-ghost font-mono">
                  {{ Math.round(p.pricePerSqm) }} €/m²
                </span>
                <span
                  v-if="listingAlert(p)"
                  class="badge badge-sm gap-1"
                  :class="listingAlert(p)!.cls"
                  :title="listingAlert(p)!.title"
                >
                  <Icon :name="listingAlert(p)!.icon" class="w-3 h-3" />
                  {{ listingAlert(p)!.label }}
                </span>
                <span
                  v-if="p.latestAnalysis?.scoreOverall !== null && p.latestAnalysis?.scoreOverall !== undefined"
                  class="badge badge-sm font-mono gap-1"
                  :class="getScoreClass(p.latestAnalysis.scoreOverall)"
                  :title="p.latestAnalysis.verdict || 'KI-Gesamtbewertung'"
                >
                  <Icon name="lucide:brain-circuit" class="w-3 h-3" />
                  {{ p.latestAnalysis.scoreOverall }}
                </span>
              </div>

              <!-- BORIS Comparison & Building Law -->
              <div class="flex items-center justify-between text-xs pt-1 border-t border-base-200">
                <div v-if="p.parcel?.borisBodenrichtwert && p.pricePerSqm" class="flex items-center gap-1">
                  <span class="text-base-content/60">BORIS:</span>
                  <span 
                    class="badge badge-xs font-mono"
                    :class="getBorisDiffClass(p.pricePerSqm, p.parcel.borisBodenrichtwert)"
                  >
                    {{ formatBorisDiff(p.pricePerSqm, p.parcel.borisBodenrichtwert) }}
                  </span>
                </div>
                <div v-else class="text-base-content/50 text-xs">
                  {{ p.buildingLaw || 'Baurecht n.a.' }}
                </div>

                <!-- Broker icon if attached -->
                <div v-if="p.broker?.name" class="flex items-center gap-1 text-xs text-base-content/70" :title="p.broker.name">
                  <Icon name="lucide:user" class="w-3 h-3" />
                  <span class="truncate max-w-[80px]">{{ p.broker.name.split(' ')[0] }}</span>
                </div>
              </div>

              <!-- Quick Status Change Actions -->
              <div class="pt-2 border-t border-base-200 flex items-center justify-between text-xs" @click.stop>
                <button 
                  v-if="col.prev"
                  class="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content"
                  :title="`Verschieben nach '${col.prevTitle}'`"
                  @click.stop="moveProperty(p.id, col.prev)"
                >
                  <Icon name="lucide:chevron-left" class="w-3.5 h-3.5" />
                </button>
                <span v-else class="w-6"></span>

                <select 
                  class="select select-sm select-ghost font-normal text-xs h-6 min-h-0 focus:outline-none"
                  :value="p.status"
                  @change="onStatusSelect(p.id, $event)"
                >
                  <option v-for="c in columns" :key="c.id" :value="c.id">
                    {{ c.title }}
                  </option>
                </select>

                <button 
                  v-if="col.next"
                  class="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content"
                  :title="`Verschieben nach '${col.nextTitle}'`"
                  @click.stop="moveProperty(p.id, col.next)"
                >
                  <Icon name="lucide:chevron-right" class="w-3.5 h-3.5" />
                </button>
                <span v-else class="w-6"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  properties: any[]
}>()

const emit = defineEmits<{
  (e: 'statusChange', propertyId: string, newStatus: string): void
}>()

const columns = [
  { id: 'new', title: 'Neu entdeckt', color: 'bg-base-content/25', prev: null, next: 'contacted' },
  { id: 'contacted', title: 'Makler kontaktiert', color: 'bg-base-content/40', prev: 'new', next: 'docs_requested' },
  { id: 'docs_requested', title: 'Unterlagen angefordert', color: 'bg-base-content/55', prev: 'contacted', next: 'in_review' },
  { id: 'in_review', title: 'In Prüfung (B-Plan)', color: 'bg-primary/60', prev: 'docs_requested', next: 'visiting' },
  { id: 'visiting', title: 'Besichtigung', color: 'bg-primary', prev: 'in_review', next: 'offer_made' },
  { id: 'offer_made', title: 'Angebot / Verhandlung', color: 'bg-warning', prev: 'visiting', next: 'purchased' },
  { id: 'purchased', title: 'Gekauft / Notar', color: 'bg-success', prev: 'offer_made', next: null },
  { id: 'rejected', title: 'Archiv / Absage', color: 'bg-base-content/15', prev: null, next: null }
]

function getPropertiesInCol(colId: string) {
  return (props.properties || []).filter(p => p.status === colId)
}

function moveProperty(propId: string, targetStatus: string) {
  emit('statusChange', propId, targetStatus)
}

function onStatusSelect(propId: string, event: any) {
  emit('statusChange', propId, event.target.value)
}

function formatBorisDiff(pricePerSqm: number, boris: number) {
  if (!boris) return ''
  const diff = Math.round(((pricePerSqm - boris) / boris) * 100)
  return diff > 0 ? `+${diff}% vs BORIS` : `${diff}% vs BORIS`
}

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

function getBorisDiffClass(pricePerSqm: number, boris: number) {
  if (!boris) return 'badge-ghost'
  const diff = ((pricePerSqm - boris) / boris) * 100
  if (diff <= 0) return 'badge-success text-success-content'
  if (diff <= 25) return 'badge-warning text-warning-content'
  return 'badge-error text-error-content'
}
</script>
