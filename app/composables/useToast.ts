import { ref, readonly } from 'vue'

export interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
}

const toasts = ref<ToastItem[]>([])

export function useToast() {
  function add(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success', duration = 3500) {
    const id = 'toast-' + Math.random().toString(36).substring(2, 9)
    toasts.value.push({ id, message, type, duration })

    if (duration > 0) {
      setTimeout(() => {
        remove(id)
      }, duration)
    }
    return id
  }

  function success(message: string, duration = 3500) {
    return add(message, 'success', duration)
  }

  function error(message: string, duration = 5000) {
    return add(message, 'error', duration)
  }

  function info(message: string, duration = 3500) {
    return add(message, 'info', duration)
  }

  function warning(message: string, duration = 4000) {
    return add(message, 'warning', duration)
  }

  function remove(id: string) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return {
    toasts: readonly(toasts),
    add,
    success,
    error,
    info,
    warning,
    remove
  }
}
