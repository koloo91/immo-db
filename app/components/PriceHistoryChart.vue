<template>
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body p-4 space-y-3">
      <div class="flex items-center justify-between border-b border-base-200 pb-2">
        <h3 class="font-bold text-sm flex items-center gap-2">
          <Icon name="lucide:trending-up" class="w-4 h-4 text-primary" />
          BORIS Bodenrichtwert-Entwicklung (Brandenburg)
        </h3>
        <span v-if="currentValue" class="badge badge-sm badge-success font-mono font-bold">
          Aktuell: {{ currentValue }} €/m²
        </span>
      </div>

      <div v-if="!chartData || chartData.length === 0" class="py-6 text-center text-xs text-base-content/50">
        Keine historische BORIS-Preisentwicklung hinterlegt. Klicke oben auf "Mit Geobasis synchronisieren".
      </div>

      <div v-else class="space-y-4">
        <!-- SVG Bar Chart -->
        <div class="h-44 w-full flex items-end gap-2 pt-4 px-2">
          <div 
            v-for="(item, idx) in chartData" 
            :key="idx" 
            class="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end"
          >
            <!-- Hover Tooltip -->
            <div class="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-neutral text-neutral-content text-xs py-0.5 px-2 rounded font-mono pointer-events-none whitespace-nowrap z-10 shadow-md">
              {{ item.price }} €/m² ({{ item.year }})
            </div>

            <!-- Price Label above bar -->
            <span class="text-[10px] font-mono text-base-content/70 hidden sm:block">
              {{ item.price }}
            </span>

            <!-- Bar -->
            <div 
              class="w-full max-w-[42px] bg-primary/80 group-hover:bg-primary rounded-t transition-all duration-300 relative"
              :style="{ height: `${Math.max(12, (item.price / maxPrice) * 100)}%` }"
            ></div>

            <!-- Year Label below bar -->
            <span class="text-xs font-medium text-base-content/80 mt-1">
              {{ item.year }}
            </span>
          </div>
        </div>

        <!-- Trend Summary footer -->
        <div v-if="trendStats" class="flex items-center justify-between text-xs bg-base-200/50 p-2.5 rounded-lg">
          <div class="text-base-content/70">
            Zeitraum: <strong class="font-mono">{{ trendStats.startYear }} &ndash; {{ trendStats.endYear }}</strong>
          </div>
          <div class="flex items-center gap-2">
            <span>Wertentwicklung:</span>
            <span 
              class="badge badge-sm font-mono font-bold"
              :class="trendStats.growth >= 0 ? 'badge-success' : 'badge-error'"
            >
              {{ trendStats.growth >= 0 ? '+' : '' }}{{ trendStats.growth }}%
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  historyJson?: string | null
  currentValue?: number | null
}>()

const chartData = computed(() => {
  if (!props.historyJson) return []
  try {
    const raw = typeof props.historyJson === 'string' ? JSON.parse(props.historyJson) : props.historyJson
    if (!Array.isArray(raw)) return []

    return raw.map((item: any) => {
      const year = item.year || (item.stichtag ? item.stichtag.split('-')[0] : '')
      const price = Number(item.price || item.bodenrichtwert || 0)
      return { year, price, stichtag: item.stichtag }
    }).filter(i => i.price > 0)
  } catch (e) {
    console.warn('Could not parse history JSON:', e)
    return []
  }
})

const maxPrice = computed(() => {
  if (chartData.value.length === 0) return 1
  return Math.max(...chartData.value.map(d => d.price)) * 1.15
})

const trendStats = computed(() => {
  const data = chartData.value
  if (data.length < 2) return null
  const first = data[0]
  const last = data[data.length - 1]
  const growth = Math.round(((last.price - first.price) / first.price) * 100)
  return {
    startYear: first.year,
    endYear: last.year,
    growth
  }
})
</script>
