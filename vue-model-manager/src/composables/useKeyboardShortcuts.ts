import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTheme } from './useTheme';

const NAV_KEYS: Record<string, string> = {
  '1': '/dashboard',
  '2': '/supermodels',
  '3': '/providers',
  '4': '/rankings',
  '5': '/creators',
  '6': '/compare',
  '7': '/benchmarks',
  '8': '/families',
  '9': '/advanced-search',
  '0': '/',
};

export function useKeyboardShortcuts() {
  const router = useRouter();
  const { toggle: toggleTheme } = useTheme();
  const shortcutsModalOpen = ref(false);

  function handleKeydown(e: KeyboardEvent) {
    // Don't trigger shortcuts when typing in inputs
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    // Ctrl+E = export current view as JSON
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      // Dispatch custom event that views can listen to
      window.dispatchEvent(new CustomEvent('export-request', { detail: { format: 'json' } }));
      return;
    }

    // ? opens shortcuts modal
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      shortcutsModalOpen.value = !shortcutsModalOpen.value;
      return;
    }

    // Number keys for tab navigation
    if (!e.ctrlKey && !e.metaKey && !e.altKey && NAV_KEYS[e.key]) {
      e.preventDefault();
      router.push(NAV_KEYS[e.key]);
      return;
    }

    // Single-letter navigation shortcuts
    if (!e.ctrlKey && !e.metaKey) {
      switch (e.key) {
        case 'm':
          router.push('/');
          break;
        case 'd':
          router.push('/dashboard');
          break;
        case 'c':
          router.push('/creators');
          break;
        case 'o':
          router.push('/compare');
          break;
        case 'r':
          router.push('/rankings');
          break;
        case 's':
          router.push('/supermodels');
          break;
        case 'b':
          router.push('/benchmarks');
          break;
        case 'p':
          router.push('/playground');
          break;
        case 'g':
          router.push('/tags');
          break;
        case 'l':
          router.push('/lineage');
          break;
        case 'v':
          router.push('/activity');
          break;
        case 'k':
          router.push('/picker');
          break;
        case 'x':
          router.push('/scores');
          break;
        case 'q':
          router.push('/rate-limits');
          break;
        case 'n':
          router.push('/providers/onboarding');
          break;
      }
    }

    // / focuses search
    if (e.key === '/' && !e.shiftKey) {
      e.preventDefault();
      const searchInput = document.querySelector(
        '.jql-input, .dash-search-input, .search-input',
      ) as HTMLInputElement | null;
      if (searchInput) searchInput.focus();
      return;
    }

    // Esc closes modals/panels (global fallback)
    if (e.key === 'Escape') {
      // Custom event for detail panels to close
      window.dispatchEvent(new CustomEvent('escape-pressed'));
    }

    // t toggles theme
    if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
      toggleTheme();
      return;
    }
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown));
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

  return {
    shortcutsModalOpen,
    close: () => {
      shortcutsModalOpen.value = false;
    },
  };
}
