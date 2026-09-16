<template>
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body p-4 sm:p-5 space-y-4">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-200 pb-3">
        <div>
          <h3 class="font-bold text-sm flex items-center gap-2">
            <Icon name="lucide:mails" class="w-4 h-4 text-primary" />
            E-Mail-Verlauf
          </h3>
          <p class="text-xs text-base-content/60 mt-0.5">
            Mail aus Outlook/Gmail hierher kopieren oder die .eml-Datei ablegen &ndash; die KI erkennt
            Absender, Datum, Zusagen und Anhänge.
          </p>
        </div>

        <div class="flex items-center gap-2 self-end sm:self-center">
          <span v-if="drafts.length" class="badge badge-sm badge-warning gap-1">
            <Icon name="lucide:file-edit" class="w-3 h-3" />
            {{ drafts.length }} Entwurf{{ drafts.length === 1 ? '' : 'e' }}
          </span>
          <button class="btn btn-sm btn-primary gap-1.5" @click="openImport()">
            <Icon name="lucide:clipboard-paste" class="w-4 h-4" />
            <span>E-Mail einfügen</span>
          </button>
        </div>
      </div>

      <!-- Entwürfe (noch nicht versendet) -->
      <div v-if="drafts.length" class="space-y-2">
        <div
          v-for="draft in drafts"
          :key="draft.id"
          class="border border-warning/40 bg-warning/10 rounded-xl p-3 space-y-2"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="badge badge-xs badge-warning shrink-0">Entwurf</span>
              <span class="font-semibold text-xs truncate">{{ draft.subject || draft.summary }}</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <a
                v-if="brokerEmail"
                :href="mailtoLink(draft)"
                class="btn btn-xs btn-outline gap-1"
                title="Im Mailprogramm öffnen"
              >
                <Icon name="lucide:external-link" class="w-3 h-3" />
                Öffnen
              </a>
              <button class="btn btn-xs btn-ghost gap-1" @click="copyText(draft.bodyText || '')">
                <Icon name="lucide:copy" class="w-3 h-3" />
                Kopieren
              </button>
              <button class="btn btn-xs btn-success gap-1" :disabled="busyId === draft.id" @click="markAsSent(draft)">
                <span v-if="busyId === draft.id" class="loading loading-spinner loading-xs"></span>
                <Icon v-else name="lucide:send" class="w-3 h-3" />
                Als gesendet markieren
              </button>
              <button class="btn btn-xs btn-ghost btn-circle text-error" @click="remove(draft.id)">
                <Icon name="lucide:trash-2" class="w-3 h-3" />
              </button>
            </div>
          </div>
          <pre class="text-[11px] whitespace-pre-wrap font-sans text-base-content/80 max-h-40 overflow-y-auto">{{ draft.bodyText }}</pre>
        </div>
      </div>

      <!-- Threads -->
      <div v-if="threads.length === 0" class="text-center py-8 text-xs text-base-content/50">
        Noch kein Mailverkehr erfasst. Füge die erste E-Mail vom Makler ein.
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="thread in threads"
          :key="thread.id"
          :data-thread="thread.id"
          class="rounded-xl overflow-hidden transition-colors"
          :class="thread.id === highlightThreadId ? 'border-2 border-primary' : 'border border-base-300'"
        >
          <!-- Thread-Kopf -->
          <button
            type="button"
            class="w-full flex items-center justify-between gap-3 p-3 bg-base-200/40 hover:bg-base-200/70 transition-colors text-left cursor-pointer"
            @click="toggleThread(thread.id)"
          >
            <div class="min-w-0 space-y-0.5">
              <div class="font-semibold text-xs truncate">{{ thread.subject }}</div>
              <div class="text-[11px] text-base-content/60 flex items-center gap-2 flex-wrap">
                <span>{{ thread.messages?.length || 0 }} Nachricht{{ (thread.messages?.length || 0) === 1 ? '' : 'en' }}</span>
                <span>&bull;</span>
                <span>zuletzt {{ formatDate(thread.lastMessageAt) }}</span>
                <span v-if="threadAttachmentCount(thread) > 0" class="badge badge-xs badge-ghost gap-1">
                  <Icon name="lucide:paperclip" class="w-3 h-3" />
                  {{ threadAttachmentCount(thread) }}
                </span>
              </div>
            </div>
            <Icon
              :name="expanded.has(thread.id) ? 'lucide:chevron-up' : 'lucide:chevron-down'"
              class="w-4 h-4 shrink-0 text-base-content/50"
            />
          </button>

          <!-- Nachrichten -->
          <div v-if="expanded.has(thread.id)" class="divide-y divide-base-200">
            <div
              v-for="message in thread.messages"
              :key="message.id"
              class="p-3 space-y-2"
              :class="message.direction === 'inbound' ? 'bg-base-100' : 'bg-primary/5'"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 space-y-0.5">
                  <div class="flex items-center gap-1.5 text-xs font-semibold">
                    <Icon
                      :name="message.direction === 'inbound' ? 'lucide:arrow-down-left' : 'lucide:arrow-up-right'"
                      class="w-3.5 h-3.5 shrink-0"
                      :class="message.direction === 'inbound' ? 'text-success' : 'text-primary'"
                    />
                    <span class="truncate">{{ message.fromAddress || (message.direction === 'inbound' ? 'Makler' : 'Ich') }}</span>
                    <Icon name="lucide:arrow-right" class="w-3 h-3 text-base-content/40 shrink-0" />
                    <span class="truncate text-base-content/70 font-normal">{{ message.toAddress || '-' }}</span>
                  </div>
                  <div class="text-[11px] text-base-content/60">
                    {{ formatDate(message.occurredAt || message.createdAt) }}
                    <span v-if="message.nextFollowUpDate" class="badge badge-xs badge-warning font-mono ml-1">
                      Frist: {{ message.nextFollowUpDate }}
                    </span>
                  </div>
                </div>
                <button
                  class="btn btn-ghost btn-xs btn-circle text-error/60 hover:text-error shrink-0"
                  title="Eintrag löschen"
                  @click="remove(message.id)"
                >
                  <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
                </button>
              </div>

              <div v-if="message.summary" class="text-xs font-medium text-base-content/90">
                {{ message.summary }}
              </div>

              <pre
                v-if="message.bodyText"
                class="text-[11px] whitespace-pre-wrap font-sans bg-base-200/40 p-2 rounded max-h-48 overflow-y-auto"
              >{{ message.bodyText }}</pre>

              <!-- KI-Erkenntnisse -->
              <div v-if="insightsOf(message)" class="flex flex-wrap gap-1.5">
                <span
                  v-for="(commitment, i) in insightsOf(message).commitments || []"
                  :key="'c' + i"
                  class="badge badge-xs badge-info gap-1 h-auto py-1 whitespace-normal text-left"
                >
                  <Icon name="lucide:handshake" class="w-3 h-3 shrink-0" />
                  {{ commitment }}
                </span>
                <span
                  v-for="(fact, i) in insightsOf(message).facts || []"
                  :key="'f' + i"
                  class="badge badge-xs badge-success gap-1 h-auto py-1 whitespace-normal text-left"
                  :title="fact.quote"
                >
                  <Icon name="lucide:database" class="w-3 h-3 shrink-0" />
                  {{ fieldLabel(fact.field) }}: {{ fact.value }}
                </span>
              </div>

              <!-- Anhänge -->
              <div v-if="message.attachments?.length" class="flex flex-wrap gap-1.5 pt-1">
                <a
                  v-for="attachment in message.attachments"
                  :key="attachment.id"
                  :href="`/api/properties/${propertyId}/documents/${attachment.id}/file`"
                  target="_blank"
                  rel="noopener"
                  class="btn btn-xs btn-outline gap-1 normal-case font-normal"
                >
                  <Icon name="lucide:paperclip" class="w-3 h-3" />
                  {{ attachment.fileName }}
                  <span class="opacity-60">({{ (attachment.fileSize / 1024).toFixed(0) }} KB)</span>
                </a>
              </div>

              <!-- Nachträglich PDF anhängen -->
              <div>
                <label class="btn btn-xs btn-ghost gap-1 text-base-content/60">
                  <Icon name="lucide:plus" class="w-3 h-3" />
                  <span>{{ uploadingFor === message.id ? 'Lädt...' : 'PDF an diese Mail hängen' }}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    class="hidden"
                    :disabled="uploadingFor === message.id"
                    @change="attachToMessage($event, message.id)"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Import-Modal -->
    <dialog class="modal" :class="{ 'modal-open': showImport }">
      <div class="modal-box max-w-3xl">
        <h3 class="font-bold text-base flex items-center gap-2 mb-1">
          <Icon name="lucide:mail-plus" class="w-5 h-5 text-primary" />
          E-Mail erfassen
        </h3>
        <p class="text-xs text-base-content/60 mb-4">
          Kopiere die komplette Mail inklusive Kopfzeilen (Von / An / Datum / Betreff) hier hinein
          &ndash; oder lade die .eml-Datei hoch, dann werden auch die Anhänge übernommen.
        </p>

        <!-- Schritt 1: Eingabe -->
        <div v-if="!preview" class="space-y-3">
          <div
            class="border-2 border-dashed rounded-xl p-4 text-center transition-colors"
            :class="dragOver ? 'border-primary bg-primary/5' : 'border-base-300'"
            @dragover.prevent="dragOver = true"
            @dragleave.prevent="dragOver = false"
            @drop.prevent="onDropEml"
          >
            <Icon name="lucide:file-down" class="w-6 h-6 mx-auto text-base-content/40 mb-1" />
            <p class="text-xs text-base-content/60">
              .eml-Datei hier ablegen oder
              <label class="link link-primary cursor-pointer">
                auswählen
                <input type="file" accept=".eml,message/rfc822" class="hidden" @change="onPickEml" />
              </label>
            </p>
            <p v-if="emlFileName" class="text-xs font-semibold text-primary mt-1">{{ emlFileName }}</p>
          </div>

          <div class="divider text-xs my-1">oder Text einfügen</div>

          <textarea
            v-model="rawText"
            rows="10"
            class="textarea textarea-bordered w-full text-xs font-mono"
            placeholder="Von: makler@beispiel.de&#10;An: ich@beispiel.de&#10;Datum: 12.03.2026 09:24&#10;Betreff: Grundstück Brauhausberg&#10;&#10;Sehr geehrte..."
          ></textarea>

          <div class="flex justify-end gap-2">
            <button class="btn btn-sm btn-ghost" @click="closeImport">Abbrechen</button>
            <button
              class="btn btn-sm btn-primary gap-1.5"
              :disabled="parsing || (!rawText.trim() && !emlFile)"
              @click="runParse"
            >
              <span v-if="parsing" class="loading loading-spinner loading-xs"></span>
              <Icon v-else name="lucide:sparkles" class="w-4 h-4" />
              <span>Auswerten</span>
            </button>
          </div>
        </div>

        <!-- Schritt 2: Vorschau & Bestätigung -->
        <div v-else class="space-y-3">
          <div v-if="preview.isSimulated" class="alert alert-warning text-xs py-2">
            <Icon name="lucide:alert-triangle" class="w-4 h-4" />
            <span>Kein Gemini-Key aktiv &ndash; Felder wurden nur grob erkannt. Bitte prüfen.</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label class="label label-text text-xs py-0.5">Betreff</label>
              <input v-model="form.subject" type="text" class="input input-sm input-bordered w-full" />
            </div>
            <div>
              <label class="label label-text text-xs py-0.5">Richtung</label>
              <select v-model="form.direction" class="select select-sm select-bordered w-full">
                <option value="inbound">Empfangen (vom Makler)</option>
                <option value="outbound">Gesendet (von mir)</option>
              </select>
            </div>
            <div>
              <label class="label label-text text-xs py-0.5">Von</label>
              <input v-model="form.fromAddress" type="text" class="input input-sm input-bordered w-full" />
            </div>
            <div>
              <label class="label label-text text-xs py-0.5">An</label>
              <input v-model="form.toAddress" type="text" class="input input-sm input-bordered w-full" />
            </div>
            <div>
              <label class="label label-text text-xs py-0.5">Datum der Mail</label>
              <input v-model="form.occurredAtLocal" type="datetime-local" class="input input-sm input-bordered w-full" />
            </div>
            <div>
              <label class="label label-text text-xs py-0.5">Wiedervorlage</label>
              <input v-model="form.nextFollowUpDate" type="date" class="input input-sm input-bordered w-full" />
            </div>
          </div>

          <div>
            <label class="label label-text text-xs py-0.5">Zusammenfassung</label>
            <input v-model="form.summary" type="text" class="input input-sm input-bordered w-full" />
          </div>

          <details class="collapse collapse-arrow bg-base-200/40 border border-base-300">
            <summary class="collapse-title text-xs font-semibold min-h-0 py-2">Nachrichtentext</summary>
            <div class="collapse-content">
              <textarea v-model="form.bodyText" rows="8" class="textarea textarea-bordered w-full text-xs"></textarea>
            </div>
          </details>

          <!-- Erkannte Zusagen -->
          <div v-if="preview.insights?.commitments?.length" class="bg-info/10 border border-info/30 rounded-lg p-2.5">
            <div class="text-xs font-semibold text-info flex items-center gap-1 mb-1">
              <Icon name="lucide:handshake" class="w-3.5 h-3.5" />
              Erkannte Zusagen
            </div>
            <ul class="text-xs text-base-content/80 list-disc list-inside space-y-0.5">
              <li v-for="(commitment, i) in preview.insights.commitments" :key="i">{{ commitment }}</li>
            </ul>
          </div>

          <!-- Erkannte Fakten -->
          <div v-if="preview.insights?.facts?.length" class="bg-success/10 border border-success/30 rounded-lg p-2.5">
            <div class="text-xs font-semibold text-success flex items-center gap-1 mb-1">
              <Icon name="lucide:database" class="w-3.5 h-3.5" />
              Erkannte Grundstücksdaten
            </div>
            <ul class="text-xs text-base-content/80 space-y-0.5">
              <li v-for="(fact, i) in preview.insights.facts" :key="i">
                <strong>{{ fieldLabel(fact.field) }}:</strong> {{ fact.value }}
                <span class="text-base-content/50 italic">&ndash; &bdquo;{{ fact.quote }}&ldquo;</span>
              </li>
            </ul>
            <p class="text-[11px] text-base-content/50 mt-1">
              Werte werden nicht automatisch übernommen &ndash; trage sie bei Bedarf oben im Grundstück nach.
            </p>
          </div>

          <!-- Checklisten-Vorschläge -->
          <div v-if="checklistChoices.length" class="bg-base-200/50 border border-base-300 rounded-lg p-2.5">
            <div class="text-xs font-semibold flex items-center gap-1 mb-1.5">
              <Icon name="lucide:check-square" class="w-3.5 h-3.5 text-primary" />
              Checkliste aktualisieren
            </div>
            <label
              v-for="choice in checklistChoices"
              :key="choice.title"
              class="flex items-center gap-2 text-xs py-0.5 cursor-pointer"
            >
              <input v-model="choice.apply" type="checkbox" class="checkbox checkbox-xs checkbox-primary" />
              <span>{{ choice.title }} &rarr; <strong>{{ statusLabel(choice.status) }}</strong></span>
            </label>
          </div>

          <!-- Anhänge -->
          <div v-if="preview.attachments?.length" class="bg-base-200/50 border border-base-300 rounded-lg p-2.5">
            <div class="text-xs font-semibold flex items-center gap-1 mb-1.5">
              <Icon name="lucide:paperclip" class="w-3.5 h-3.5 text-primary" />
              Anhänge aus der .eml
            </div>
            <div
              v-for="(attachment, i) in preview.attachments"
              :key="i"
              class="flex items-center gap-2 text-xs py-1"
            >
              <input v-model="attachment.keep" type="checkbox" class="checkbox checkbox-xs checkbox-primary" />
              <span class="flex-1 truncate">{{ attachment.fileName }} ({{ (attachment.size / 1024).toFixed(0) }} KB)</span>
              <select v-model="attachment.docType" class="select select-xs select-bordered">
                <option value="expose">Exposé</option>
                <option value="bplan">Bebauungsplan</option>
                <option value="kataster">Katasterauszug</option>
                <option value="grundbuch">Grundbuchauszug</option>
                <option value="altlasten">Altlasten/Boden</option>
                <option value="sonstiges">Sonstiges</option>
              </select>
            </div>
          </div>

          <div class="flex justify-between gap-2 pt-1">
            <button class="btn btn-sm btn-ghost" @click="preview = null">Zurück</button>
            <div class="flex gap-2">
              <button class="btn btn-sm btn-ghost" @click="closeImport">Abbrechen</button>
              <button class="btn btn-sm btn-primary gap-1.5" :disabled="saving" @click="save">
                <span v-if="saving" class="loading loading-spinner loading-xs"></span>
                <Icon v-else name="lucide:check" class="w-4 h-4" />
                <span>In Verlauf übernehmen</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop" @click="closeImport"><button>close</button></form>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

