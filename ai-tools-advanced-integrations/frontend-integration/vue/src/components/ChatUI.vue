<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { marked } from 'marked';
import type { Message, LoaderState } from '../types/models';
import { SEMANTIC_CONFIG, fetchSemanticConfig } from '../config/semantic-config';
import { environment } from '../config/environment';
import ConfirmationDialog from './ConfirmationDialog.vue';

interface Props {
  isConnected: boolean;
  messages: Message[];
  loaderState: LoaderState;
  sidebarState: 'closed' | 'open' | 'collapsed' | 'half' | 'full';
  isMobile: boolean;
  isSidebarOpen: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  sendMessage: [content: string];
  sidebarStateChange: [state: 'collapsed' | 'half' | 'full'];
  closeSidebar: [];
  clearChat: [clearLayers: boolean];
}>();

const input = ref('');
const showClearDialog = ref(false);
const clearLayersOnClear = ref(false);

const messagesContainerRef = ref<HTMLDivElement | null>(null);
const messagesEndRef = ref<HTMLDivElement | null>(null);
const shouldAutoScrollRef = ref(true);
const previousMessageCountRef = ref(0);
const lastMessageContentLengthRef = ref(0);

// Drag state
const isDraggingRef = ref(false);
const dragStartYRef = ref(0);
const dragStartStateRef = ref<'collapsed' | 'half' | 'full'>('half');
const dragThreshold = 50;

const welcomeChips = ref(SEMANTIC_CONFIG.welcomeChips);

// Fetch semantic config from backend on mount
onMounted(() => {
  const backendUrl = environment.httpApiUrl.replace(/\/api\/chat$/, '');
  fetchSemanticConfig(backendUrl).then((config) => {
    welcomeChips.value = config.welcomeChips;
  });
});

// Scroll to bottom
function scrollToBottom() {
  const container = messagesContainerRef.value;
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// Handle messages changes - auto-scroll
watch(
  () => props.messages,
  () => {
    const hasNewMessages = props.messages.length !== previousMessageCountRef.value;
    const lastMessage = props.messages[props.messages.length - 1];
    const contentChanged =
      lastMessage && (lastMessage.content?.length || 0) !== lastMessageContentLengthRef.value;

    if (hasNewMessages || contentChanged) {
      previousMessageCountRef.value = props.messages.length;
      lastMessageContentLengthRef.value = lastMessage?.content?.length || 0;

      // Check current scroll position
      const container = messagesContainerRef.value;
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        shouldAutoScrollRef.value = isNearBottom;
      }

      if (shouldAutoScrollRef.value) {
        nextTick(() => scrollToBottom());
      }
    }
  },
  { deep: true }
);

// Scroll on loader state change
watch(
  () => props.loaderState,
  () => {
    if (props.loaderState && shouldAutoScrollRef.value) {
      nextTick(() => scrollToBottom());
    }
  }
);

function handleScroll() {
  const container = messagesContainerRef.value;
  if (!container) return;
  const { scrollTop, scrollHeight, clientHeight } = container;
  const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
  shouldAutoScrollRef.value = isNearBottom;
}

function handleSend() {
  if (input.value.trim() && props.isConnected) {
    emit('sendMessage', input.value.trim());
    input.value = '';
    shouldAutoScrollRef.value = true;
    lastMessageContentLengthRef.value = 0;
  }
}

function handleKeyPress(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    handleSend();
  }
}

function handleWelcomeChipClick(chip: { id: string; label: string; prompt: string }) {
  if (chip.prompt && props.isConnected) {
    shouldAutoScrollRef.value = true;
    lastMessageContentLengthRef.value = 0;
    emit('sendMessage', chip.prompt);
    nextTick(() => scrollToBottom());
  }
}

// Drag handling for mobile
function handleDragStart(event: TouchEvent | MouseEvent) {
  if (!props.isMobile) return;

  isDraggingRef.value = true;
  const mobileState =
    props.sidebarState === 'closed' || props.sidebarState === 'open'
      ? 'half'
      : (props.sidebarState as 'collapsed' | 'half' | 'full');
  dragStartStateRef.value = mobileState;

  const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
  dragStartYRef.value = clientY;

  event.preventDefault();
  event.stopPropagation();
}

