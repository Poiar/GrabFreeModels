import { ref, onMounted, onUnmounted } from 'vue'

export function useBreakpoint() {
  const isMobile = ref(false)

  function check() {
    isMobile.value = window.innerWidth < 640
  }

  onMounted(() => {
    check()
    window.addEventListener('resize', check)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', check)
  })

  return { isMobile }
}