const toast = useToast()

const props = defineProps<{
  propertyId: string
  threads: any[]
  communications: any[]
  brokerEmail?: string | null
  /** Aus der ⌘K-Suche angesprungener Thread - wird hervorgehoben und aufgeklappt. */
  highlightThreadId?: string | null
}>()

const emit = defineEmits<{ (e: 'refresh'): void }>()

const expanded = ref<Set<string>>(new Set(
  props.highlightThreadId
    ? [props.highlightThreadId]
    : (props.threads?.[0] ? [props.threads[0].id] : [])
))
const showImport = ref(false)
const parsing = ref(false)
const saving = ref(false)
const busyId = ref<string | null>(null)
const uploadingFor = ref<string | null>(null)
const dragOver = ref(false)

const rawText = ref('')
const emlFile = ref<File | null>(null)
const emlFileName = ref('')
const preview = ref<any>(null)

const form = reactive({
  subject: '',
  direction: 'inbound',
  fromAddress: '',
  toAddress: '',
  occurredAtLocal: '',
  nextFollowUpDate: '',
  summary: '',
  bodyText: ''
})

const checklistChoices = ref<Array<{ title: string, status: string, apply: boolean }>>([])

const drafts = computed(() =>
  (props.communications || []).filter((c: any) => c.state === 'draft')
)

