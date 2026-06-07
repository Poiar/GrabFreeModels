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

    // Navigation shortcuts (vim-style g + key)
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
      const G_TIMEOUT = 500;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const handler = (nextE: KeyboardEvent) => {
        cleanup();
        switch (nextE.key) {
          case 'd':
            router.push('/');
            break;
          case 'a':
            router.push('/all');
            break;
          case 'f':
            router.push('/free');
            break;
          case 'p':
            router.push('/');
            break;
          case 's':
            router.push('/models');
            break;
          case 'i':
            router.push('/issues');
            break;
          case 'u':
            router.push('/author');
            break;
          case 'm':
            router.push('/family');
            break;
        }
      };

      function cleanup() {
        window.removeEventListener('keydown', handler);
        if (timeoutId !== null) clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(cleanup, G_TIMEOUT);
      window.addEventListener('keydown', handler);
      return;
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