function handleDocumentTouchMove(event: TouchEvent) {
  if (!isDraggingRef.value || !props.isMobile) return;
  event.preventDefault();
  const clientY = event.touches[0].clientY;
  const deltaY = dragStartYRef.value - clientY;

  if (deltaY > dragThreshold) {
    if (dragStartStateRef.value === 'collapsed' || dragStartStateRef.value === 'half') {
      emit('sidebarStateChange', 'full');
    }
  } else if (deltaY < -dragThreshold) {
    if (dragStartStateRef.value === 'full') {
      emit('sidebarStateChange', 'half');
    } else if (dragStartStateRef.value === 'half') {
      emit('sidebarStateChange', 'collapsed');
    }
  }
}

function handleDocumentTouchEnd(event: TouchEvent) {
  if (!isDraggingRef.value) return;
  isDraggingRef.value = false;

  const clientY = event.changedTouches?.[0]?.clientY ?? 0;
  const deltaY = dragStartYRef.value - clientY;

  if (Math.abs(deltaY) < dragThreshold) {
    emit('sidebarStateChange', dragStartStateRef.value);
    return;
  }

  if (deltaY > dragThreshold) {
    if (dragStartStateRef.value === 'collapsed' || dragStartStateRef.value === 'half') {
      emit('sidebarStateChange', 'full');
    }
  } else if (deltaY < -dragThreshold) {
    if (dragStartStateRef.value === 'full') {
      emit('sidebarStateChange', 'half');
    } else if (dragStartStateRef.value === 'half') {
      emit('sidebarStateChange', 'collapsed');
    }
  }
}

function handleDocumentMouseMove(event: MouseEvent) {
  if (!isDraggingRef.value || !props.isMobile) return;
  event.preventDefault();
  const clientY = event.clientY;
  const deltaY = dragStartYRef.value - clientY;

  if (deltaY > dragThreshold) {
    if (dragStartStateRef.value === 'collapsed' || dragStartStateRef.value === 'half') {
      emit('sidebarStateChange', 'full');
    }
  } else if (deltaY < -dragThreshold) {
    if (dragStartStateRef.value === 'full') {
      emit('sidebarStateChange', 'half');
    } else if (dragStartStateRef.value === 'half') {
      emit('sidebarStateChange', 'collapsed');
    }
  }
}

function handleDocumentMouseUp() {
  if (!isDraggingRef.value) return;
  isDraggingRef.value = false;
}

onMounted(() => {
  document.addEventListener('touchmove', handleDocumentTouchMove, { passive: false });
  document.addEventListener('touchend', handleDocumentTouchEnd);
  document.addEventListener('mousemove', handleDocumentMouseMove);
  document.addEventListener('mouseup', handleDocumentMouseUp);
});

onUnmounted(() => {
  document.removeEventListener('touchmove', handleDocumentTouchMove);
  document.removeEventListener('touchend', handleDocumentTouchEnd);
  document.removeEventListener('mousemove', handleDocumentMouseMove);
  document.removeEventListener('mouseup', handleDocumentMouseUp);
});

function handleExpandFromCollapsed() {
  if (props.isMobile && props.sidebarState === 'collapsed') {
    emit('sidebarStateChange', 'half');
  }
}

function getTimeAgo(timestamp: number): string {
  if (!timestamp) return 'just now';
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  if (minutes > 0) return `${minutes} min. ago`;
  if (seconds > 0) return `${seconds} sec. ago`;
  return 'just now';
}

