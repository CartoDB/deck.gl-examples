<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

interface Props {
  visible: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  showCheckbox?: boolean;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Confirm',
  message: 'Are you sure?',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  showCheckbox: false,
  checkboxLabel: '',
  checkboxChecked: false,
});

const emit = defineEmits<{
  confirm: [];
  cancel: [];
  checkboxChange: [checked: boolean];
}>();

function handleKeyDown(event: KeyboardEvent) {
  if (!props.visible) return;

  if (event.key === 'Escape') {
    emit('cancel');
  } else if (event.key === 'Enter') {
    const target = event.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
      emit('confirm');
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown);
});

function handleBackdropClick(event: MouseEvent) {
  if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
    emit('cancel');
  }
}
</script>

<template>
  <div v-if="visible" class="dialog-backdrop" @click="handleBackdropClick">
    <div
      class="dialog-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-message"
    >
      <div class="dialog-header">
        <h3 id="dialog-title" class="dialog-title">
          {{ title }}
        </h3>
      </div>

      <div class="dialog-body">
        <p id="dialog-message" class="dialog-message">
          {{ message }}
        </p>
      </div>

      <div v-if="showCheckbox" class="dialog-checkbox">
        <label>
          <input
            type="checkbox"
            :checked="checkboxChecked"
            @change="emit('checkboxChange', ($event.target as HTMLInputElement).checked)"
          />
          {{ checkboxLabel }}
        </label>
      </div>

      <div class="dialog-actions">
        <button
          type="button"
          class="dialog-button dialog-button-cancel"
          @click="emit('cancel')"
          :aria-label="cancelText"
        >
          {{ cancelText }}
        </button>
        <button
          type="button"
          class="dialog-button dialog-button-confirm"
          @click="emit('confirm')"
          :aria-label="confirmText"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fade-in 0.2s ease-out;
  padding: 20px;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slide-up {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.dialog-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  max-width: 400px;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: slide-up 0.3s ease-out;
}

.dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}

.dialog-body {
  padding: 20px 24px;
  flex: 1;
  overflow-y: auto;
}

.dialog-message {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #475569;
}

.dialog-checkbox {
  padding: 0 24px 16px;
}

.dialog-checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #475569;
}

.dialog-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.dialog-actions {
  padding: 16px 24px;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}

.dialog-button {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
  min-width: 80px;
}

.dialog-button:active {
  transform: scale(0.98);
}

.dialog-button-cancel {
  background: #f1f5f9;
  color: #475569;
}

.dialog-button-cancel:hover {
  background: #e2e8f0;
}

.dialog-button-confirm {
  background: #3b82f6;
  color: white;
}

.dialog-button-confirm:hover {
  background: #2563eb;
}

.dialog-button-confirm:focus,
.dialog-button-cancel:focus {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* Responsive */
@media (max-width: 480px) {
  .dialog-container {
    max-width: 100%;
    margin: 20px;
  }

  .dialog-header,
  .dialog-body,
  .dialog-actions {
    padding-left: 16px;
    padding-right: 16px;
  }

  .dialog-actions {
    flex-direction: column-reverse;
  }

  .dialog-button {
    width: 100%;
  }
}
</style>