function threadAttachmentCount(thread: any) {
  return (thread.messages || []).reduce((sum: number, m: any) => sum + (m.attachments?.length || 0), 0)
}

function insightsOf(message: any) {
  if (!message.aiInsightsJson) return null
  try {
    return JSON.parse(message.aiInsightsJson)
  } catch {
    return null
  }
}

function toggleThread(id: string) {
  const next = new Set(expanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expanded.value = next
}

function openImport() {
  showImport.value = true
}

function closeImport() {
  showImport.value = false
  preview.value = null
  rawText.value = ''
  emlFile.value = null
  emlFileName.value = ''
  checklistChoices.value = []
}

function onPickEml(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    emlFile.value = file
    emlFileName.value = file.name
  }
}

function onDropEml(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    emlFile.value = file
    emlFileName.value = file.name
  }
}

/** Timestamp -> Wert für <input type="datetime-local"> in lokaler Zeit */
function toLocalInput(ms: number | null): string {
  if (!ms) return ''
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function runParse() {
  parsing.value = true
  try {
    let result: any
    if (emlFile.value) {
      const formData = new FormData()
      formData.append('file', emlFile.value)
      result = await $fetch(`/api/properties/${props.propertyId}/emails/parse`, {
        method: 'POST',
        body: formData
      })
    } else {
      result = await $fetch(`/api/properties/${props.propertyId}/emails/parse`, {
        method: 'POST',
        body: { rawText: rawText.value }
      })
    }

    form.subject = result.subject || ''
    form.direction = result.direction === 'outbound' ? 'outbound' : 'inbound'
    form.fromAddress = result.fromAddress || ''
    form.toAddress = result.toAddress || ''
    form.occurredAtLocal = toLocalInput(result.occurredAt) || toLocalInput(Date.now())
    form.nextFollowUpDate = result.insights?.suggestedFollowUpDate || ''
    form.summary = result.summary || ''
    form.bodyText = result.bodyText || ''

    checklistChoices.value = (result.insights?.checklistUpdates || []).map((update: any) => ({
      title: update.title,
      status: update.status,
      apply: true
    }))

    for (const attachment of (result.attachments || [])) {
      attachment.keep = true
    }

    preview.value = result
  } catch (err: any) {
    toast.error('Auswertung fehlgeschlagen: ' + (err.data?.statusMessage || err.message))
  } finally {
    parsing.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const result = await $fetch<any>(`/api/properties/${props.propertyId}/emails`, {
      method: 'POST',
      body: {
        subject: form.subject,
        direction: form.direction,
        fromAddress: form.fromAddress || null,
        toAddress: form.toAddress || null,
        occurredAt: form.occurredAtLocal ? new Date(form.occurredAtLocal).getTime() : Date.now(),
        nextFollowUpDate: form.nextFollowUpDate || null,
        summary: form.summary,
        bodyText: form.bodyText,
        insights: preview.value?.insights || null,
        checklistUpdates: checklistChoices.value.filter(c => c.apply).map(c => ({ title: c.title, status: c.status })),
        attachments: (preview.value?.attachments || []).filter((a: any) => a.keep)
      }
    })

    const parts = ['E-Mail im Verlauf gespeichert']
    if (result.attachments?.length) parts.push(`${result.attachments.length} Anhang/Anhänge übernommen`)
    if (result.appliedChecklist?.length) parts.push(`${result.appliedChecklist.length} Checklisten-Punkt(e) aktualisiert`)

    closeImport()
    emit('refresh')
    toast.success(parts.join(' · '))
  } catch (err: any) {
    toast.error('Speichern fehlgeschlagen: ' + (err.data?.statusMessage || err.message))
  } finally {
    saving.value = false
  }
}

async function markAsSent(draft: any) {
  busyId.value = draft.id
  try {
    await $fetch(`/api/properties/${props.propertyId}/emails/${draft.id}`, {
      method: 'PUT',
      body: { state: 'sent', toAddress: draft.toAddress || props.brokerEmail || null }
    })
    emit('refresh')
    toast.success('Entwurf als gesendet markiert und im Verlauf abgelegt.')
  } catch (err: any) {
    toast.error('Fehler: ' + (err.data?.statusMessage || err.message))
  } finally {
    busyId.value = null
  }
}

async function attachToMessage(event: Event, commId: string) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length === 0) return

  uploadingFor.value = commId
  try {
    const formData = new FormData()
    for (const file of files) formData.append('file', file)
    formData.append('communicationId', commId)

    const result = await $fetch<any>(`/api/properties/${props.propertyId}/documents/upload`, {
      method: 'POST',
      body: formData
    })

    emit('refresh')
    if (result.duplicates?.length) {
      toast.warning(`Bereits vorhanden: ${result.duplicates.join(', ')}`)
    } else {
      toast.success(`${result.uploaded} Datei(en) angehängt, Analyse läuft im Hintergrund.`)
    }
  } catch (err: any) {
    toast.error('Upload fehlgeschlagen: ' + (err.data?.statusMessage || err.message))
  } finally {
    uploadingFor.value = null
    input.value = ''
  }
}

