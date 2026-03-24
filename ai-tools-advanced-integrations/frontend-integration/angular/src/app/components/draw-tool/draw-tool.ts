import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MaskLayerService } from '../../services/mask-layer.service';

@Component({
  selector: 'app-draw-tool',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './draw-tool.html',
  styleUrl: './draw-tool.css',
})
export class DrawTool implements OnInit, OnDestroy {
  hasMask = false;
  isDrawing = false;
  currentMode = 'draw';

  private subscriptions: Subscription[] = [];

  constructor(private maskLayerService: MaskLayerService) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.maskLayerService.hasMask$.subscribe((has) => (this.hasMask = has)),
      this.maskLayerService.maskState$.subscribe((state) => {
        this.isDrawing = state.isDrawing;
        this.currentMode = this.maskLayerService.getCurrentModeName();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
  }

  toggleDraw(): void {
    if (this.isDrawing) {
      this.maskLayerService.disableDrawMode();
    } else {
      this.maskLayerService.enableDrawMode();
    }
  }

  setMode(mode: string): void {
    this.maskLayerService.setDrawMode(mode);
    this.currentMode = mode;
  }

  clearMask(): void {
    this.maskLayerService.clearMask();
  }
}
