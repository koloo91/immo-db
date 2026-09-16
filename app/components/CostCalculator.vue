<template>
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body p-4 space-y-3.5">
      <!-- Header with Total Badge & Save indicator -->
      <div class="flex items-center justify-between border-b border-base-200 pb-2">
        <div class="flex items-center gap-2">
          <Icon name="lucide:calculator" class="w-4 h-4 text-primary shrink-0" />
          <h3 class="font-bold text-sm">Kaufnebenkosten (Brandenburg)</h3>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="saving" class="text-[10px] text-base-content/50 flex items-center gap-1">
            <span class="loading loading-spinner loading-[10px]"></span>
            <span>Speichern...</span>
          </span>
          <span v-else-if="savedRecently" class="text-[10px] text-success flex items-center gap-0.5">
            <Icon name="lucide:check" class="w-3 h-3" />
            <span>Gespeichert</span>
          </span>
          <span class="badge badge-sm badge-neutral font-mono font-bold shrink-0">
            +{{ totalAncillaryPercent.toFixed(2) }}%
          </span>
        </div>
      </div>

      <!-- Quick Preset Buttons -->
      <div class="flex flex-wrap gap-1.5">
        <button 
          type="button"
          class="btn btn-xs rounded-lg transition-all"
          :class="isCommissionFree ? 'btn-primary' : 'btn-outline border-base-300 hover:bg-base-200'"
          @click="applyPreset(true)"
        >
          <Icon name="lucide:shield-check" class="w-3 h-3 mr-0.5" />
          Provisionsfrei (8,5%)
        </button>
        <button 
          type="button"
          class="btn btn-xs rounded-lg transition-all"
          :class="!isCommissionFree && Math.abs(brokerPercent - 3.57) < 0.05 ? 'btn-primary' : 'btn-outline border-base-300 hover:bg-base-200'"
          @click="applyPreset(false)"
        >
          <Icon name="lucide:user-check" class="w-3 h-3 mr-0.5" />
          Mit Makler 3,57% (12,07%)
        </button>
        <button 
          type="button"
          class="btn btn-xs btn-ghost text-base-content/60 ml-auto"
          title="Auf Standardwerte zurücksetzen"
          @click="resetDefaults"
        >
          <Icon name="lucide:rotate-ccw" class="w-3 h-3" />
        </button>
      </div>

      <!-- Cost Positions List -->
      <div class="space-y-2 text-xs">
        <!-- 1. Grunderwerbsteuer (BB 6,5%) -->
        <div class="p-2.5 rounded-lg bg-base-200/50 flex items-center justify-between gap-3">
          <div class="space-y-0.5 min-w-0">
            <div class="font-semibold text-base-content truncate">Grunderwerbsteuer</div>
            <div class="text-[11px] text-base-content/60">Brandenburg Landessteuer</div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <div class="flex items-center gap-1">
              <input 
                v-model.number="taxPercent" 
                type="number" 
                step="0.1" 
                min="0" 
                max="25"
                class="input input-xs input-bordered w-14 font-mono text-center h-6 py-0 px-1 text-xs"
                @input="triggerAutoSave"
              />
              <span class="text-[11px] text-base-content/60 font-mono">%</span>
            </div>
            <div class="text-right font-mono font-bold text-sm w-20">
              {{ taxAmount.toLocaleString('de-DE') }} €
            </div>
          </div>
        </div>

        <!-- 2. Notargebühren (1,5%) -->
        <div class="p-2.5 rounded-lg bg-base-200/50 flex items-center justify-between gap-3">
          <div class="space-y-0.5 min-w-0">
            <div class="font-semibold text-base-content truncate">Notarkosten</div>
            <div class="text-[11px] text-base-content/60">Kaufvertrag & Beurkundung</div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <div class="flex items-center gap-1">
              <input 
                v-model.number="notaryPercent" 
                type="number" 
                step="0.1" 
                min="0" 
                max="10"
                class="input input-xs input-bordered w-14 font-mono text-center h-6 py-0 px-1 text-xs"
                @input="triggerAutoSave"
              />
              <span class="text-[11px] text-base-content/60 font-mono">%</span>
            </div>
            <div class="text-right font-mono font-bold text-sm w-20">
              {{ notaryAmount.toLocaleString('de-DE') }} €
            </div>
          </div>
        </div>

        <!-- 3. Grundbucheintrag (0,5%) -->
        <div class="p-2.5 rounded-lg bg-base-200/50 flex items-center justify-between gap-3">
          <div class="space-y-0.5 min-w-0">
            <div class="font-semibold text-base-content truncate">Grundbucheintrag</div>
            <div class="text-[11px] text-base-content/60">Auflassungsvormerkung & Eigentum</div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <div class="flex items-center gap-1">
              <input 
                v-model.number="registryPercent" 
                type="number" 
                step="0.1" 
                min="0" 
                max="10"
                class="input input-xs input-bordered w-14 font-mono text-center h-6 py-0 px-1 text-xs"
                @input="triggerAutoSave"
              />
              <span class="text-[11px] text-base-content/60 font-mono">%</span>
            </div>
            <div class="text-right font-mono font-bold text-sm w-20">
              {{ registryAmount.toLocaleString('de-DE') }} €
            </div>
          </div>
        </div>

        <!-- 4. Maklerprovision (Einstellbar & Deaktivierbar) -->
        <div 
          class="p-2.5 rounded-lg border transition-all"
          :class="isCommissionFree ? 'bg-base-200/30 border-base-200 opacity-90' : 'bg-base-200/50 border-base-300'"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="space-y-0.5 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-base-content">Maklerprovision</span>
                <span v-if="isCommissionFree" class="badge badge-xs badge-success gap-1">
                  provisionsfrei
                </span>
              </div>
              <label class="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-base-content/60">
                <input 
                  type="checkbox" 
                  class="checkbox checkbox-xs checkbox-primary" 
                  :checked="isCommissionFree" 
                  @change="toggleCommissionFree" 
                />
                <span>Ohne Maklerprovision kaufen</span>
              </label>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <div class="flex items-center gap-1">
                <input 
                  v-model.number="brokerPercent" 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  max="15"
                  :disabled="isCommissionFree"
                  class="input input-xs input-bordered w-14 font-mono text-center h-6 py-0 px-1 text-xs disabled:opacity-40"
                  @input="onBrokerInput"
                />
                <span class="text-[11px] text-base-content/60 font-mono">%</span>
              </div>
              <div class="text-right font-mono font-bold text-sm w-20" :class="isCommissionFree ? 'text-base-content/40' : ''">
                {{ brokerAmount.toLocaleString('de-DE') }} €
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Optionale Zusatzkosten (z.B. Vermessung, Gutachten) -->
        <div class="p-2 rounded-lg bg-base-200/30 border border-base-200">
          <div class="flex items-center justify-between text-xs">
            <span class="text-base-content/70 font-medium">Sonstige Fixkosten (Vermessung etc.):</span>
            <div class="flex items-center gap-1">
              <input 
                v-model.number="additionalFixedAmount" 
                type="number" 
                step="100" 
                min="0"
                placeholder="0" 
                class="input input-xs input-bordered w-20 font-mono text-right h-6 py-0 px-1 text-xs"
                @input="triggerAutoSave"
              />
              <span class="text-[11px] text-base-content/60">€</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Total Summary Breakdown -->
      <div class="pt-2 border-t border-base-200 space-y-1.5 text-xs">
        <div class="flex justify-between text-base-content/70">
          <span>Kaufpreis netto:</span>
          <span class="font-mono font-medium">{{ price.toLocaleString('de-DE') }} €</span>
        </div>
        <div class="flex justify-between text-warning font-semibold">
          <span>Nebenkosten gesamt (+{{ totalAncillaryPercent.toFixed(2) }}%):</span>
          <span class="font-mono">+{{ totalAncillaryAmount.toLocaleString('de-DE') }} €</span>
        </div>
        <div class="flex justify-between text-sm font-bold text-primary pt-2 border-t border-base-200">
          <span>Gesamtkapitalbedarf:</span>
          <span class="font-mono text-base">{{ totalCost.toLocaleString('de-DE') }} €</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps<{
  askingPrice?: number | null
  propertyId?: string
  initialCostsJson?: string | null
}>()