function getMessageStyle(msg: Message): Record<string, string> {
  const base = {
    padding: '10px',
    borderRadius: '8px',
    maxWidth: '100%',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    marginBottom: '10px',
  };

  switch (msg.type) {
    case 'user':
      return { ...base, alignSelf: 'flex-start', background: '#f3f4f6', color: '#1e293b', fontSize: '13px' };
    case 'assistant':
      return { ...base, alignSelf: 'flex-start', background: '#EDFBF5', color: '#2C3032', border: '1px solid #2C30321F', fontSize: '13px' };
    case 'action':
      return { ...base, alignSelf: 'flex-start', fontFamily: 'monospace', background: '#EDFBF5', color: '#2C3032', border: '1px solid #2C30321F', fontSize: '13px' };
    case 'tool':
      return { ...base, alignSelf: 'flex-start', background: '#EDFBF5', color: '#2C3032', border: '1px solid #2C30321F', fontSize: '13px' };
    case 'error':
      return { ...base, alignSelf: 'flex-start', background: '#ef4444', color: 'white' };
    case 'system':
      return { ...base, alignSelf: 'center', background: '#f1f5f9', color: '#64748b', fontSize: '12px', fontStyle: 'italic' };
    default:
      return { ...base, alignSelf: 'flex-start', background: '#EDFBF5', color: '#2C3032', border: '1px solid #2C30321F', fontSize: '13px' };
  }
}

function getMessageClasses(msg: Message): string {
  const classes = ['message', msg.type];
  if (msg.streaming) classes.push('streaming');
  return classes.join(' ');
}

function renderMarkdown(content: string): string {
  try {
    return marked.parse(content, { async: false }) as string;
  } catch {
    return content;
  }
}

// Build container classes
const containerClasses = computed(() => {
  return [
    'chat-container',
    props.isMobile ? 'mobile' : 'desktop',
    !props.isMobile && props.isSidebarOpen ? 'desktop-open' : '',
    !props.isMobile && !props.isSidebarOpen ? 'desktop-closed' : '',
    props.isMobile && props.sidebarState === 'collapsed' ? 'collapsed' : '',
    props.isMobile && props.sidebarState === 'half' ? 'half' : '',
    props.isMobile && props.sidebarState === 'full' ? 'full' : '',
  ]
    .filter(Boolean)
    .join(' ');
});
</script>

