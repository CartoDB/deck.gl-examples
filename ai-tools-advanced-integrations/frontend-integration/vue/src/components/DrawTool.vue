<script setup lang="ts">
import { computed } from 'vue';
import { useMaskLayer } from '../composables/useMaskLayer';

const maskLayer = useMaskLayer();

const hasMask = computed(() => maskLayer.isMaskActive.value);
const isDrawing = computed(() => maskLayer.state.isDrawing);
const currentMode = computed(() => maskLayer.state.currentMode);

function toggleDraw() {
  if (isDrawing.value) {
    maskLayer.disableDrawMode();
  } else {
    maskLayer.enableDrawMode();
  }
}

function setMode(mode: string) {
  maskLayer.setDrawMode(mode);
}

function clearMask() {
  maskLayer.clearMask();
}
</script>

<template>
  <div class="draw-tool-container">
    <button
      :class="['draw-tool-btn', { active: isDrawing }]"
      @click="toggleDraw"
      title="Draw mask polygon"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
      </svg>
    </button>

    <div v-if="isDrawing" class="draw-tool-modes">
      <button
        :class="['mode-btn', { active: currentMode === 'draw' }]"
        @click="setMode('draw')"
        title="Draw polygon"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        </svg>
      </button>
      <button
        :class="['mode-btn', { active: currentMode === 'edit' }]"
        @click="setMode('edit')"
        title="Edit polygon"
        :disabled="!hasMask"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      </button>
    </div>

    <button
      v-if="hasMask"
      class="draw-tool-btn clear-btn"
      @click="clearMask"
      title="Clear mask"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.draw-tool-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: white;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.draw-tool-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #475569;
  transition: background-color 0.15s, color 0.15s;
}

.draw-tool-btn:hover {
  background: #f1f5f9;
}

.draw-tool-btn.active {
  background: #3b82f6;
  color: white;
}

.draw-tool-btn.clear-btn {
  color: #ef4444;
}

.draw-tool-btn.clear-btn:hover {
  background: #fef2f2;
}

.draw-tool-modes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-top: 1px solid #e2e8f0;
  padding-top: 4px;
}

.mode-btn {
  width: 36px;
  height: 28px;
  border: none;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #475569;
  transition: background-color 0.15s, color 0.15s;
}

.mode-btn:hover:not(:disabled) {
  background: #f1f5f9;
}

.mode-btn.active {
  background: #dbeafe;
  color: #3b82f6;
}

.mode-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
