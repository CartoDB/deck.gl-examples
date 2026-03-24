/**
 * Chat UI Component
 *
 * Full chat interface with message rendering, markdown support,
 * streaming indicators, welcome chips, mobile bottom-sheet drag,
 * and clear-chat confirmation dialog.
 */

import { marked } from 'marked';
import { SEMANTIC_CONFIG, fetchSemanticConfig } from '../config/semantic-config.js';
import { environment } from '../config/environment.js';

export class ChatUI {
  constructor(container, { onSendMessage, onSidebarStateChange, onCloseSidebar, onClearChat, confirmationDialog }) {
    this._container = container;
    this._onSendMessage = onSendMessage;
    this._onSidebarStateChange = onSidebarStateChange;
    this._onCloseSidebar = onCloseSidebar;
    this._onClearChat = onClearChat;
    this._confirmationDialog = confirmationDialog;

    this._messages = [];
    this._loaderState = null;
    this._isConnected = false;
    this._isMobile = false;
    this._isSidebarOpen = false;
    this._sidebarState = 'closed';
    this._input = '';
    this._shouldAutoScroll = true;
    this._previousMessageCount = 0;
    this._lastMessageContentLength = 0;
    this._welcomeChips = SEMANTIC_CONFIG.welcomeChips;

    // Drag state
    this._isDragging = false;
    this._dragStartY = 0;
    this._dragStartState = 'half';
    this._dragThreshold = 50;

    // Bound handlers for document-level events
    this._boundTouchMove = this._handleDragMove.bind(this);
    this._boundTouchEnd = this._handleDragEnd.bind(this);
    this._boundMouseMove = this._handleDragMove.bind(this);
    this._boundMouseUp = (e) => {
      this._handleDragEnd(e);
      this._removeDocumentListeners();
    };

    // Configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    this._render();

    // Fetch semantic config from backend
    const backendUrl = environment.httpApiUrl.replace(/\/api\/chat$/, '');
    fetchSemanticConfig(backendUrl).then((config) => {
      this._welcomeChips = config.welcomeChips;
      this._renderMessages();
    });
  }

  // ==================== PUBLIC SETTERS ====================

  setConnected(isConnected) {
    this._isConnected = isConnected;
    this._updateConnectionStatus();
    this._updateSendButton();
    if (isConnected) this._updateWelcomeChips();
  }

  setMessages(messages) {
    this._messages = messages;
    const hasNewMessages = messages.length !== this._previousMessageCount;
    const lastMsg = messages[messages.length - 1];
    const contentChanged = lastMsg && (lastMsg.content?.length || 0) !== this._lastMessageContentLength;

    if (hasNewMessages || contentChanged) {
      this._previousMessageCount = messages.length;
      this._lastMessageContentLength = lastMsg?.content?.length || 0;
      this._checkScrollPosition();
      this._renderMessages();
      setTimeout(() => {
        if (this._shouldAutoScroll) this._scrollToBottom();
      }, 0);
    }
  }

  setLoaderState(loaderState) {
    const loaderAppeared = loaderState && !this._loaderState;
    this._loaderState = loaderState;
    this._renderLoader();
    if (loaderAppeared && this._shouldAutoScroll) {
      setTimeout(() => this._scrollToBottom(), 0);
    }
  }

  setSidebarState(state) {
    this._sidebarState = state;
    this._updateContainerClasses();
  }

  setMobile(isMobile) {
    this._isMobile = isMobile;
    this._render();
  }

  setSidebarOpen(isOpen) {
    this._isSidebarOpen = isOpen;
    this._updateContainerClasses();
  }

  // ==================== RENDERING ====================

