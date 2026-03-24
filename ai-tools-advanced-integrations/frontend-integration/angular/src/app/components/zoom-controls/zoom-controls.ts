import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * ZoomControls - Zoom in/out buttons with level display
 * Updated to use Input/Output pattern like React
 */
@Component({
  selector: 'app-zoom-controls',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './zoom-controls.html',
  styleUrl: './zoom-controls.css',
})
export class ZoomControls {
  @Input() disabled: boolean = false;
  @Input() zoomLevel: number = 10;
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();

  onZoomIn(): void {
    if (!this.disabled) {
      this.zoomIn.emit();
    }
  }

  onZoomOut(): void {
    if (!this.disabled) {
      this.zoomOut.emit();
    }
  }

  get formattedZoom(): string {
    return this.zoomLevel.toFixed(1);
  }
}
