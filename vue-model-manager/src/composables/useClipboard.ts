import { ref } from 'vue'

/**
 * Shared clipboard helper — one instance per component is fine, but this
 * composable can also be called at module level for a shared singleton.
 */
export function useClipboard(timeout = 1500) {
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copied.value = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        copied.value = false
        timer = null
      }, timeout)
    } catch {
      // fallback for older browsers / non-HTTPS
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      copied.value = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        copied.value = false
        timer = null
      }, timeout)
    }
  }

  return { copied, copy }
}