  _render() {
    this._container.innerHTML = '';

    const chatContainer = document.createElement('div');
    chatContainer.className = 'chat-container';
    this._chatContainer = chatContainer;

    // Drag handle (mobile only)
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.style.display = this._isMobile ? '' : 'none';
    dragHandle.innerHTML = '<div class="drag-handle-bar"></div>';
    dragHandle.addEventListener('touchstart', (e) => this._handleDragStart(e), { passive: false });
    dragHandle.addEventListener('mousedown', (e) => this._handleDragStart(e));
    this._dragHandle = dragHandle;
    chatContainer.appendChild(dragHandle);

    // Collapsed bar (mobile)
    const collapsedBar = document.createElement('div');
    collapsedBar.className = 'chat-collapsed';
    collapsedBar.style.display = 'none';
    collapsedBar.innerHTML = `
      <h3 class="chat-title">Chat AI</h3>
      <span class="connection-status">●</span>`;
    collapsedBar.addEventListener('click', () => this._handleExpandFromCollapsed());
    this._collapsedBar = collapsedBar;
    chatContainer.appendChild(collapsedBar);

    // Chat content
    const chatContent = document.createElement('div');
    chatContent.className = 'chat-content';
    this._chatContent = chatContent;

    // Header
    const header = document.createElement('div');
    header.className = 'chat-header';
    header.innerHTML = `
      <h3 class="chat-title">Chat AI</h3>
      <div class="chat-header-right">
        <button class="clear-chat-button" aria-label="Clear chat" title="Clear chat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
        <span class="connection-status">●</span>
        <button class="close-sidebar-button" aria-label="Close sidebar" style="display:none">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>`;
    header.querySelector('.clear-chat-button').addEventListener('click', () => this._handleClearChat());
    header.querySelector('.close-sidebar-button').addEventListener('click', () => this._onCloseSidebar());
    this._headerRight = header.querySelector('.chat-header-right');
    this._closeSidebarBtn = header.querySelector('.close-sidebar-button');
    chatContent.appendChild(header);

    // Messages area
    const messagesArea = document.createElement('div');
    messagesArea.className = 'chat-messages';
    messagesArea.addEventListener('scroll', (e) => this._handleScroll(e));
    this._messagesArea = messagesArea;
    chatContent.appendChild(messagesArea);

    // Input area
    const inputContainer = document.createElement('div');
    inputContainer.className = 'chat-input-container';
    inputContainer.innerHTML = `
      <div class="chat-input-wrapper">
        <input type="text" class="chat-input" placeholder="Message AI Agent..." />
        <button class="send-button" disabled aria-label="Send message">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      </div>`;
    const inputEl = inputContainer.querySelector('.chat-input');
    const sendBtn = inputContainer.querySelector('.send-button');
    inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this._handleSend();
    });
    inputEl.addEventListener('input', (e) => {
      this._input = e.target.value;
      this._updateSendButton();
    });
    sendBtn.addEventListener('click', () => this._handleSend());
    this._inputEl = inputEl;
    this._sendBtn = sendBtn;
    chatContent.appendChild(inputContainer);

    chatContainer.appendChild(chatContent);
    this._container.appendChild(chatContainer);

    // Document-level touch listeners for drag
    document.addEventListener('touchmove', this._boundTouchMove, { passive: false });
    document.addEventListener('touchend', this._boundTouchEnd);

    // Initial state
    this._updateContainerClasses();
    this._renderMessages();
    this._renderLoader();
    this._updateConnectionStatus();
    this._updateSendButton();
  }

  _updateContainerClasses() {
    if (!this._chatContainer) return;
    const c = this._chatContainer;
    c.classList.toggle('mobile', this._isMobile);
    c.classList.toggle('desktop', !this._isMobile);
    c.classList.toggle('desktop-open', !this._isMobile && this._isSidebarOpen);
    c.classList.toggle('desktop-closed', !this._isMobile && !this._isSidebarOpen);
    c.classList.toggle('collapsed', this._isMobile && this._sidebarState === 'collapsed');
    c.classList.toggle('half', this._isMobile && this._sidebarState === 'half');
    c.classList.toggle('full', this._isMobile && this._sidebarState === 'full');

    // Drag handle visibility
    if (this._dragHandle) {
      this._dragHandle.style.display = this._isMobile ? '' : 'none';
    }

    // Collapsed bar
    if (this._collapsedBar) {
      this._collapsedBar.style.display =
        this._isMobile && this._sidebarState === 'collapsed' ? '' : 'none';
    }

    // Chat content visibility
    if (this._chatContent) {
      const showContent = !this._isMobile || (this._isMobile && this._sidebarState !== 'collapsed');
      this._chatContent.style.display = showContent ? '' : 'none';
      if (!this._isMobile) {
        this._chatContent.classList.toggle('desktop-hidden', !this._isSidebarOpen);
      } else {
        this._chatContent.classList.remove('desktop-hidden');
      }
    }

    // Close sidebar button
    if (this._closeSidebarBtn) {
      this._closeSidebarBtn.style.display =
        !this._isMobile && this._isSidebarOpen ? '' : 'none';
    }
  }

  _updateConnectionStatus() {
    const dots = this._container.querySelectorAll('.connection-status');
    dots.forEach((dot) => dot.classList.toggle('connected', this._isConnected));
  }

  _updateSendButton() {
    if (this._sendBtn) {
      this._sendBtn.disabled = !this._isConnected || !this._input.trim();
    }
  }

  _updateWelcomeChips() {
    const chipsContainer = this._messagesArea?.querySelector('.welcome-chips-container');
    if (chipsContainer) {
      chipsContainer.style.display = this._isConnected ? '' : 'none';
    }
  }

  _renderMessages() {
    if (!this._messagesArea) return;

    this._messagesArea.innerHTML = '';

    // Welcome section when no messages
    if (this._messages.length === 0) {
      const welcome = document.createElement('div');
      welcome.className = 'welcome-container';
      welcome.innerHTML = `
        <img src="icons/carto_ai.gif" alt="CARTO AI" class="welcome-gif" />
        <h2 class="welcome-title">Welcome to CARTO AI Chat</h2>
        <p class="welcome-description">
          Start a conversation with our AI agent to get insights, ask questions, or execute
          tasks related to your geospatial data.
        </p>
        <div class="welcome-chips-container" style="${this._isConnected ? '' : 'display:none'}">
          <p class="welcome-chips-label">Try asking:</p>
          <div class="welcome-chips"></div>
        </div>`;

      const chipsWrapper = welcome.querySelector('.welcome-chips');
      this._welcomeChips.forEach((chip) => {
        const btn = document.createElement('button');
        btn.className = 'welcome-chip';
        btn.textContent = chip.label;
        btn.addEventListener('click', () => this._handleWelcomeChipClick(chip));
        chipsWrapper.appendChild(btn);
      });

      this._messagesArea.appendChild(welcome);
    }

    // Render messages
    this._messages.forEach((msg) => {
      if (msg.type === 'user') {
        this._messagesArea.appendChild(this._createUserMessage(msg));
      } else {
        this._messagesArea.appendChild(this._createOtherMessage(msg));
      }
    });

    // Loader placeholder
    const loaderEl = document.createElement('div');
    loaderEl.className = 'tool-loader-container';
    this._loaderEl = loaderEl;
    this._messagesArea.appendChild(loaderEl);
    this._renderLoader();

    // Scroll anchor
    const anchor = document.createElement('div');
    anchor.className = 'messages-end';
    this._messagesArea.appendChild(anchor);
  }

  _createUserMessage(msg) {
    const wrapper = document.createElement('div');
    wrapper.className = 'user-message-wrapper';

    const bubble = document.createElement('div');
    bubble.className = `message user${msg.streaming ? ' streaming' : ''}`;
    bubble.textContent = msg.content;
    wrapper.appendChild(bubble);

    if (msg.timestamp) {
      const meta = document.createElement('div');
      meta.className = 'message-meta';
      meta.innerHTML = `
        <span class="message-timestamp">${this._getTimeAgo(msg.timestamp)}</span>
        <div class="user-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>`;
      wrapper.appendChild(meta);
    }

    return wrapper;
  }

  _createOtherMessage(msg) {
    const bubble = document.createElement('div');
    bubble.className = `message ${msg.type}${msg.streaming ? ' streaming' : ''}`;

    if (msg.type === 'tool' && msg.status === 'success') {
      bubble.innerHTML = `
        <div class="tool-success-message">
          <div class="tool-check-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
          </div>
          <span class="tool-message-text">${this._escapeHtml(msg.content)}</span>
        </div>`;
    } else if (msg.type === 'assistant') {
      bubble.innerHTML = marked.parse(msg.content || '');
    } else {
      bubble.textContent = msg.content;
    }

    if (msg.streaming) {
      const indicator = document.createElement('span');
      indicator.className = 'streaming-indicator';
      indicator.textContent = '.';
      bubble.appendChild(indicator);
    }

    return bubble;
  }

  _renderLoader() {
    if (!this._loaderEl) return;
    if (this._loaderState) {
      const text = this._loaderState === 'thinking' ? 'Thinking' : 'Executing tools';
      this._loaderEl.innerHTML = `
        <div class="tool-loader">
          <span class="tool-loader-text">${text}</span>
          <span class="tool-loader-dots">
            <span class="dot">.</span>
            <span class="dot">.</span>
            <span class="dot">.</span>
          </span>
        </div>`;
    } else {
      this._loaderEl.innerHTML = '';
    }
  }

  // ==================== SCROLL ====================

  _checkScrollPosition() {
    if (!this._messagesArea) return;
    const { scrollTop, scrollHeight, clientHeight } = this._messagesArea;
    this._shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 100;
  }

  _handleScroll() {
    this._checkScrollPosition();
  }

  _scrollToBottom() {
    if (this._messagesArea) {
      this._messagesArea.scrollTop = this._messagesArea.scrollHeight;
    }
  }

  // ==================== INPUT ====================

  _handleSend() {
    const text = this._input.trim();
    if (text && this._isConnected) {
      this._onSendMessage(text);
      this._input = '';
      if (this._inputEl) this._inputEl.value = '';
      this._shouldAutoScroll = true;
      this._lastMessageContentLength = 0;
      this._updateSendButton();
    }
  }

  _handleWelcomeChipClick(chip) {
    if (chip.prompt && this._isConnected) {
      this._shouldAutoScroll = true;
      this._lastMessageContentLength = 0;
      this._onSendMessage(chip.prompt);
      setTimeout(() => this._scrollToBottom(), 0);
    }
  }

  _handleClearChat() {
    this._confirmationDialog.show({
      title: 'Clear Chat',
      message: 'Are you sure you want to clear the chat history? This action cannot be undone.',
      confirmLabel: 'Clear',
      cancelLabel: 'Cancel',
      checkboxLabel: 'Also clear chat-generated layers and widgets',
      onConfirm: (checked) => {
        this._onClearChat(!!checked);
      },
      onCancel: () => {},
    });
  }

  _handleExpandFromCollapsed() {
    if (this._isMobile && this._sidebarState === 'collapsed') {
      this._onSidebarStateChange('half');
    }
  }

  // ==================== DRAG (MOBILE) ====================

  _handleDragStart(event) {
    if (!this._isMobile) return;
    this._isDragging = true;
    const mobileState =
      this._sidebarState === 'closed' || this._sidebarState === 'open'
        ? 'half'
        : this._sidebarState;
    this._dragStartState = mobileState;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    this._dragStartY = clientY;

    if (!event.touches) {
      document.addEventListener('mousemove', this._boundMouseMove);
      document.addEventListener('mouseup', this._boundMouseUp);
    }

    event.preventDefault();
    event.stopPropagation();
  }

  _handleDragMove(event) {
    if (!this._isDragging || !this._isMobile) return;
    event.preventDefault();
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    const deltaY = this._dragStartY - clientY;

    if (deltaY > this._dragThreshold) {
      if (this._dragStartState === 'collapsed' || this._dragStartState === 'half') {
        this._onSidebarStateChange('full');
      }
    } else if (deltaY < -this._dragThreshold) {
      if (this._dragStartState === 'full') {
        this._onSidebarStateChange('half');
      } else if (this._dragStartState === 'half') {
        this._onSidebarStateChange('collapsed');
      }
    }
  }

  _handleDragEnd(event) {
    if (!this._isDragging) return;
    this._isDragging = false;
    const clientY = event.changedTouches
      ? event.changedTouches[0]?.clientY ?? 0
      : event.clientY;
    const deltaY = this._dragStartY - clientY;

    if (Math.abs(deltaY) < this._dragThreshold) {
      this._onSidebarStateChange(this._dragStartState);
      return;
    }

    if (deltaY > this._dragThreshold) {
      if (this._dragStartState === 'collapsed' || this._dragStartState === 'half') {
        this._onSidebarStateChange('full');
      }
    } else if (deltaY < -this._dragThreshold) {
      if (this._dragStartState === 'full') {
        this._onSidebarStateChange('half');
      } else if (this._dragStartState === 'half') {
        this._onSidebarStateChange('collapsed');
      }
    }
  }

  _removeDocumentListeners() {
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);
  }

  // ==================== HELPERS ====================

  _getTimeAgo(timestamp) {
    if (!timestamp) return 'just now';
    const diff = Date.now() - timestamp;
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

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  destroy() {
    document.removeEventListener('touchmove', this._boundTouchMove);
    document.removeEventListener('touchend', this._boundTouchEnd);
    this._removeDocumentListeners();
  }
}
