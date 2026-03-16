<script setup lang="ts">
import { watch, onUnmounted } from 'vue';
import type { SnackbarConfig } from '../types/models';

interface Props {
  config: SnackbarConfig;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  dismiss: [];
}>();

let timeoutRef: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.config.message,
  (message) => {
    if (message) {
      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }
      timeoutRef = setTimeout(() => {
        emit('dismiss');
      }, 5000);
    }
  }
);

onUnmounted(() => {
  if (timeoutRef) {
    clearTimeout(timeoutRef);
    timeoutRef = null;
  }
});

function getIcon() {
  return props.config.type === 'error' ? '\u26A0' : '\u2139';
}
</script>

<template>
  <div v-if="config.message" :class="`snackbar snackbar-${config.type}`">
    <div class="snackbar-content">
      <span class="snackbar-icon">{{ getIcon() }}</span>
      <span class="snackbar-message">{{ config.message }}</span>
      <button class="snackbar-close" @click="emit('dismiss')" title="Dismiss">
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.snackbar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  animation: snackbar-slide-up 0.3s ease-out;
}

@keyframes snackbar-slide-up {
  from {
    transform: translateX(-50%) translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

.snackbar-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-width: 400px;
  min-width: 280px;
}

.snackbar-error .snackbar-content {
  background: #d32f2f;
  color: white;
}

.snackbar-info .snackbar-content {
  background: #1976d2;
  color: white;
}

.snackbar-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.snackbar-message {
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
}

.snackbar-close {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
  opacity: 0.8;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.snackbar-close:hover {
  opacity: 1;
}
</style>
