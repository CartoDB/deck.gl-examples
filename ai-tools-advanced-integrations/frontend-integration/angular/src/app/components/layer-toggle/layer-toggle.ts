import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayerConfig } from '../../models/message.model';
import { LegendData, ColorFunctionLegend } from '../../utils/legend.utils';

/**
 * LayerToggle - Collapsible layer visibility panel with eye icon toggles
 */
@Component({
  selector: 'app-layer-toggle',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './layer-toggle.html',
  styleUrl: './layer-toggle.css',
})
export class LayerToggle implements OnChanges {
  @Input() disabled: boolean = false;
  @Input() layers: LayerConfig[] = [];
  @Output() toggle = new EventEmitter<{ layerId: string; visible: boolean }>();
  @Output() flyTo = new EventEmitter<{ layerId: string }>();

  isPanelCollapsed: boolean = false;
  expandedLayers: Set<string> = new Set();

  ngOnChanges(changes: SimpleChanges): void {
    // Auto-expand all layers when data loads
    if (changes['layers'] && this.layers.length > 0) {
      this.layers.forEach((layer) => this.expandedLayers.add(layer.id));
    }
  }

  togglePanel(): void {
    this.isPanelCollapsed = !this.isPanelCollapsed;
  }

  toggleLayerExpansion(layerId: string): void {
    if (this.expandedLayers.has(layerId)) {
      this.expandedLayers.delete(layerId);
    } else {
      this.expandedLayers.add(layerId);
    }
  }

  isLayerExpanded(layerId: string): boolean {
    return this.expandedLayers.has(layerId);
  }

  onToggle(layer: LayerConfig): void {
    if (this.disabled) return;
    this.toggle.emit({ layerId: layer.id, visible: !layer.visible });
  }

  onFlyTo(layer: LayerConfig): void {
    if (this.disabled) return;
    this.flyTo.emit({ layerId: layer.id });
  }

  trackByLayer(index: number, layer: LayerConfig): string {
    return layer.id;
  }

  // ==================== LEGEND HELPER METHODS ====================

  getLegendData(layer: LayerConfig): LegendData | null {
    return layer.legend || null;
  }

  formatDomainLabel(domain: number[] | string[]): string {
    if (!domain || domain.length === 0) {
      return '';
    }

    if (typeof domain[0] === 'number') {
      const numDomain = domain as number[];
      if (numDomain.length === 2) {
        return `< ${numDomain[0]} | ≥ ${numDomain[numDomain.length - 1]}`;
      }
      // For bins, show first and last
      return `< ${numDomain[0]} | ≥ ${numDomain[numDomain.length - 1]}`;
    }

    // String domain (categories)
    return domain.join(', ');
  }

  getGradientStyle(legend: ColorFunctionLegend): string {
    if (!legend.colors || legend.colors.length === 0) {
      return '';
    }

    const gradientStops = legend.colors
      .map((color, index) => {
        const percent = (index / (legend.colors!.length - 1)) * 100;
        return `${color} ${percent}%`;
      })
      .join(', ');

    return `linear-gradient(to right, ${gradientStops})`;
  }

  getMinDomainValue(domain: number[] | string[]): string {
    if (!domain || domain.length === 0) {
      return '';
    }
    if (typeof domain[0] === 'number') {
      const numDomain = domain as number[];
      return `< ${numDomain[0]}`;
    }
    return String(domain[0]);
  }

  getMaxDomainValue(domain: number[] | string[]): string {
    if (!domain || domain.length === 0) {
      return '';
    }
    if (typeof domain[0] === 'number') {
      const numDomain = domain as number[];
      return `≥ ${numDomain[numDomain.length - 1]}`;
    }
    return String(domain[domain.length - 1]);
  }

  getAttributeNote(layer: LayerConfig): string | null {
    const legend = this.getLegendData(layer);
    if (!legend || !legend.attribute) {
      return null;
    }
    return `color by ${legend.attribute}`;
  }
}