<template>
  <div :class="containerClasses">
    <!-- Drag Handle - mobile only -->
    <div
      v-if="isMobile"
      class="drag-handle"
      @touchstart="handleDragStart"
      @mousedown="handleDragStart"
    >
      <div class="drag-handle-bar" />
    </div>

    <!-- Collapsed State -->
    <div
      v-if="isMobile && sidebarState === 'collapsed'"
      class="chat-collapsed"
      @click="handleExpandFromCollapsed"
    >
      <h3 class="chat-title">Chat AI</h3>
      <span :class="{ 'connection-status': true, connected: isConnected }">
        ●
      </span>
    </div>

    <!-- Full Chat UI -->
    <div
      v-if="!isMobile || (isMobile && sidebarState !== 'collapsed')"
      :class="{ 'chat-content': true, 'desktop-hidden': !isMobile && !isSidebarOpen }"
    >
      <div class="chat-header">
        <h3 class="chat-title">Chat AI</h3>
        <div class="chat-header-right">
          <button
            class="clear-chat-button"
            @click="showClearDialog = true"
            aria-label="Clear chat"
            title="Clear chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          <span :class="{ 'connection-status': true, connected: isConnected }">
            ●
          </span>
          <button
            v-if="!isMobile && isSidebarOpen"
            class="close-sidebar-button"
            @click="emit('closeSidebar')"
            aria-label="Close sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div
        class="chat-messages"
        ref="messagesContainerRef"
        @scroll="handleScroll"
      >
        <!-- Welcome section -->
        <div v-if="messages.length === 0" class="welcome-container">
          <img src="/icons/carto_ai.gif" alt="CARTO AI" class="welcome-gif" />
          <h2 class="welcome-title">Welcome to CARTO AI Chat</h2>
          <p class="welcome-description">
            Start a conversation with our AI agent to get insights, ask questions, or
            execute tasks related to your geospatial data.
          </p>
          <div v-if="isConnected" class="welcome-chips-container">
            <p class="welcome-chips-label">Try asking:</p>
            <div class="welcome-chips">
              <button
                v-for="chip in welcomeChips"
                :key="chip.id"
                class="welcome-chip"
                @click="handleWelcomeChipClick(chip)"
              >
                {{ chip.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <template v-for="(msg, index) in messages" :key="msg.id || msg.messageId || `msg-${index}`">
          <!-- User Message -->
          <div v-if="msg.type === 'user'" class="user-message-wrapper">
            <div :class="getMessageClasses(msg)" :style="getMessageStyle(msg)">
              {{ msg.content }}
            </div>
            <div v-if="msg.timestamp" class="message-meta">
              <span class="message-timestamp">{{ getTimeAgo(msg.timestamp) }}</span>
              <div class="user-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Other Messages -->
          <div v-else :class="getMessageClasses(msg)" :style="getMessageStyle(msg)">
            <!-- Tool success message -->
            <div v-if="msg.type === 'tool' && msg.status === 'success'" class="tool-success-message">
              <div class="tool-check-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              </div>
              <span class="tool-message-text">{{ msg.content }}</span>
            </div>
            <!-- Assistant message with markdown -->
            <div v-else-if="msg.type === 'assistant'" v-html="renderMarkdown(msg.content)" />
            <!-- Other messages -->
            <template v-else>{{ msg.content }}</template>
            <span v-if="msg.streaming" class="streaming-indicator">.</span>
          </div>
        </template>

        <!-- Loader -->
        <div v-if="loaderState" class="tool-loader">
          <span class="tool-loader-text">
            {{ loaderState === 'thinking' ? 'Thinking' : 'Executing tools' }}
          </span>
          <span class="tool-loader-dots">
            <span class="dot">.</span>
            <span class="dot">.</span>
            <span class="dot">.</span>
          </span>
        </div>

        <div ref="messagesEndRef" />
      </div>

      <div class="chat-input-container">
        <div class="chat-input-wrapper">
          <input
            type="text"
            class="chat-input"
            v-model="input"
            @keydown="handleKeyPress"
            placeholder="Message AI Agent..."
          />
          <button
            class="send-button"
            @click="handleSend"
            :disabled="!isConnected || !input.trim()"
            aria-label="Send message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Confirmation Dialog -->
    <ConfirmationDialog
      :visible="showClearDialog"
      title="Clear Chat"
      message="Are you sure you want to clear the chat history? This action cannot be undone."
      confirmText="Clear"
      cancelText="Cancel"
      :showCheckbox="true"
      checkboxLabel="Also clear chat-generated layers and widgets"
      :checkboxChecked="clearLayersOnClear"
      @checkboxChange="clearLayersOnClear = $event"
      @confirm="
        emit('clearChat', clearLayersOnClear);
        showClearDialog = false;
        clearLayersOnClear = false;
      "
      @cancel="
        showClearDialog = false;
        clearLayersOnClear = false;
      "
    />
  </div>
</template>

<style scoped>
/* Chat Container - uses flexbox to push input to bottom */
.chat-container {
  width: 100%;
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #ddd;
  background: white;
  overflow: hidden;
  position: relative;
  transition:
    transform 0.3s ease-out,
    height 0.3s ease-out;
}

.chat-container.desktop {
  border-left: 1px solid #ddd;
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
  min-width: 450px;
  width: 450px;
}

.chat-content.desktop-hidden {
  opacity: 0;
  pointer-events: none;
}

.chat-content:not(.desktop-hidden) {
  opacity: 1;
  pointer-events: auto;
  transition: opacity 0.3s ease-in-out;
}

/* Drag Handle - visible on mobile only */
.drag-handle {
  display: none;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  background: white;
  border-bottom: 1px solid #ddd;
  cursor: grab;
  z-index: 10;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle-bar {
  width: 40px;
  height: 4px;
  background: #cbd5e1;
  border-radius: 2px;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* Chat Content Wrapper */
.chat-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  flex: 1;
  min-height: 0;
}

/* Collapsed State - minimized bar */
.chat-collapsed {
  padding: 12px 15px;
  background: white;
  border-top: 1px solid #ddd;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.chat-collapsed .chat-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.chat-collapsed .connection-status {
  font-size: 12px;
  color: #ef4444;
}

.chat-collapsed .connection-status.connected {
  color: #22c55e;
}

/* Header */
.chat-header {
  padding: 10px;
  border-bottom: 1px solid #ddd;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  background: white;
  position: relative;
  z-index: 1;
}

.chat-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.chat-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.connection-status {
  font-size: 12px;
  color: #ef4444;
}

.connection-status.connected {
  color: #22c55e;
}

.clear-chat-button {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  border-radius: 4px;
  transition:
    background-color 0.2s,
    color 0.2s;
}

.clear-chat-button:hover {
  background-color: #f1f5f9;
  color: #ef4444;
}

.clear-chat-button svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
}

.close-sidebar-button {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  border-radius: 4px;
  transition:
    background-color 0.2s,
    color 0.2s;
}

.close-sidebar-button:hover {
  background-color: #f1f5f9;
  color: #1e293b;
}

.close-sidebar-button svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
}

/* Messages area - takes remaining space */
.chat-messages {
  flex: 1 1 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 15px 15px 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
  position: relative;
  font-size: 14px;
}

/* Input container - fixed at bottom */
.chat-input-container {
  padding: 15px;
  border-top: 1px solid #ddd;
  display: flex;
  flex-shrink: 0;
  background: white;
}

.chat-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.chat-input {
  flex: 1;
  padding: 12px 50px 12px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: #f3f4f6;
  color: #1e293b;
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.chat-input:focus {
  border-color: #3b82f6;
  background: white;
}

.chat-input::placeholder {
  color: #94a3b8;
}

.send-button {
  position: absolute;
  right: 6px;
  width: 32px;
  height: 32px;
  padding: 0;
  background: #e2e8f0;
  color: #94a3b8;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.2s,
    color 0.2s;
  flex-shrink: 0;
}

.send-button:hover:not(:disabled) {
  background: #3b82f6;
  color: white;
}

.send-button:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
  opacity: 0.6;
}

.send-button:not(:disabled) {
  background: #3b82f6;
  color: white;
}

.send-button svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
}

