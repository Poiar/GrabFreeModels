import { ref, onMounted, onUnmounted } from 'vue';

export function useBreakpoint() {
  const isMobile = ref(false);
  const isTablet = ref(false);
  const isDesktop = ref(true);
  const isPortrait = ref(true);

  function check() {
    const w = window.innerWidth;
    isMobile.value = w < 640;
    isTablet.value = w >= 640 && w < 1024;
    isDesktop.value = w >= 1024;
    isPortrait.value = window.matchMedia('(orientation: portrait)').matches;
  }

  onMounted(() => {
    check();
    window.addEventListener('resize', check, { passive: true });
    window.addEventListener('orientationchange', check);
    window.matchMedia('(orientation: portrait)').addEventListener('change', check);
  });

  onUnmounted(() => {
    window.removeEventListener('resize', check);
    window.removeEventListener('orientationchange', check);
    window.matchMedia('(orientation: portrait)').removeEventListener('change', check);
  });

  return { isMobile, isTablet, isDesktop, isPortrait };
}
