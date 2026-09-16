<template>
  <div class="space-y-6">
    <!-- Aktuelle Bewertung -->
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-4 sm:p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-200 pb-3">
          <div>
            <h3 class="font-bold text-sm flex items-center gap-2">
              <Icon name="lucide:brain-circuit" class="w-4 h-4 text-primary" />
              KI-Gesamtbewertung
            </h3>
            <p class="text-xs text-base-content/60 mt-0.5">
              Fasst alle analysierten Dokumente, den Mailverlauf und die BORIS-/ALKIS-Daten
              zu einer Einschätzung zusammen.
            </p>
          </div>
          <button class="btn btn-sm btn-primary gap-1.5 self-end sm:self-center" :disabled="running" @click="run">
            <span v-if="running" class="loading loading-spinner loading-xs"></span>
            <Icon v-else name="lucide:sparkles" class="w-4 h-4" />
            <span>{{ latest ? 'Neu bewerten' : 'Gesamtanalyse starten' }}</span>
          </button>
        </div>

        <div v-if="!latest" class="text-center py-8 space-y-1">
          <Icon name="lucide:scan-search" class="w-8 h-8 mx-auto text-base-content/30" />
          <p class="text-xs text-base-content/50">
            Noch keine Gesamtbewertung. Lade zuerst Unterlagen hoch und starte dann die Analyse.
          </p>
        </div>

        <div v-else class="space-y-4">
          <div v-if="latest.isSimulated" class="alert alert-warning text-xs py-2">
            <Icon name="lucide:alert-triangle" class="w-4 h-4" />
            <span>Simulierte Bewertung ohne Gemini-Key &ndash; kein belastbares Ergebnis.</span>
          </div>

          <!-- Score + Fazit -->
          <div class="flex flex-col sm:flex-row items-center gap-4">
            <div
              v-if="latest.scoreOverall !== null"
              class="radial-progress shrink-0"
              :class="scoreColor(latest.scoreOverall)"
              :style="{ '--value': latest.scoreOverall, '--size': '5.5rem', '--thickness': '0.5rem' }"
              role="progressbar"
            >
              <span class="text-xl font-bold">{{ latest.scoreOverall }}</span>
            </div>

            <div class="flex-1 space-y-1 text-center sm:text-left">
              <div class="font-bold text-sm">{{ latest.verdict || 'Ohne Fazit' }}</div>
              <p class="text-xs text-base-content/80 leading-relaxed">{{ latest.summary }}</p>
              <div class="text-[11px] text-base-content/50">
                {{ formatDate(latest.createdAt) }}
                <span v-if="latest.model"> &bull; {{ latest.model }}</span>
                <span v-if="snapshot(latest)">
                  &bull; {{ snapshot(latest).documentCount }} Dokument(e), {{ snapshot(latest).emailCount }} E-Mail(s)
                </span>
              </div>
            </div>
          </div>

          <!-- Preiseinordnung -->
          <div v-if="priceAssessment" class="bg-base-200/50 border border-base-300 rounded-xl p-3 space-y-1">
            <div class="text-xs font-semibold flex items-center gap-1.5">
              <Icon name="lucide:euro" class="w-3.5 h-3.5 text-primary" />
              Preiseinordnung: {{ priceAssessment.verdict }}
              <span
                v-if="priceAssessment.deviationPercent !== null && priceAssessment.deviationPercent !== undefined"
                class="badge badge-xs font-mono"
                :class="priceAssessment.deviationPercent > 0 ? 'badge-warning' : 'badge-success'"
              >
                {{ priceAssessment.deviationPercent > 0 ? '+' : '' }}{{ priceAssessment.deviationPercent }} %
              </span>
            </div>
            <p class="text-xs text-base-content/70">{{ priceAssessment.reasoning }}</p>
            <p v-if="priceAssessment.fairPricePerSqm" class="text-[11px] text-base-content/50">
              Angemessen erscheinen ca. {{ Number(priceAssessment.fairPricePerSqm).toLocaleString('de-DE') }} €/m²
            </p>
          </div>

          <!-- Risiken / Chancen -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="border border-error/30 bg-error/5 rounded-xl p-3 space-y-2">
              <div class="text-xs font-semibold text-error flex items-center gap-1.5">
                <Icon name="lucide:alert-octagon" class="w-3.5 h-3.5" />
                Risiken ({{ risks.length }})
              </div>
              <div v-if="risks.length === 0" class="text-xs text-base-content/50">Keine Risiken benannt.</div>
              <div v-for="(risk, i) in risks" :key="i" class="text-xs space-y-0.5">
                <div class="flex items-start gap-1.5">
                  <span class="badge badge-xs shrink-0 mt-0.5" :class="severityClass(risk.severity)">
                    {{ risk.severity || 'mittel' }}
                  </span>
                  <span>{{ risk.title || risk }}</span>
                </div>
                <div v-if="risk.source" class="text-[11px] text-base-content/50 pl-8">{{ risk.source }}</div>
              </div>
            </div>

            <div class="border border-success/30 bg-success/5 rounded-xl p-3 space-y-2">
              <div class="text-xs font-semibold text-success flex items-center gap-1.5">
                <Icon name="lucide:trending-up" class="w-3.5 h-3.5" />
                Chancen ({{ opportunities.length }})
              </div>
              <div v-if="opportunities.length === 0" class="text-xs text-base-content/50">Keine Chancen benannt.</div>
              <div v-for="(opportunity, i) in opportunities" :key="i" class="text-xs space-y-0.5">
                <div>{{ opportunity.title || opportunity }}</div>
                <div v-if="opportunity.source" class="text-[11px] text-base-content/50">{{ opportunity.source }}</div>
              </div>
            </div>
          </div>

          <!-- Offene Fragen -->
          <div v-if="openQuestions.length" class="border border-warning/30 bg-warning/5 rounded-xl p-3 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="text-xs font-semibold text-warning flex items-center gap-1.5">
                <Icon name="lucide:help-circle" class="w-3.5 h-3.5" />
                Offene Fragen an den Makler ({{ openQuestions.length }})
              </div>
              <button class="btn btn-xs btn-ghost gap-1" @click="copyQuestions">
                <Icon name="lucide:copy" class="w-3 h-3" />
                Kopieren
              </button>
            </div>
            <ul class="text-xs text-base-content/80 list-disc list-inside space-y-1">
              <li v-for="(question, i) in openQuestions" :key="i">{{ question }}</li>
            </ul>
            <p class="text-[11px] text-base-content/50">
              Diese Fragen fließen automatisch in die KI-Anfrage im Tab &bdquo;Makler &amp; Kommunikation&ldquo; ein.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Verlauf der Bewertungen -->
    <div v-if="analyses.length > 1" class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-4 sm:p-5 space-y-3">
        <h3 class="font-bold text-sm flex items-center gap-2 border-b border-base-200 pb-2">
          <Icon name="lucide:history" class="w-4 h-4 text-primary" />
          Verlauf der Bewertungen
        </h3>

        <div class="space-y-2">
          <div
            v-for="(analysis, index) in analyses"
            :key="analysis.id"
            class="flex items-start gap-3 text-xs p-2.5 rounded-lg border border-base-200"
            :class="index === 0 ? 'bg-primary/5 border-primary/20' : ''"
          >
            <div class="font-mono font-bold text-sm w-8 shrink-0 text-center" :class="scoreColor(analysis.scoreOverall)">
              {{ analysis.scoreOverall ?? '–' }}
            </div>
            <div class="flex-1 min-w-0 space-y-0.5">
              <div class="font-semibold">{{ analysis.verdict || 'Ohne Fazit' }}</div>
              <div class="text-[11px] text-base-content/50">{{ formatDate(analysis.createdAt) }}</div>
              <div v-if="diffOf(index)" class="flex flex-wrap gap-1 pt-0.5">
                <span v-for="(change, i) in diffOf(index)" :key="i" class="badge badge-xs badge-ghost font-mono">
                  {{ change }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const toast = useToast()

const props = defineProps<{
  propertyId: string
  analyses: any[]
}>()

const emit = defineEmits<{ (e: 'refresh'): void }>()

const running = ref(false)

const analyses = computed(() => props.analyses || [])
const latest = computed(() => analyses.value[0] || null)

function parseJson(value: string | null | undefined, fallback: any) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const risks = computed(() => parseJson(latest.value?.risksJson, []))
const opportunities = computed(() => parseJson(latest.value?.opportunitiesJson, []))
const openQuestions = computed(() => parseJson(latest.value?.openQuestionsJson, []))
const priceAssessment = computed(() => {
  const parsed = parseJson(latest.value?.priceAssessmentJson, null)
  return parsed && Object.keys(parsed).length ? parsed : null
})

function snapshot(analysis: any) {
  return parseJson(analysis?.inputSnapshotJson, null)
}

/** Vergleicht eine Bewertung mit der direkt davor liegenden (im Array: der nächstältere Eintrag). */
function diffOf(index: number): string[] | null {
  const current = analyses.value[index]
  const previous = analyses.value[index + 1]
  if (!current || !previous) return null

  const currentSnapshot = snapshot(current)
  const previousSnapshot = snapshot(previous)
  const changes: string[] = []

  if (current.scoreOverall !== null && previous.scoreOverall !== null && current.scoreOverall !== previous.scoreOverall) {
    changes.push(`Score ${previous.scoreOverall} → ${current.scoreOverall}`)
  }

  if (currentSnapshot && previousSnapshot) {
    if (currentSnapshot.askingPrice !== previousSnapshot.askingPrice) {
      changes.push(`Preis ${formatEuro(previousSnapshot.askingPrice)} → ${formatEuro(currentSnapshot.askingPrice)}`)
    }
    const docDelta = (currentSnapshot.documentCount || 0) - (previousSnapshot.documentCount || 0)
    if (docDelta > 0) changes.push(`+${docDelta} Dokument(e)`)
    const mailDelta = (currentSnapshot.emailCount || 0) - (previousSnapshot.emailCount || 0)
    if (mailDelta > 0) changes.push(`+${mailDelta} E-Mail(s)`)
  }

  return changes.length ? changes : null
}

function formatEuro(value: number | null | undefined) {
  return value ? value.toLocaleString('de-DE') + ' €' : 'k.A.'
}

async function run() {
  running.value = true
  try {
    await $fetch(`/api/properties/${props.propertyId}/analysis`, { method: 'POST' })
    emit('refresh')
    toast.success('Gesamtbewertung erstellt.')
  } catch (err: any) {
    toast.error('Analyse fehlgeschlagen: ' + (err.data?.statusMessage || err.message))
  } finally {
    running.value = false
  }
}

async function copyQuestions() {
  await navigator.clipboard.writeText(openQuestions.value.map((q: string) => `- ${q}`).join('\n'))
  toast.success('Offene Fragen kopiert.')
}

function scoreColor(score: number | null) {
  if (score === null || score === undefined) return 'text-base-content/40'
  if (score >= 70) return 'text-success'
  if (score >= 45) return 'text-warning'
  return 'text-error'
}

function severityClass(severity: string) {
  if (severity === 'hoch') return 'badge-error'
  if (severity === 'niedrig') return 'badge-ghost'
  return 'badge-warning'
}

function formatDate(ms: number) {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>
