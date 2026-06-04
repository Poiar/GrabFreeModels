import { ref, type Ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: number
  message: string
  type: ToastType
  duration: number
}

const toasts: Ref<ToastItem[]> = ref([])
let nextId = 0

export function useToast() {
  function showToast(message: string, type: ToastType = 'info', duration = 3000) {
    const id = nextId++
    toasts.value.push({ id, message, type, duration })
    if (duration > 0) {
      setTimeout(() => remove(id), duration)
    }
    return id
  }

  function remove(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  function success(message: string, duration?: number) { return showToast(message, 'success', duration) }
  function error(message: string, duration?: number) { return showToast(message, 'error', duration) }
  function info(message: string, duration?: number) { return showToast(message, 'info', duration) }
  function warning(message: string, duration?: number) { return showToast(message, 'warning', duration) }

  return { toasts, showToast, remove, success, error, info, warning }
}
