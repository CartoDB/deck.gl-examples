import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  HostListener,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MarkdownModule } from 'ngx-markdown';
import { Message, LoaderState } from '../../models/message.model';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog';
import { SEMANTIC_CONFIG, fetchSemanticConfig } from '../../config/semantic-config';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-chat-ui',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    MarkdownModule,
    ConfirmationDialogComponent,
  ],
  templateUrl: './chat-ui.html',
  styleUrl: './chat-ui.css',
})
export class ChatUi implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() isConnected: boolean = false;
  @Input() messages: Message[] = [];
  @Input() loaderState: LoaderState = null;
  @Input() sidebarState: 'closed' | 'open' | 'collapsed' | 'half' | 'full' = 'closed';
  @Input() isMobile: boolean = false;
  @Input() isSidebarOpen: boolean = false;
  @Output() sendMessage = new EventEmitter<string>();
  @Output() sidebarStateChange = new EventEmitter<'collapsed' | 'half' | 'full'>();
  @Output() closeSidebar = new EventEmitter<void>();
  @Output() clearChat = new EventEmitter<boolean>();

  @ViewChild('messagesEnd') private messagesEnd!: ElementRef;
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef<HTMLDivElement>;

  input: string = '';
  private shouldAutoScroll: boolean = true;
  private previousMessageCount: number = 0;
  private lastMessageContentLength: number = 0;
  showClearDialog: boolean = false;
  clearLayersOnClear: boolean = false;

  // Welcome chips
  welcomeChips = SEMANTIC_CONFIG.welcomeChips;

  async ngOnInit(): Promise<void> {
    const backendUrl = environment.httpApiUrl.replace(/\/api\/chat$/, '');
    const config = await fetchSemanticConfig(backendUrl);
    this.welcomeChips = config.welcomeChips;
  }

  // Drag handling
  private isDragging: boolean = false;
  private dragStartY: number = 0;
  private dragStartState: 'collapsed' | 'half' | 'full' | 'closed' | 'open' = 'half';
  private dragThreshold: number = 50; // Minimum drag distance to trigger state change

  ngAfterViewInit(): void {
    // Initialize previous message count and last message content length
    this.previousMessageCount = this.messages.length;
    const lastMessage = this.messages[this.messages.length - 1];
    this.lastMessageContentLength = lastMessage?.content?.length || 0;
  }

  ngOnDestroy(): void {
    // Clean up document event listeners
    this.removeDocumentListeners();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle loader state changes - scroll when loader appears
    if (changes['loaderState']) {
      const loaderAppeared =
        changes['loaderState'].currentValue && !changes['loaderState'].previousValue;
      if (loaderAppeared && this.shouldAutoScroll) {
        setTimeout(() => this.scrollToBottom(), 0);
      }
    }

    // Handle message changes
    if (changes['messages'] && !changes['messages'].firstChange) {
      const hasNewMessages = this.messages.length !== this.previousMessageCount;
      const lastMessage = this.messages[this.messages.length - 1];
      const contentChanged =
        lastMessage && (lastMessage.content?.length || 0) !== this.lastMessageContentLength;

      if (hasNewMessages || contentChanged) {
        this.previousMessageCount = this.messages.length;
        this.lastMessageContentLength = lastMessage?.content?.length || 0;

        // Check current scroll position before auto-scrolling
        this.checkScrollPosition();

        // Small delay to ensure DOM is updated
        setTimeout(() => {
          if (this.shouldAutoScroll) {
            this.scrollToBottom();
          }
        }, 0);
      }
    }
  }

  private checkScrollPosition(): void {
    const container = this.messagesContainer?.nativeElement;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Consider user at bottom if within 100px of bottom
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    this.shouldAutoScroll = isNearBottom;
  }

  handleScroll(event: Event): void {
    const container = event.target as HTMLDivElement;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Consider user at bottom if within 100px of bottom
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    this.shouldAutoScroll = isNearBottom;
  }

  scrollToBottom(): void {
    try {
      const container = this.messagesContainer?.nativeElement;
      if (container) {
        // Use instant scroll to avoid interfering with user scrolling
        container.scrollTop = container.scrollHeight;
      } else {
        this.messagesEnd?.nativeElement.scrollIntoView({ behavior: 'auto' });
      }
    } catch (err) {
      // Ignore scroll errors
    }
  }

  handleSend(): void {
    if (this.input.trim() && this.isConnected) {
      this.sendMessage.emit(this.input.trim());
      this.input = '';
      // Enable auto-scroll when user sends a message
      this.shouldAutoScroll = true;
      // Reset for new streaming message
      this.lastMessageContentLength = 0;
    }
  }

  handleKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.handleSend();
    }
  }

  getMessageStyle(msg: Message): Record<string, string> {
    const baseStyle: Record<string, string> = {
      padding: '10px',
      'border-radius': '8px',
      'max-width': '100%',
      'white-space': 'pre-wrap',
      'word-break': 'break-word',
      'margin-bottom': '10px',
    };

    switch (msg.type) {
      case 'user':
        return {
          ...baseStyle,
          'align-self': 'flex-start',
          background: '#f3f4f6',
          color: '#1e293b',
          'font-size': '13px',
        };
      case 'assistant':
        return {
          ...baseStyle,
          'align-self': 'flex-start',
          background: '#EDFBF5',
          color: '#2C3032',
          border: '1px solid #2C30321F',
          'font-size': '13px',
        };
      case 'action':
        return {
          ...baseStyle,
          'align-self': 'flex-start',
          'font-family': 'monospace',
          background: '#EDFBF5',
          color: '#2C3032',
          border: '1px solid #2C30321F',
          'font-size': '13px',
        };
      case 'tool':
        return {
          ...baseStyle,
          'align-self': 'flex-start',
          background: '#EDFBF5',
          color: '#2C3032',
          border: '1px solid #2C30321F',
          'font-size': '13px',
        };
      case 'error':
        return {
          ...baseStyle,
          'align-self': 'flex-start',
          background: '#ef4444',
          color: 'white',
        };
      case 'system':
        return {
          ...baseStyle,
          'align-self': 'center',
          background: '#f1f5f9',
          color: '#64748b',
          'font-size': '12px',
          'font-style': 'italic',
        };
      default:
        return {
          ...baseStyle,
          'align-self': 'flex-start',
          background: '#EDFBF5',
          color: '#2C3032',
          border: '1px solid #2C30321F',
          'font-size': '13px',
        };
    }
  }

  getMessageClasses(msg: Message): string {
    const classes = ['message', msg.type];
    if (msg.streaming) {
      classes.push('streaming');
    }
    return classes.join(' ');
  }

  trackByMessage(index: number, msg: Message): string {
    return msg.id || msg.messageId || index.toString();
  }

  handleDragStart(event: TouchEvent | MouseEvent): void {
    if (!this.isMobile) return;

    this.isDragging = true;
    // On mobile, sidebarState should only be mobile states
    const mobileState = this.sidebarState === 'closed' || this.sidebarState === 'open'
      ? 'half'
      : this.sidebarState;
    this.dragStartState = mobileState as 'collapsed' | 'half' | 'full';

    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    this.dragStartY = clientY;

    // Add document-level listeners for mouse events
    if (!('touches' in event)) {
      document.addEventListener('mousemove', this.handleDocumentMouseMove);
      document.addEventListener('mouseup', this.handleDocumentMouseUp);
    }

    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('document:touchmove', ['$event'])
  handleDocumentTouchMove(event: TouchEvent): void {
    if (!this.isDragging || !this.isMobile) return;
    this.handleDragMove(event);
  }

  @HostListener('document:touchend', ['$event'])
  handleDocumentTouchEnd(event: TouchEvent): void {
    if (!this.isDragging) return;
    this.handleDragEnd(event);
  }

  private handleDocumentMouseMove = (event: MouseEvent): void => {
    if (!this.isDragging || !this.isMobile) return;
    this.handleDragMove(event);
  };

  private handleDocumentMouseUp = (event: MouseEvent): void => {
    if (!this.isDragging) return;
    this.handleDragEnd(event);
    this.removeDocumentListeners();
  };

  private removeDocumentListeners(): void {
    document.removeEventListener('mousemove', this.handleDocumentMouseMove);
    document.removeEventListener('mouseup', this.handleDocumentMouseUp);
  }

  private handleDragMove(event: TouchEvent | MouseEvent): void {
    if (!this.isDragging || !this.isMobile) return;

    event.preventDefault();

    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    const deltaY = this.dragStartY - clientY; // Positive when dragging up

    // Determine target state based on drag distance and current state
    if (deltaY > this.dragThreshold) {
      // Dragging up
      if (this.dragStartState === 'collapsed' || this.dragStartState === 'half') {
        this.sidebarStateChange.emit('full');
      }
    } else if (deltaY < -this.dragThreshold) {
      // Dragging down
      if (this.dragStartState === 'full') {
        this.sidebarStateChange.emit('half');
      } else if (this.dragStartState === 'half') {
        this.sidebarStateChange.emit('collapsed');
      }
    }
  }

  private handleDragEnd(event: TouchEvent | MouseEvent): void {
    if (!this.isDragging) return;

    this.isDragging = false;

    const clientY = 'touches' in event
      ? (event.changedTouches?.[0]?.clientY ?? 0)
      : event.clientY;
    const deltaY = this.dragStartY - clientY;

    // Final state determination based on drag distance
    if (Math.abs(deltaY) < this.dragThreshold) {
      // Small movement, revert to start state
      // dragStartState is guaranteed to be a mobile state
      const mobileState = this.dragStartState as 'collapsed' | 'half' | 'full';
      this.sidebarStateChange.emit(mobileState);
      return;
    }

    // Determine final state based on drag direction
    if (deltaY > this.dragThreshold) {
      // Dragged up
      if (this.dragStartState === 'collapsed' || this.dragStartState === 'half') {
        this.sidebarStateChange.emit('full');
      }
    } else if (deltaY < -this.dragThreshold) {
      // Dragged down
      if (this.dragStartState === 'full') {
        this.sidebarStateChange.emit('half');
      } else if (this.dragStartState === 'half') {
        this.sidebarStateChange.emit('collapsed');
      }
    }
  }

  handleExpandFromCollapsed(): void {
    if (this.isMobile && this.sidebarState === 'collapsed') {
      this.sidebarStateChange.emit('half');
    }
  }

  handleCloseSidebar(): void {
    this.closeSidebar.emit();
  }

  handleClearChat(): void {
    this.showClearDialog = true;
  }

  getTimeAgo(timestamp: number): string {
    if (!timestamp) return 'just now';

    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    } else if (hours > 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    } else if (minutes > 0) {
      return `${minutes} min. ago`;
    } else if (seconds > 0) {
      return `${seconds} sec. ago`;
    } else {
      return 'just now';
    }
  }

  handleCheckboxChange(checked: boolean): void {
    this.clearLayersOnClear = checked;
  }

  handleDialogConfirm(): void {
    this.clearChat.emit(this.clearLayersOnClear);
    this.showClearDialog = false;
    this.clearLayersOnClear = false;
  }

  handleDialogCancel(): void {
    this.showClearDialog = false;
    this.clearLayersOnClear = false;
  }

  handleDialogClose(): void {
    this.showClearDialog = false;
    this.clearLayersOnClear = false;
  }

  handleWelcomeChipClick(chip: { id: string; label: string; prompt: string }): void {
    if (chip.prompt && this.isConnected) {
      // Enable auto-scroll when user clicks a welcome chip
      this.shouldAutoScroll = true;
      this.lastMessageContentLength = 0;
      this.sendMessage.emit(chip.prompt);
      setTimeout(() => this.scrollToBottom(), 0);
    }
  }

}
