<template>
  <div class="space-y-6">
    <!-- 1. Broker Profile Card -->
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-4 sm:p-5 space-y-3">
        <div class="flex items-center justify-between border-b border-base-200 pb-2">
          <h3 class="font-bold text-sm flex items-center gap-2">
            <Icon name="lucide:user" class="w-4 h-4 text-primary" />
            Makler & Ansprechpartner
          </h3>
          <button class="btn btn-ghost btn-xs text-primary gap-1" @click="isEditingBroker = !isEditingBroker">
            <Icon :name="isEditingBroker ? 'lucide:check' : 'lucide:edit-2'" class="w-3.5 h-3.5" />
            <span>{{ isEditingBroker ? 'Fertig' : 'Bearbeiten' }}</span>
          </button>
        </div>

        <!-- Broker view mode -->
        <div v-if="!isEditingBroker" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="space-y-1">
            <div class="font-bold text-base">{{ broker?.name || 'Kein Ansprechpartner hinterlegt' }}</div>
            <div class="text-xs text-base-content/70">{{ broker?.company || 'Kein Maklerbüro angegeben' }}</div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <a 
              v-if="broker?.email" 
              :href="`mailto:${broker.email}`" 
              class="btn btn-sm btn-outline btn-primary gap-1.5"
            >
              <Icon name="lucide:mail" class="w-4 h-4" />
              <span>{{ broker.email }}</span>
            </a>
            <a 
              v-if="broker?.phone" 
              :href="`tel:${broker.phone}`" 
              class="btn btn-sm btn-outline gap-1.5"
            >
              <Icon name="lucide:phone" class="w-4 h-4" />
              <span>{{ broker.phone }}</span>
            </a>
            <a 
              v-if="broker?.website" 
              :href="broker.website" 
              target="_blank" 
              rel="noopener" 
              class="btn btn-sm btn-ghost btn-circle"
              title="Webseite"
            >
              <Icon name="lucide:globe" class="w-4 h-4" />
            </a>
          </div>
        </div>

        <!-- Broker edit mode -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div>
            <label class="label label-text text-xs py-0.5">Name des Maklers</label>
            <input v-model="brokerForm.name" type="text" class="input input-sm input-bordered w-full" placeholder="z. B. Sabine Lindner" />
          </div>
          <div>
            <label class="label label-text text-xs py-0.5">Maklerfirma / Büro</label>
            <input v-model="brokerForm.company" type="text" class="input input-sm input-bordered w-full" placeholder="z. B. Havel Immobilien" />
          </div>
          <div>
            <label class="label label-text text-xs py-0.5">E-Mail</label>
            <input v-model="brokerForm.email" type="email" class="input input-sm input-bordered w-full" placeholder="lindner@makler.de" />
          </div>
          <div>
            <label class="label label-text text-xs py-0.5">Telefon</label>
            <input v-model="brokerForm.phone" type="text" class="input input-sm input-bordered w-full" placeholder="+49 331 123456" />
          </div>
          <div class="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button class="btn btn-sm btn-primary" :disabled="savingBroker" @click="saveBroker">
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Checklist for Required Documents -->
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-4 sm:p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-200 pb-3">
          <div>
            <h3 class="font-bold text-sm flex items-center gap-2">
              <Icon name="lucide:check-square" class="w-4 h-4 text-primary" />
              Unterlagen-Status & Anforderungsliste
            </h3>
            <p class="text-xs text-base-content/60 mt-0.5">
              Behalte den Überblick über Grundbuch, B-Plan, Katasterauszug und offene Anfragen.
            </p>
          </div>

          <!-- AI Inquiry Email Button -->
          <button 
            class="btn btn-sm btn-primary gap-1.5"
            :disabled="generatingDraft"
            @click="generateEmailDraft"
          >
            <span v-if="generatingDraft" class="loading loading-spinner loading-xs"></span>
            <Icon v-else name="lucide:sparkles" class="w-4 h-4" />
            <span>KI-Anfrage generieren</span>
          </button>
        </div>

        <!-- AI Draft Modal / Box if generated -->
        <div v-if="emailDraft" class="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="font-bold text-xs text-primary flex items-center gap-1.5">
              <Icon name="lucide:mail" class="w-4 h-4" />
              KI-Entwurf: E-Mail an Makler für fehlende Unterlagen
            </span>
            <button class="btn btn-ghost btn-xs btn-circle" @click="emailDraft = ''">
              <Icon name="lucide:x" class="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea 
            v-model="emailDraft" 
            rows="8" 
            class="textarea textarea-bordered w-full font-mono text-xs bg-base-100"
          ></textarea>
          <div class="flex items-center justify-between">
            <span class="text-xs text-base-content/60">
              Kann vor dem Senden frei angepasst werden.
              <template v-if="draftOpenQuestions.length">
                Enthält {{ draftOpenQuestions.length }} offene Frage(n) aus der KI-Gesamtanalyse.
              </template>
            </span>
            <div class="flex gap-2">
              <button class="btn btn-xs btn-outline" @click="copyDraft">
                <Icon name="lucide:copy" class="w-3.5 h-3.5" />
                {{ copiedDraft ? 'Kopiert!' : 'Kopieren' }}
              </button>
              <button class="btn btn-xs btn-primary" @click="saveDraftAsTimeline">
                Als Entwurf ablegen
              </button>
            </div>
          </div>
        </div>

        <!-- Checklist Items Table/List -->
        <div class="divide-y divide-base-200">
          <div 
            v-for="item in checklist" 
            :key="item.id" 
            class="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
          >
            <div class="space-y-0.5">
              <div class="font-semibold flex items-center gap-2">
                <Icon 
                  :name="getChecklistIcon(item.status)" 
                  class="w-4 h-4 shrink-0"
                  :class="getChecklistIconColor(item.status)"
                />
                <span>{{ item.title }}</span>
              </div>
              <div v-if="item.notes" class="text-base-content/60 pl-6 text-xs">
                {{ item.notes }}
              </div>
            </div>

            <!-- Status Buttons -->
            <div class="flex items-center gap-1 self-end sm:self-center">
              <button 
                class="btn btn-xs"
                :class="item.status === 'received' ? 'btn-success text-success-content' : 'btn-ghost text-base-content/60'"
                @click="updateItemStatus(item, 'received')"
              >
                Erhalten
              </button>
              <button 
                class="btn btn-xs"
                :class="item.status === 'requested' ? 'btn-warning text-warning-content' : 'btn-ghost text-base-content/60'"
                @click="updateItemStatus(item, 'requested')"
              >
                Angefordert
              </button>
              <button 
                class="btn btn-xs"
                :class="item.status === 'missing' ? 'btn-error text-error-content' : 'btn-ghost text-base-content/60'"
                @click="updateItemStatus(item, 'missing')"
              >
                Fehlt
              </button>
            </div>
          </div>
        </div>

        <!-- Add Custom Checklist Item -->
        <div class="pt-2 flex gap-2">
          <input 
            v-model="newChecklistTitle" 
            type="text" 
            placeholder="Weiteres Dokument / Nachweis hinzufügen..." 
            class="input input-sm input-bordered flex-1"
            @keyup.enter="addChecklistItem"
          />
          <button class="btn btn-sm btn-outline" :disabled="!newChecklistTitle.trim()" @click="addChecklistItem">
            Hinzufügen
          </button>
        </div>
      </div>
    </div>

    <!-- 3. Chronological Communication Timeline -->
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-4 sm:p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-base-200 pb-2">
          <h3 class="font-bold text-sm flex items-center gap-2">
            <Icon name="lucide:messages-square" class="w-4 h-4 text-primary" />
            Telefonate, Termine & Notizen
          </h3>
          <span class="badge badge-sm font-mono">{{ timelineEntries.length }} Einträge</span>
        </div>

        <!-- Form for new communication entry -->
        <div class="bg-base-200/50 p-4 rounded-xl border border-base-300 space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="label label-text text-xs py-1">Art</label>
              <select v-model="newComm.channel" class="select select-sm select-bordered w-full">
                <option value="phone">Telefonat</option>
                <option value="email">E-Mail</option>
                <option value="meeting">Besichtigung / Termin</option>
                <option value="note">Notiz / Gedanke</option>
              </select>
            </div>

            <div>
              <label class="label label-text text-xs py-1">Richtung</label>
              <select v-model="newComm.direction" class="select select-sm select-bordered w-full">
                <option value="outbound">Gesendet / Ausgehend</option>
                <option value="inbound">Empfangen / Eingehend</option>
              </select>
            </div>

            <div>
              <label class="label label-text text-xs py-1">Wiedervorlage</label>
              <input 
                v-model="newComm.nextFollowUpDate" 
                type="date" 
                class="input input-sm input-bordered w-full"
              />
            </div>
          </div>

          <div>
            <label class="label label-text text-xs py-1">Zusammenfassung</label>
            <input 
              v-model="newComm.summary" 
              type="text" 
              placeholder="z. B. Telefonat wegen B-Plan und Erschließung" 
              class="input input-sm input-bordered w-full"
            />
          </div>

          <div>
            <label class="label label-text text-xs py-1">Details <span class="text-base-content/50 font-normal">(optional)</span></label>
            <textarea 
              v-model="newComm.details" 
              rows="3" 
              placeholder="Vereinbarungen, Antworten des Maklers, offene Punkte..." 
              class="textarea textarea-sm textarea-bordered w-full"
            ></textarea>
          </div>

          <div class="flex justify-end pt-1">
            <button 
              class="btn btn-sm btn-primary gap-1.5"
              :disabled="savingComm || !newComm.summary.trim()"
              @click="addCommunication"
            >
              <Icon name="lucide:plus" class="w-4 h-4" />
              <span>Eintrag speichern</span>
            </button>
          </div>
        </div>

        <!-- Timeline List -->
        <div v-if="timelineEntries.length === 0" class="text-center py-6 text-xs text-base-content/50">
          Noch keine Gespräche oder Notizen dokumentiert. E-Mails stehen oben im Verlauf.
        </div>

        <div v-else class="space-y-3 pt-2">
          <div 
            v-for="comm in timelineEntries" 
            :key="comm.id"
            class="p-3 bg-base-100 rounded-lg border border-base-200 hover:border-base-300 transition-colors space-y-1.5"
          >
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2">
                <span class="badge badge-sm badge-ghost font-medium">
                  {{ getChannelIcon(comm.channel) }} {{ getChannelLabel(comm.channel) }}
                </span>
                <span class="text-base-content/60 text-xs">
                  {{ formatDate(comm.createdAt) }}
                </span>
                <span v-if="comm.nextFollowUpDate" class="badge badge-xs badge-warning font-mono">
                  Frist: {{ comm.nextFollowUpDate }}
                </span>
              </div>
              <button 
                class="btn btn-ghost btn-xs btn-circle text-error/60 hover:text-error"
                title="Löschen"
                @click="deleteCommunication(comm.id)"
              >
                <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
              </button>
            </div>

            <div class="font-semibold text-xs text-base-content">
              {{ comm.summary }}
            </div>

            <div v-if="comm.details" class="text-xs text-base-content/80 whitespace-pre-line bg-base-200/40 p-2 rounded">
              {{ comm.details }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

const toast = useToast()

const props = defineProps<{
  propertyId: string
  broker?: any
  checklist: any[]
  communications: any[]
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

// E-Mails leben im EmailThreadView; hier bleiben Telefonate, Termine, Notizen
// und Altbestand aus der Zeit vor den Threads.
const timelineEntries = computed(() =>
  (props.communications || []).filter((c: any) => c.state !== 'draft' && !c.threadId)
)

const isEditingBroker = ref(false)
const savingBroker = ref(false)
const brokerForm = reactive({
  name: props.broker?.name || '',
  company: props.broker?.company || '',
  email: props.broker?.email || '',
  phone: props.broker?.phone || ''
})

const generatingDraft = ref(false)
const emailDraft = ref('')
const copiedDraft = ref(false)
const draftOpenQuestions = ref<string[]>([])

// Gemini schreibt die Betreffzeile mit in den Entwurf - die ziehen wir raus,
// damit der Entwurf im Verlauf unter dem richtigen Betreff auftaucht.
const draftSubject = computed(() => {
  const match = emailDraft.value.match(/^\s*\**Betreff:?\**\s*(.+)$/im)
  return match?.[1]?.replace(/\*/g, '').trim() || 'Anfrage zum Grundstück'
})

const newChecklistTitle = ref('')

const savingComm = ref(false)
const newComm = reactive({
  channel: 'phone',
  direction: 'outbound',
  summary: '',
  details: '',
  nextFollowUpDate: ''
})

async function saveBroker() {
  savingBroker.value = true
  try {
    await $fetch(`/api/properties/${props.propertyId}`, {
      method: 'PUT',
      body: { broker: brokerForm }
    })
    isEditingBroker.value = false
    emit('refresh')
    toast.success('Maklerdaten gespeichert!')
  } catch (err: any) {
    toast.error('Fehler beim Speichern des Maklers: ' + err.message)
  } finally {
    savingBroker.value = false
  }
}

async function updateItemStatus(item: any, newStatus: string) {
  try {
    await $fetch(`/api/properties/${props.propertyId}/checklist`, {
      method: 'PUT',
      body: { id: item.id, status: newStatus }
    })
    emit('refresh')
    toast.success('Checklisten-Status aktualisiert!')
  } catch (err: any) {
    toast.error('Fehler: ' + err.message)
  }
}

async function addChecklistItem() {
  if (!newChecklistTitle.value.trim()) return
  try {
    await $fetch(`/api/properties/${props.propertyId}/checklist`, {
      method: 'POST',
      body: { title: newChecklistTitle.value.trim(), status: 'missing' }
    })
    newChecklistTitle.value = ''
    emit('refresh')
    toast.success('Punkt zur Checkliste hinzugefügt!')
  } catch (err: any) {
    toast.error('Fehler: ' + err.message)
  }
}

async function generateEmailDraft() {
  generatingDraft.value = true
  try {
    const res = await $fetch<any>(`/api/properties/${props.propertyId}/inquiry-email`, {
      method: 'POST'
    })
    emailDraft.value = res.draft || ''
    draftOpenQuestions.value = res.openQuestions || []
    toast.success(res.openQuestions?.length
      ? `Entwurf generiert - inkl. ${res.openQuestions.length} offene(r) Frage(n) aus der KI-Gesamtanalyse.`
      : 'E-Mail Entwurf generiert!')
  } catch (err: any) {
    toast.error('Fehler bei der KI-Generierung: ' + err.message)
  } finally {
    generatingDraft.value = false
  }
}

async function copyDraft() {
  if (!emailDraft.value) return
  await navigator.clipboard.writeText(emailDraft.value)
  copiedDraft.value = true
  toast.success('E-Mail-Entwurf in Zwischenablage kopiert!')
  setTimeout(() => (copiedDraft.value = false), 2000)
}

async function saveDraftAsTimeline() {
  try {
    await $fetch(`/api/properties/${props.propertyId}/communications`, {
      method: 'POST',
      body: {
        channel: 'email',
        direction: 'outbound',
        state: 'draft',
        subject: draftSubject.value,
        toAddress: props.broker?.email || null,
        summary: 'KI-Anfrage für fehlende Unterlagen',
        bodyText: emailDraft.value
      }
    })
    emailDraft.value = ''
    emit('refresh')
    toast.success('Als Entwurf im E-Mail-Verlauf abgelegt.')
  } catch (err: any) {
    toast.error('Fehler: ' + err.message)
  }
}

async function addCommunication() {
  if (!newComm.summary.trim()) return
  savingComm.value = true
  try {
    await $fetch(`/api/properties/${props.propertyId}/communications`, {
      method: 'POST',
      body: {
        channel: newComm.channel,
        direction: newComm.direction,
        summary: newComm.summary.trim(),
        details: newComm.details.trim() || null,
        nextFollowUpDate: newComm.nextFollowUpDate || null
      }
    })
    newComm.summary = ''
    newComm.details = ''
    newComm.nextFollowUpDate = ''
    emit('refresh')
    toast.success('Eintrag zur Chronik hinzugefügt!')
  } catch (err: any) {
    toast.error('Fehler: ' + err.message)
  } finally {
    savingComm.value = false
  }
}

async function deleteCommunication(commId: string) {
  if (!confirm('Eintrag wirklich löschen?')) return
  try {
    await $fetch(`/api/properties/${props.propertyId}/communications/${commId}`, {
      method: 'DELETE'
    })
    emit('refresh')
    toast.success('Eintrag gelöscht!')
  } catch (err: any) {
    toast.error('Fehler: ' + err.message)
  }
}

function getChecklistIcon(status: string) {
  if (status === 'received') return 'lucide:check-circle-2'
  if (status === 'requested') return 'lucide:clock'
  return 'lucide:alert-circle'
}

function getChecklistIconColor(status: string) {
  if (status === 'received') return 'text-success'
  if (status === 'requested') return 'text-warning'
  return 'text-error'
}

function getChannelIcon(channel: string) {
  if (channel === 'phone') return '📞'
  if (channel === 'email') return '✉️'
  if (channel === 'meeting') return '🤝'
  return '📝'
}

function getChannelLabel(channel: string) {
  const map: Record<string, string> = {
    phone: 'Telefonat',
    email: 'E-Mail',
    meeting: 'Termin',
    note: 'Notiz'
  }
  return map[channel] || channel
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