const emit = defineEmits<{
  (e: 'update', data: { percent: number; totalCost: number }): void
}>()

// Default Nebenkosten Brandenburg
const taxPercent = ref(6.5) // Grunderwerbsteuer BB: 6,5%
const notaryPercent = ref(1.5) // Notarkosten: 1,5%
const registryPercent = ref(0.5) // Grundbuchamt: 0,5%
const brokerPercent = ref(3.57) // Maklerprovision (üblich 3,57%)
const isCommissionFree = ref(false)
const additionalFixedAmount = ref(0)

const saving = ref(false)
const savedRecently = ref(false)
let saveTimeout: any = null

// Parse initial JSON if passed
onMounted(() => {
  if (props.initialCostsJson) {
    try {
      const parsed = typeof props.initialCostsJson === 'string'
        ? JSON.parse(props.initialCostsJson)
        : props.initialCostsJson
      if (parsed) {
        if (typeof parsed.taxPercent === 'number') taxPercent.value = parsed.taxPercent
        if (typeof parsed.notaryPercent === 'number') notaryPercent.value = parsed.notaryPercent
        if (typeof parsed.registryPercent === 'number') registryPercent.value = parsed.registryPercent
        if (typeof parsed.brokerPercent === 'number') brokerPercent.value = parsed.brokerPercent
        if (typeof parsed.isCommissionFree === 'boolean') isCommissionFree.value = parsed.isCommissionFree
        if (typeof parsed.additionalFixedAmount === 'number') additionalFixedAmount.value = parsed.additionalFixedAmount
      }
    } catch {}
  }
})

