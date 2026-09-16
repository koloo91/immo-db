<template>
  <div class="card bg-base-100 border border-base-300 shadow-sm flex flex-col h-[520px]">
    <!-- Header -->
    <div class="p-3.5 border-b border-base-200 flex items-center justify-between bg-base-200/40 rounded-t-xl">
      <div class="flex items-center gap-2">
        <div class="w-2.5 h-2.5 rounded-full bg-accent animate-pulse"></div>
        <h3 class="font-bold text-sm flex items-center gap-1.5">
          <Icon name="lucide:bot" class="w-4 h-4 text-accent" />
          <span>KI-Assistent: Fragen zu den Dokumenten (Gemini)</span>
        </h3>
      </div>
      <span class="text-[11px] text-base-content/60 font-mono">Q&A mit Exposé & B-Plan</span>
    </div>

    <!-- Chat Messages Container -->
    <div ref="chatContainer" class="flex-1 p-4 overflow-y-auto space-y-3">
      <!-- Welcome message if no chat yet -->
      <div v-if="chats.length === 0" class="text-center py-8 space-y-3">
        <div class="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
          <Icon name="lucide:message-square-text" class="w-6 h-6" />
        </div>
        <div class="space-y-1">
          <h4 class="font-semibold text-sm">Stelle Fragen zu diesem Grundstück</h4>
          <p class="text-xs text-base-content/60 max-w-md mx-auto">
            Gemini beantwortet Fragen auf Basis der Stammdaten und der hochgeladenen PDF-Dokumente (z. B. B-Plan Festsetzungen, Baulasten, Erschließung).
          </p>
        </div>

        <!-- Quick Suggestions -->
        <div class="flex flex-wrap justify-center gap-1.5 pt-2 max-w-lg mx-auto">
          <button 
            v-for="(sug, idx) in suggestions" 
            :key="idx" 
            class="btn btn-xs btn-outline rounded-full font-normal"
            @click="sendQuickQuestion(sug)"
          >
            {{ sug }}
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div 
        v-for="msg in chats" 
        :key="msg.id"
        class="chat"
        :class="msg.role === 'user' ? 'chat-end' : 'chat-start'"
      >
        <div class="chat-header text-[10px] text-base-content/50 mb-0.5">
          {{ msg.role === 'user' ? 'Du' : 'Gemini KI' }}
        </div>
        <div 
          class="chat-bubble text-xs leading-relaxed"
          :class="msg.role === 'user' ? 'chat-bubble-primary' : 'bg-base-200 text-base-content border border-base-300'"
        >
          <div class="whitespace-pre-line">{{ msg.message }}</div>
        </div>
      </div>

      <!-- Typing indicator -->
      <div v-if="sending" class="chat chat-start">
        <div class="chat-bubble bg-base-200 text-base-content border border-base-300 text-xs py-2 px-3">
          <span class="loading loading-dots loading-xs"></span>
          <span class="ml-2 text-base-content/60">Analysiere Dokumente...</span>
        </div>
      </div>
    </div>

    <!-- Input Footer -->
    <div class="p-3 border-t border-base-200 bg-base-200/20 rounded-b-xl">
      <form @submit.prevent="sendMessage" class="flex gap-2">
        <input 
          v-model="inputQuestion" 
          type="text" 
          placeholder="Frage zu B-Plan, Baulasten, GRZ oder Erschließung stellen..." 
          class="input input-sm input-bordered flex-1"
          :disabled="sending"
        />
        <button 
          type="submit" 
          class="btn btn-sm btn-primary shrink-0 gap-1.5"
          :disabled="sending || !inputQuestion.trim()"
        >
          <Icon name="lucide:send" class="w-3.5 h-3.5" />
          <span>Senden</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

const props = defineProps<{
  propertyId: string
  initialChats?: any[]
}>()

const chats = ref<any[]>(props.initialChats || [])
const inputQuestion = ref('')
const sending = ref(false)
const chatContainer = ref<HTMLElement | null>(null)

const suggestions = [
  'Welche Bebaubarkeit & Geschossigkeit ist zulässig?',
  'Gibt es Erwähnungen von Baulasten oder Dienstbarkeiten?',
  'Welche Erschließungskosten könnten noch anfallen?',
  'Was sind die wichtigsten Vor- und Nachteile?'
]

async function loadChats() {
  try {
    const res = await $fetch<any[]>(`/api/properties/${props.propertyId}/chat`)
    chats.value = res || []
    scrollToBottom()
  } catch {}
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

async function sendQuickQuestion(q: string) {
  inputQuestion.value = q
  await sendMessage()
}

async function sendMessage() {
  const q = inputQuestion.value.trim()
  if (!q || sending.value) return

  const tempUserMsg = {
    id: 'temp-' + Date.now(),
    role: 'user',
    message: q
  }
  chats.value.push(tempUserMsg)
  inputQuestion.value = ''
  sending.value = true
  scrollToBottom()

  try {
    const res = await $fetch<any>(`/api/properties/${props.propertyId}/chat`, {
      method: 'POST',
      body: { message: q }
    })
    chats.value.push(res)
  } catch (err: any) {
    chats.value.push({
      id: 'err-' + Date.now(),
      role: 'assistant',
      message: 'Fehler bei der Antwort: ' + (err.data?.statusMessage || err.message)
    })
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

onMounted(() => {
  loadChats()
})
</script>
