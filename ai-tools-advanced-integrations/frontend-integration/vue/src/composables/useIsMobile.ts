/**
 * IsMobile Composable
 *
 * Per-component composable (NOT singleton).
 * Tracks whether the viewport is mobile-sized.
 */

import { ref, onMounted, onUnmounted } from 'vue';

export function useIsMobile(breakpoint = 768) {
  const isMobile = ref(window.innerWidth <= breakpoint);

  function handleResize() {
    isMobile.value = window.innerWidth <= breakpoint;
  }

  onMounted(() => window.addEventListener('resize', handleResize));
  onUnmounted(() => window.removeEventListener('resize', handleResize));

  return isMobile;
}
