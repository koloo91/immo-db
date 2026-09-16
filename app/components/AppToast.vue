<template>
  <div class="toast toast-top toast-end z-[9999] p-4 space-y-2 pointer-events-none mt-14">
    <TransitionGroup 
      name="toast-fade" 
      tag="div" 
      class="flex flex-col gap-2 items-end"
    >
      <div 
        v-for="t in toasts" 
        :key="t.id"
        class="alert shadow-xl py-2.5 px-4 text-xs font-medium border flex items-center gap-2 pointer-events-auto cursor-pointer max-w-sm sm:max-w-md transition-all hover:scale-[1.02]"
        :class="{
          'alert-success bg-emerald-600 text-white border-emerald-500': t.type === 'success',
          'alert-error bg-rose-600 text-white border-rose-500': t.type === 'error',
          'alert-warning bg-amber-500 text-white border-amber-400': t.type === 'warning',
          'alert-info bg-sky-600 text-white border-sky-500': t.type === 'info'
        }"
        @click="remove(t.id)"
      >
        <Icon v-if="t.type === 'success'" name="lucide:check-circle-2" class="w-4 h-4 shrink-0" />
        <Icon v-else-if="t.type === 'error'" name="lucide:alert-circle" class="w-4 h-4 shrink-0" />
        <Icon v-else-if="t.type === 'warning'" name="lucide:alert-triangle" class="w-4 h-4 shrink-0" />
        <Icon v-else name="lucide:info" class="w-4 h-4 shrink-0" />
        
        <span class="flex-1 leading-snug">{{ t.message }}</span>

        <button 
          type="button" 
          class="btn btn-ghost btn-sm btn-circle text-white/80 hover:text-white hover:bg-white/20 ml-1 shrink-0"
          @click.stop="remove(t.id)"
        >
          <Icon name="lucide:x" class="w-3.5 h-3.5" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '~/composables/useToast'

const { toasts, remove } = useToast()
</script>

<style scoped>
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.25s ease;
}
.toast-fade-enter-from {
  opacity: 0;
  transform: translateX(30px) scale(0.95);
}
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(30px) scale(0.95);
}
</style>
