import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Snackbar - Shows notification messages with auto-dismiss
 * Angular equivalent of React's Snackbar component
 */
@Component({
  selector: 'app-snackbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './snackbar.html',
  styleUrl: './snackbar.css',
})
export class SnackbarComponent implements OnChanges, OnDestroy {
  @Input() message: string | null = null;
  @Input() type: 'error' | 'info' = 'error';
  @Input() duration = 5000;
  @Output() close = new EventEmitter<void>();

  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['message'] && this.message) {
      this.clearTimeout();
      this.timeoutId = setTimeout(() => {
        this.close.emit();
      }, this.duration);
    }
  }

  ngOnDestroy(): void {
    this.clearTimeout();
  }

  onClose(): void {
    this.clearTimeout();
    this.close.emit();
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  get icon(): string {
    return this.type === 'error' ? '⚠' : 'ℹ';
  }
}
