import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Confirmation Dialog Component
 * Custom dialog to replace native browser confirm()
 */
@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation-dialog.html',
  styleUrl: './confirmation-dialog.css',
})
export class ConfirmationDialogComponent {
  @Input() visible: boolean = false;
  @Input() title: string = 'Confirm';
  @Input() message: string = 'Are you sure?';
  @Input() confirmText: string = 'Confirm';
  @Input() cancelText: string = 'Cancel';
  @Input() showCheckbox: boolean = false;
  @Input() checkboxLabel: string = '';
  @Input() checkboxChecked: boolean = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  @Output() checkboxChange = new EventEmitter<boolean>();

  onCheckboxChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.checkboxChange.emit(checked);
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscape(event: KeyboardEvent): void {
    if (this.visible) {
      this.handleCancel();
    }
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleEnter(event: KeyboardEvent): void {
    if (this.visible && !event.defaultPrevented) {
      // Only confirm if focus is not on an input/textarea
      const target = event.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        this.handleConfirm();
      }
    }
  }

  handleConfirm(): void {
    this.confirm.emit();
    this.close.emit();
  }

  handleCancel(): void {
    this.cancel.emit();
    this.close.emit();
  }

  handleBackdropClick(event: MouseEvent): void {
    // Only close if clicking directly on the backdrop
    if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
      this.handleCancel();
    }
  }
}
