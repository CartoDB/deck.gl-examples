import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type TouchEvent as ReactTouchEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { marked } from 'marked';
import type { Message, LoaderState } from '../types/models';
import { SEMANTIC_CONFIG, fetchSemanticConfig } from '../config/semantic-config';
import { environment } from '../config/environment';
import { ConfirmationDialog } from './ConfirmationDialog';
import './ChatUI.css';

interface ChatUIProps {
  isConnected: boolean;
  messages: Message[];
  loaderState: LoaderState;
  sidebarState: 'closed' | 'open' | 'collapsed' | 'half' | 'full';
  isMobile: boolean;
  isSidebarOpen: boolean;
  onSendMessage: (content: string) => void;
  onSidebarStateChange: (state: 'collapsed' | 'half' | 'full') => void;
  onCloseSidebar: () => void;
  onClearChat: (clearLayers: boolean) => void;
}

export function ChatUI({
  isConnected,
  messages,
  loaderState,
  sidebarState,
  isMobile,
  isSidebarOpen,
  onSendMessage,
  onSidebarStateChange,
  onCloseSidebar,
  onClearChat,
}: ChatUIProps) {
  const [input, setInput] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearLayersOnClear, setClearLayersOnClear] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const lastMessageContentLengthRef = useRef(0);

  // Drag state
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartStateRef = useRef<'collapsed' | 'half' | 'full'>('half');
  const dragThreshold = 50;

  const [welcomeChips, setWelcomeChips] = useState(SEMANTIC_CONFIG.welcomeChips);

  // Fetch semantic config from backend on mount
  useEffect(() => {
    const backendUrl = environment.httpApiUrl.replace(/\/api\/chat$/, '');
    fetchSemanticConfig(backendUrl).then((config) => {
      setWelcomeChips(config.welcomeChips);
    });
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // Handle messages changes - auto-scroll
  useEffect(() => {
    const hasNewMessages = messages.length !== previousMessageCountRef.current;
    const lastMessage = messages[messages.length - 1];
    const contentChanged =
      lastMessage && (lastMessage.content?.length || 0) !== lastMessageContentLengthRef.current;

    if (hasNewMessages || contentChanged) {
      previousMessageCountRef.current = messages.length;
      lastMessageContentLengthRef.current = lastMessage?.content?.length || 0;

      // Check current scroll position
      const container = messagesContainerRef.current;
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        shouldAutoScrollRef.current = isNearBottom;
      }

      if (shouldAutoScrollRef.current) {
        setTimeout(scrollToBottom, 0);
      }
    }
  }, [messages, scrollToBottom]);

  // Scroll on loader state change
  useEffect(() => {
    if (loaderState && shouldAutoScrollRef.current) {
      setTimeout(scrollToBottom, 0);
    }
  }, [loaderState, scrollToBottom]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    shouldAutoScrollRef.current = isNearBottom;
  };

  const handleSend = () => {
    if (input.trim() && isConnected) {
      onSendMessage(input.trim());
      setInput('');
      shouldAutoScrollRef.current = true;
      lastMessageContentLengthRef.current = 0;
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSend();
    }
  };

  const handleWelcomeChipClick = (chip: { id: string; label: string; prompt: string }) => {
    if (chip.prompt && isConnected) {
      shouldAutoScrollRef.current = true;
      lastMessageContentLengthRef.current = 0;
      onSendMessage(chip.prompt);
      setTimeout(scrollToBottom, 0);
    }
  };

  // Drag handling for mobile
  const handleDragStart = (event: ReactTouchEvent | ReactMouseEvent) => {
    if (!isMobile) return;

    isDraggingRef.current = true;
    const mobileState =
      sidebarState === 'closed' || sidebarState === 'open' ? 'half' : (sidebarState as 'collapsed' | 'half' | 'full');
    dragStartStateRef.current = mobileState;

    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    dragStartYRef.current = clientY;

    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    const handleDocumentTouchMove = (event: globalThis.TouchEvent) => {
      if (!isDraggingRef.current || !isMobile) return;
      event.preventDefault();
      const clientY = event.touches[0].clientY;
      const deltaY = dragStartYRef.current - clientY;

      if (deltaY > dragThreshold) {
        if (dragStartStateRef.current === 'collapsed' || dragStartStateRef.current === 'half') {
          onSidebarStateChange('full');
        }
      } else if (deltaY < -dragThreshold) {
        if (dragStartStateRef.current === 'full') {
          onSidebarStateChange('half');
        } else if (dragStartStateRef.current === 'half') {
          onSidebarStateChange('collapsed');
        }
      }
    };

    const handleDocumentTouchEnd = (event: globalThis.TouchEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      const clientY = event.changedTouches?.[0]?.clientY ?? 0;
      const deltaY = dragStartYRef.current - clientY;

      if (Math.abs(deltaY) < dragThreshold) {
        onSidebarStateChange(dragStartStateRef.current);
        return;
      }

      if (deltaY > dragThreshold) {
        if (dragStartStateRef.current === 'collapsed' || dragStartStateRef.current === 'half') {
          onSidebarStateChange('full');
        }
      } else if (deltaY < -dragThreshold) {
        if (dragStartStateRef.current === 'full') {
          onSidebarStateChange('half');
        } else if (dragStartStateRef.current === 'half') {
          onSidebarStateChange('collapsed');
        }
      }
    };

    const handleDocumentMouseMove = (event: globalThis.MouseEvent) => {
      if (!isDraggingRef.current || !isMobile) return;
      event.preventDefault();
      const clientY = event.clientY;
      const deltaY = dragStartYRef.current - clientY;

      if (deltaY > dragThreshold) {
        if (dragStartStateRef.current === 'collapsed' || dragStartStateRef.current === 'half') {
          onSidebarStateChange('full');
        }
      } else if (deltaY < -dragThreshold) {
        if (dragStartStateRef.current === 'full') {
          onSidebarStateChange('half');
        } else if (dragStartStateRef.current === 'half') {
          onSidebarStateChange('collapsed');
        }
      }
    };

    const handleDocumentMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
    };

    document.addEventListener('touchmove', handleDocumentTouchMove, { passive: false });
    document.addEventListener('touchend', handleDocumentTouchEnd);
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('touchmove', handleDocumentTouchMove);
      document.removeEventListener('touchend', handleDocumentTouchEnd);
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [isMobile, onSidebarStateChange]);

  const handleExpandFromCollapsed = () => {
    if (isMobile && sidebarState === 'collapsed') {
      onSidebarStateChange('half');
    }
  };

  const getTimeAgo = (timestamp: number): string => {
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
  };

  const getMessageStyle = (msg: Message): React.CSSProperties => {
    const base: React.CSSProperties = {
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
  };

  const getMessageClasses = (msg: Message): string => {
    const classes = ['message', msg.type];
    if (msg.streaming) classes.push('streaming');
    return classes.join(' ');
  };

  const renderMarkdown = (content: string): string => {
    try {
      return marked.parse(content, { async: false }) as string;
    } catch {
      return content;
    }
  };

  // Build container classes
  const containerClasses = [
    'chat-container',
    isMobile ? 'mobile' : 'desktop',
    !isMobile && isSidebarOpen ? 'desktop-open' : '',
    !isMobile && !isSidebarOpen ? 'desktop-closed' : '',
    isMobile && sidebarState === 'collapsed' ? 'collapsed' : '',
    isMobile && sidebarState === 'half' ? 'half' : '',
    isMobile && sidebarState === 'full' ? 'full' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses}>
      {/* Drag Handle - mobile only */}
      {isMobile && (
        <div
          className="drag-handle"
          onTouchStart={handleDragStart}
          onMouseDown={handleDragStart}
        >
          <div className="drag-handle-bar" />
        </div>
      )}

      {/* Collapsed State */}
      {isMobile && sidebarState === 'collapsed' && (
        <div className="chat-collapsed" onClick={handleExpandFromCollapsed}>
          <h3 className="chat-title">Chat AI</h3>
          <span className={`connection-status${isConnected ? ' connected' : ''}`}>
            ●
          </span>
        </div>
      )}

      {/* Full Chat UI */}
      {(!isMobile || (isMobile && sidebarState !== 'collapsed')) && (
        <div className={`chat-content${!isMobile && !isSidebarOpen ? ' desktop-hidden' : ''}`}>
          <div className="chat-header">
            <h3 className="chat-title">Chat AI</h3>
            <div className="chat-header-right">
              <button
                className="clear-chat-button"
                onClick={() => setShowClearDialog(true)}
                aria-label="Clear chat"
                title="Clear chat"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
              <span className={`connection-status${isConnected ? ' connected' : ''}`}>
                ●
              </span>
              {!isMobile && isSidebarOpen && (
                <button
                  className="close-sidebar-button"
                  onClick={onCloseSidebar}
                  aria-label="Close sidebar"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div
            className="chat-messages"
            ref={messagesContainerRef}
            onScroll={handleScroll}
          >
            {/* Welcome section */}
            {messages.length === 0 && (
              <div className="welcome-container">
                <img src="icons/carto_ai.gif" alt="CARTO AI" className="welcome-gif" />
                <h2 className="welcome-title">Welcome to CARTO AI Chat</h2>
                <p className="welcome-description">
                  Start a conversation with our AI agent to get insights, ask questions, or
                  execute tasks related to your geospatial data.
                </p>
                {isConnected && (
                  <div className="welcome-chips-container">
                    <p className="welcome-chips-label">Try asking:</p>
                    <div className="welcome-chips">
                      {welcomeChips.map((chip) => (
                        <button
                          key={chip.id}
                          className="welcome-chip"
                          onClick={() => handleWelcomeChipClick(chip)}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, index) => {
              const key = msg.id || msg.messageId || `msg-${index}`;

              if (msg.type === 'user') {
                return (
                  <div key={key} className="user-message-wrapper">
                    <div className={getMessageClasses(msg)} style={getMessageStyle(msg)}>
                      {msg.content}
                    </div>
                    {msg.timestamp && (
                      <div className="message-meta">
                        <span className="message-timestamp">{getTimeAgo(msg.timestamp)}</span>
                        <div className="user-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={key} className={getMessageClasses(msg)} style={getMessageStyle(msg)}>
                  {msg.type === 'tool' && msg.status === 'success' ? (
                    <div className="tool-success-message">
                      <div className="tool-check-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="9 12 11 14 15 10" />
                        </svg>
                      </div>
                      <span className="tool-message-text">{msg.content}</span>
                    </div>
                  ) : msg.type === 'assistant' ? (
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  ) : (
                    msg.content
                  )}
                  {msg.streaming && <span className="streaming-indicator">.</span>}
                </div>
              );
            })}

            {/* Loader */}
            {loaderState && (
              <div className="tool-loader">
                <span className="tool-loader-text">
                  {loaderState === 'thinking' ? 'Thinking' : 'Executing tools'}
                </span>
                <span className="tool-loader-dots">
                  <span className="dot">.</span>
                  <span className="dot">.</span>
                  <span className="dot">.</span>
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-container">
            <div className="chat-input-wrapper">
              <input
                type="text"
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Message AI Agent..."
              />
              <button
                className="send-button"
                onClick={handleSend}
                disabled={!isConnected || !input.trim()}
                aria-label="Send message"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        visible={showClearDialog}
        title="Clear Chat"
        message="Are you sure you want to clear the chat history? This action cannot be undone."
        confirmText="Clear"
        cancelText="Cancel"
        showCheckbox
        checkboxLabel="Also clear chat-generated layers and widgets"
        checkboxChecked={clearLayersOnClear}
        onCheckboxChange={setClearLayersOnClear}
        onConfirm={() => {
          onClearChat(clearLayersOnClear);
          setShowClearDialog(false);
          setClearLayersOnClear(false);
        }}
        onCancel={() => {
          setShowClearDialog(false);
          setClearLayersOnClear(false);
        }}
      />
    </div>
  );
}