/* Messages */
.message {
  padding: 10px;
  border-radius: 8px;
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.5;
}

/* Markdown Styles */
.message :deep(h3) {
  margin: 0 0 16px 0;
  line-height: 1.4;
}

.message :deep(p) {
  margin: 0 0 16px 0;
  line-height: 1.4;
}

.message :deep(p:last-child) {
  margin-bottom: 0;
}

.message :deep(strong) {
  font-weight: 600;
  color: #1e293b;
}

/* Markdown Lists */
.message :deep(ul) {
  list-style: none;
  padding-left: 0;
  margin: 4px 0;
}

.message :deep(ul:first-child) {
  margin-top: 0;
}

.message :deep(ul:last-child) {
  margin-bottom: 0;
}

.message :deep(ul + ul),
.message :deep(ul + p) {
  margin-top: 2px;
}

.message :deep(li) {
  position: relative;
  margin: 0;
  padding-left: 24px;
  line-height: 1.1;
  display: list-item;
}

.message :deep(ul li::before) {
  content: '\2022';
  position: absolute;
  left: 8px;
  color: #1e293b;
  font-size: 14px;
  line-height: 1.1;
  font-weight: normal;
}

.message :deep(ul li p) {
  margin: 0;
  display: inline;
  line-height: 1.4;
}

.message :deep(ul li strong) {
  font-weight: 600;
}

/* Markdown Ordered Lists */
.message :deep(ol) {
  list-style: decimal;
  padding-left: 24px;
  margin: 4px 0;
}

.message :deep(ol:first-child) {
  margin-top: 0;
}

.message :deep(ol:last-child) {
  margin-bottom: 0;
}

.message :deep(ol + ol),
.message :deep(ol + p) {
  margin-top: 2px;
}

.message :deep(ol li) {
  margin: 0;
  padding-left: 18px;
  line-height: 1.1;
  display: list-item;
}

.message :deep(ol li p) {
  margin: 0;
  display: inline;
  line-height: 1.1;
}