async function remove(commId: string) {
  if (!confirm('Eintrag wirklich löschen?')) return
  try {
    await $fetch(`/api/properties/${props.propertyId}/communications/${commId}`, { method: 'DELETE' })
    emit('refresh')
    toast.success('Eintrag gelöscht.')
  } catch (err: any) {
    toast.error('Fehler: ' + (err.data?.statusMessage || err.message))
  }
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
  toast.success('In die Zwischenablage kopiert.')
}

function mailtoLink(draft: any) {
  const to = draft.toAddress || props.brokerEmail || ''
  const subject = encodeURIComponent(draft.subject || '')
  const body = encodeURIComponent(draft.bodyText || '')
  return `mailto:${to}?subject=${subject}&body=${body}`
}

function fieldLabel(field: string) {
  const map: Record<string, string> = {
    askingPrice: 'Kaufpreis',
    areaSqm: 'Fläche',
    pricePerSqm: 'Preis/m²',
    buildingLaw: 'Baurecht',
    grz: 'GRZ',
    gfz: 'GFZ',
    developmentStatus: 'Erschließung',
    address: 'Adresse'
  }
  return map[field] || field
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    received: 'Erhalten',
    requested: 'Angefordert',
    missing: 'Fehlt',
    not_applicable: 'Entfällt'
  }
  return map[status] || status
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
