import { ref, watch, onMounted } from 'vue'

const THEME_KEY = 'gfm-theme'
type Theme = 'dark' | 'light'

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch { /* localStorage unavailable */ }
  return null
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d1117' : '#f6f8fa')
}

const current = ref<Theme>(getStoredTheme() ?? getSystemTheme())

// Listen for system theme changes
let mql: MediaQueryList | null = null

export function useTheme() {
  onMounted(() => {
    applyTheme(current.value)
    mql = window.matchMedia('(prefers-color-scheme: light)')
    mql.addEventListener('change', () => {
      if (!getStoredTheme()) {
        current.value = getSystemTheme()
      }
    })
  })

  watch(current, (theme) => {
    applyTheme(theme)
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
  }, { immediate: true })

  function toggle() {
    current.value = current.value === 'dark' ? 'light' : 'dark'
  }

  return { theme: current, toggle }
}