.message :deep(ol li strong) {
  font-weight: 600;
}

/* User Message Wrapper */
.user-message-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  align-self: flex-end;
  max-width: 80%;
  gap: 4px;
}

.message.user {
  align-self: flex-start;
  background: #f3f4f6;
  color: #1e293b;
  font-size: 14px;
  margin: 0;
  border: 1px solid #d1d5db;
  position: relative;
}

.message.user::after {
  content: '';
  position: absolute;
  bottom: -8px;
  right: 12px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid #f3f4f6;
}

.message.user::before {
  content: '';
  position: absolute;
  bottom: -9px;
  right: 12px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid #d1d5db;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
  padding-right: 12px;
  margin-top: 2px;
}

.message-timestamp {
  font-size: 12px;
  color: #64748b;
}

.user-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  flex-shrink: 0;
}

.user-icon svg {
  width: 16px;
  height: 16px;
}

.message.assistant {
  align-self: flex-start;
  background: #f3f4f6;
  color: #111;
  font-size: 14px;
}

.message.action {
  align-self: flex-start;
  background: #10b981;
  color: white;
  font-family: monospace;
  font-size: 13px;
}

/* Tool Success Message */
.tool-success-message {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-check-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #10b981;
}

.tool-check-icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
}

.tool-message-text {
  flex: 1;
  color: #2c3032;
  font-size: 13px;
}

.message.error {
  align-self: flex-start;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #991b1b;
  border-radius: 12px;
  padding: 12px 16px;
}

.message.system {
  align-self: center;
  background: #f1f5f9;
  color: #64748b;
  font-size: 13px;
  font-style: italic;
}

.streaming-indicator {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.tool-loader {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 10px;
  color: #6b7280;
  font-size: 13px;
}

.tool-loader-text {
  color: #6b7280;
}

.tool-loader-dots {
  display: inline-flex;
}

.tool-loader-dots .dot {
  animation: tool-loader-bounce 1.4s infinite ease-in-out both;
  font-weight: bold;
}

.tool-loader-dots .dot:nth-child(1) {
  animation-delay: 0s;
}

.tool-loader-dots .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.tool-loader-dots .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes tool-loader-bounce {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

/* Welcome Section */
.welcome-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  height: 100%;
  padding: 2rem;
}

.welcome-gif {
  width: 64px;
  height: auto;
  margin-bottom: 1rem;
}

.welcome-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
  text-align: center;
}

.welcome-description {
  margin-top: 1rem;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
  color: #64748b;
  text-align: center;
}

/* Welcome Suggestion Chips */
.welcome-chips-container {
  margin-top: 1rem;
  width: auto;
  text-align: center;
}

.welcome-chips-label {
  font-size: 0.875rem;
  color: #64748b;
  margin-bottom: 0.75rem;
}

.welcome-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.welcome-chip {
  padding: 8px 16px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s ease;
}

.welcome-chip:hover {
  background: #e0f2fe;
  border-color: #7dd3fc;
  color: #0369a1;
}

/* Mobile Responsive Styles */
@media (max-width: 768px) {
  .chat-container.mobile {
    width: 100%;
    height: 50vh;
    border-left: none;
    border-top: 1px solid #ddd;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.15);
    position: relative;
  }

  .chat-container.mobile .drag-handle {
    display: block;
  }

  .chat-container.mobile.half {
    height: 50vh;
    transform: translateY(0);
  }

  .chat-container.mobile.full {
    height: calc(100vh - 56px);
    transform: translateY(0);
  }

  .chat-container.mobile.collapsed {
    height: auto;
    min-height: 0;
  }

  .chat-container.mobile.collapsed .chat-content {
    display: none;
  }

  .chat-container.mobile.collapsed .chat-collapsed {
    display: flex;
  }

  .chat-container.mobile:not(.collapsed) .chat-collapsed {
    display: none;
  }

  .chat-container.mobile .chat-content {
    height: 100%;
    padding-top: 40px;
    box-sizing: border-box;
  }

  .chat-container.mobile .chat-header {
    border-top: none;
  }
}
</style>
