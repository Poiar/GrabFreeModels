import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

export function useKeyboardShortcuts() {
  const router = useRouter()
  const shortcutsModalOpen = ref(false)

  function handleKeydown(e: KeyboardEvent) {
    // Don't trigger shortcuts when typing in inputs
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

    // ? opens shortcuts modal
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault()
      shortcutsModalOpen.value = !shortcutsModalOpen.value
      return
    }

    // Navigation shortcuts (vim-style g + key)
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
      // Wait for next key
      const handler = (nextE: KeyboardEvent) => {
        window.removeEventListener('keydown', handler)
        switch (nextE.key) {
          case 'd': router.push('/'); break
          case 'a': router.push('/all'); break
          case 'f': router.push('/free'); break
          case 'p': router.push('/paid'); break
          case 's': router.push('/models'); break
          case 'i': router.push('/issues'); break
          case 'u': router.push('/author'); break
          case 'm': router.push('/family'); break
        }
      }
      window.addEventListener('keydown', handler)
      return
    }

    // / focuses search
    if (e.key === '/' && !e.shiftKey) {
      e.preventDefault()
      const searchInput = document.querySelector('.jql-input') as HTMLInputElement | null
      if (searchInput) searchInput.focus()
      return
    }

    // t toggles theme
    if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
      document.querySelector('.theme-toggle')?.dispatchEvent(new MouseEvent('click'))
      return
    }
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown))
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

  return { shortcutsModalOpen, close: () => { shortcutsModalOpen.value = false } }
}
