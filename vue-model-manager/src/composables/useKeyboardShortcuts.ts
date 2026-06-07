import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTheme } from './useTheme';

export function useKeyboardShortcuts() {
  const router = useRouter();
  const { toggle: toggleTheme } = useTheme();
  const shortcutsModalOpen = ref(false);

  function handleKeydown(e: KeyboardEvent) {
    // Don't trigger shortcuts when typing in inputs
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    // ? opens shortcuts modal
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      shortcutsModalOpen.value = !shortcutsModalOpen.value;
      return;
    }

    // Single-letter navigation shortcuts
    if (!e.ctrlKey && !e.metaKey) {
      switch (e.key) {
        case 'm': router.push('/'); break;
        case 'd': router.push('/dashboard'); break;
        case 'c': router.push('/creators'); break;
        case 'i': router.push('/issues'); break;
        case 'o': router.push('/compare'); break;
        case 'r': router.push('/rankings'); break;
        case 's': router.push('/supermodels'); break;
      }
    }

    // / focuses search
    if (e.key === '/' && !e.shiftKey) {
      e.preventDefault();
      const searchInput = document.querySelector('.jql-input') as HTMLInputElement | null;
      if (searchInput) searchInput.focus();
      return;
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