function applyPreset(commissionFree: boolean) {
  taxPercent.value = 6.5
  notaryPercent.value = 1.5
  registryPercent.value = 0.5
  if (commissionFree) {
    isCommissionFree.value = true
    brokerPercent.value = 0
  } else {
    isCommissionFree.value = false
    brokerPercent.value = 3.57
  }
  triggerAutoSave()
}

function resetDefaults() {
  taxPercent.value = 6.5
  notaryPercent.value = 1.5
  registryPercent.value = 0.5
  brokerPercent.value = 3.57
  isCommissionFree.value = false
  additionalFixedAmount.value = 0
  triggerAutoSave()
}

function toggleCommissionFree(e: Event) {
  const target = e.target as HTMLInputElement
  isCommissionFree.value = target.checked
  if (isCommissionFree.value) {
    brokerPercent.value = 0
  } else {
    brokerPercent.value = 3.57
  }
  triggerAutoSave()
}

function onBrokerInput() {
  if (brokerPercent.value === 0) {
    isCommissionFree.value = true
  } else if (isCommissionFree.value) {
    isCommissionFree.value = false
  }
  triggerAutoSave()
}

const price = computed(() => props.askingPrice || 0)

const taxAmount = computed(() => Math.round(price.value * (taxPercent.value / 100)))
const notaryAmount = computed(() => Math.round(price.value * (notaryPercent.value / 100)))
const registryAmount = computed(() => Math.round(price.value * (registryPercent.value / 100)))
const brokerAmount = computed(() => isCommissionFree.value ? 0 : Math.round(price.value * (brokerPercent.value / 100)))

const totalPercentRates = computed(() => {
  const broker = isCommissionFree.value ? 0 : (brokerPercent.value || 0)
  return (taxPercent.value || 0) + (notaryPercent.value || 0) + (registryPercent.value || 0) + broker
})

const totalAncillaryAmount = computed(() => {
  return taxAmount.value + notaryAmount.value + registryAmount.value + brokerAmount.value + (additionalFixedAmount.value || 0)
})

const totalAncillaryPercent = computed(() => {
  if (price.value <= 0) return totalPercentRates.value
  return (totalAncillaryAmount.value / price.value) * 100
})

const totalCost = computed(() => price.value + totalAncillaryAmount.value)

// Auto-save to property if propertyId is provided
function triggerAutoSave() {
  emit('update', { percent: totalAncillaryPercent.value, totalCost: totalCost.value })
  if (!props.propertyId) return

  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    saving.value = true
    try {
      const payload = {
        purchaseCostsPercent: Math.round(totalAncillaryPercent.value * 100) / 100,
        ancillaryCostsJson: JSON.stringify({
          taxPercent: taxPercent.value,
          notaryPercent: notaryPercent.value,
          registryPercent: registryPercent.value,
          brokerPercent: isCommissionFree.value ? 0 : brokerPercent.value,
          isCommissionFree: isCommissionFree.value,
          additionalFixedAmount: additionalFixedAmount.value || 0
        })
      }
      await $fetch(`/api/properties/${props.propertyId}`, {
        method: 'PUT',
        body: payload
      })
      savedRecently.value = true
      setTimeout(() => {
        savedRecently.value = false
      }, 2500)
    } catch (e) {
      console.warn('Could not auto-save ancillary costs:', e)
    } finally {
      saving.value = false
    }
  }, 600)
}
</script>
