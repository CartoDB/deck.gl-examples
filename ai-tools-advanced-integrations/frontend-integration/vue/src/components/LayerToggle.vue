<script setup lang="ts">
import { ref, watch } from 'vue';
import type { LayerConfig } from '../types/models';
import type { LegendData, ColorFunctionLegend } from '../utils/legend';

interface Props {
  disabled?: boolean;
  layers: LayerConfig[];
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  toggle: [event: { layerId: string; visible: boolean }];
  flyTo: [event: { layerId: string }];
}>();

const isPanelCollapsed = ref(false);
const expandedLayers = ref<Set<string>>(new Set());

// Auto-expand all layers when data loads
watch(
  () => props.layers,
  (newLayers) => {
    if (newLayers.length > 0) {
      expandedLayers.value = new Set(newLayers.map((l) => l.id));
    }
  }
);

function togglePanel() {
  isPanelCollapsed.value = !isPanelCollapsed.value;
}

function toggleLayerExpansion(layerId: string) {
  const next = new Set(expandedLayers.value);
  if (next.has(layerId)) {
    next.delete(layerId);
  } else {
    next.add(layerId);
  }
  expandedLayers.value = next;
}

// Legend helper functions
function getGradientStyle(legend: ColorFunctionLegend): string {
  if (!legend.colors || legend.colors.length === 0) return '';
  const gradientStops = legend.colors
    .map((color, index) => {
      const percent = (index / (legend.colors!.length - 1)) * 100;
      return `${color} ${percent}%`;
    })
    .join(', ');
  return `linear-gradient(to right, ${gradientStops})`;
}

function getMinDomainValue(domain: number[] | string[]): string {
  if (!domain || domain.length === 0) return '';
  if (typeof domain[0] === 'number') {
    return `< ${domain[0]}`;
  }
  return String(domain[0]);
}

function getMaxDomainValue(domain: number[] | string[]): string {
  if (!domain || domain.length === 0) return '';
  if (typeof domain[0] === 'number') {
    const numDomain = domain as number[];
    return `\u2265 ${numDomain[numDomain.length - 1]}`;
  }
  return String(domain[domain.length - 1]);
}
</script>

<template>
  <!-- Collapsed state: icon button -->
  <button
    v-if="isPanelCollapsed"
    class="layer-toggle-icon-btn"
    @click="togglePanel"
    :disabled="disabled"
    title="Show layers"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  </button>

  <!-- Expanded state: full panel -->
  <div v-else class="layer-toggle">
    <div class="layer-toggle-header">
      <div class="header-left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
        <span>Layers</span>
      </div>
      <button class="close-btn" @click="togglePanel" title="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div class="layer-list">
      <div
        v-for="layer in layers"
        :key="layer.id"
        :class="{ 'layer-item': true, disabled: disabled }"
      >
        <div class="layer-row">
          <button
            :class="{ 'expand-btn': true, expanded: expandedLayers.has(layer.id) }"
            @click="toggleLayerExpansion(layer.id)"
            :disabled="disabled"
            title="Toggle details"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <span class="layer-name">{{ layer.name }}</span>
          <button
            class="fly-to-btn"
            @click="emit('flyTo', { layerId: layer.id })"
            :disabled="disabled"
            title="Fly to layer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
          <button
            :class="{ 'visibility-btn': true, hidden: !layer.visible }"
            @click="emit('toggle', { layerId: layer.id, visible: !layer.visible })"
            :disabled="disabled"
            :title="layer.visible ? 'Hide layer' : 'Show layer'"
          >
            <svg v-if="layer.visible" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </button>
        </div>

        <div v-if="expandedLayers.has(layer.id)" class="layer-details">
          <!-- Discrete legend -->
          <div v-if="layer.legend?.type === 'discrete' && layer.legend.entries" class="legend-container">
            <div v-if="layer.legend.attribute" class="legend-attribute-note">
              color by {{ layer.legend.attribute }}
            </div>
            <div class="legend-entries">
              <div v-for="entry in layer.legend.entries" :key="entry.label" class="legend-entry">
                <span class="legend-dot" :style="{ backgroundColor: entry.color }" />
                <span class="legend-label">{{ entry.label }}</span>
              </div>
            </div>
          </div>

          <!-- Continuous/Bins legend -->
          <div
            v-else-if="(layer.legend?.type === 'continuous' || layer.legend?.type === 'bins') && layer.legend.functionConfig"
            class="legend-container"
          >
            <div v-if="layer.legend.attribute" class="legend-attribute-note">
              color by {{ layer.legend.attribute }}
            </div>
            <div class="legend-gradient-container">
              <div
                class="legend-gradient"
                :style="{ background: getGradientStyle(layer.legend.functionConfig) }"
              />
              <div class="legend-domain-labels">
                <span class="domain-label-min">
                  {{ getMinDomainValue(layer.legend.functionConfig.domain) }}
                </span>
                <span class="domain-label-max">
                  {{ getMaxDomainValue(layer.legend.functionConfig.domain) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Categories legend -->
          <div
            v-else-if="layer.legend?.type === 'categories' && layer.legend.functionConfig"
            class="legend-container"
          >
            <div v-if="layer.legend.attribute" class="legend-attribute-note">
              color by {{ layer.legend.attribute }}
            </div>
            <div class="legend-entries">
              <div
                v-for="(category, i) in layer.legend.functionConfig.domain"
                :key="`${category}-${i}`"
                class="legend-entry"
                v-show="layer.legend.functionConfig.colors && layer.legend.functionConfig.colors[i]"
              >
                <span
                  class="legend-dot"
                  :style="{ backgroundColor: layer.legend.functionConfig.colors?.[i] }"
                />
                <span class="legend-label">{{ String(category) }}</span>
              </div>
            </div>
          </div>

          <!-- Single color legend -->
          <div v-else-if="layer.legend?.type === 'single' && layer.legend.singleColor" class="legend-container">
            <div class="legend-entry">
              <span class="legend-dot" :style="{ backgroundColor: layer.legend.singleColor }" />
              <span class="legend-label">{{ layer.name }}</span>
            </div>
          </div>

          <!-- Fallback: default color -->
          <div v-else class="legend-container">
            <div class="legend-entry">
              <span class="legend-dot" :style="{ backgroundColor: layer.color }" />
              <span class="legend-label">{{ layer.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Collapsed icon button */
.layer-toggle-icon-btn {
  width: 40px;
  height: 40px;
  background: white;
  border: none;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: background-color 0.2s, color 0.2s;
}

.layer-toggle-icon-btn:hover:not(:disabled) {
  background: #f8fafc;
  color: #1e293b;
}

.layer-toggle-icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Expanded panel */
.layer-toggle {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  min-width: 220px;
}

.layer-toggle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #e2e8f0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.header-left svg {
  color: #64748b;
}

.close-btn {
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  transition: background-color 0.2s, color 0.2s;
}

.close-btn:hover {
  background: #f1f5f9;
  color: #64748b;
}

/* Layer list */
.layer-list {
  padding: 0;
}

.layer-item {
  padding: 0 8px;
}

.layer-item.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.layer-row:hover {
  background: #f8fafc;
}

/* Expand/collapse button */
.expand-btn {
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  transition: transform 0.2s, color 0.2s;
  flex-shrink: 0;
}

.expand-btn:hover:not(:disabled) {
  color: #64748b;
}

.expand-btn:disabled {
  cursor: not-allowed;
}

.expand-btn.expanded svg {
  transform: rotate(180deg);
}

/* Layer name */
.layer-name {
  flex: 1;
  font-size: 13px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Fly-to button */
.fly-to-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: background-color 0.2s, color 0.2s;
  flex-shrink: 0;
}

.fly-to-btn:hover:not(:disabled) {
  background: #f1f5f9;
  color: #2563eb;
}

.fly-to-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* Visibility toggle button */
.visibility-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: background-color 0.2s, color 0.2s;
  flex-shrink: 0;
}

.visibility-btn:hover:not(:disabled) {
  background: #f1f5f9;
  color: #1e293b;
}

.visibility-btn:disabled {
  cursor: not-allowed;
}

.visibility-btn.hidden {
  color: #cbd5e1;
}

.visibility-btn.hidden:hover:not(:disabled) {
  color: #94a3b8;
}

/* Layer details (expanded section) */
.layer-details {
  padding: 4px 0 8px 36px;
}

/* Legend styles */
.legend-container {
  padding: 4px 6px;
}

.legend-entries {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.legend-label {
  font-size: 12px;
  color: #475569;
  line-height: 1.4;
}

/* Gradient legend for continuous/binned scales */
.legend-gradient-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.legend-gradient {
  width: 100%;
  height: 16px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.legend-domain-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #64748b;
  padding: 0 2px;
}

.domain-label-min,
.domain-label-max {
  font-size: 11px;
  color: #64748b;
  line-height: 1.2;
}

/* Attribute note for legend */
.legend-attribute-note {
  font-size: 11px;
  font-style: italic;
  color: #64748b;
  margin-bottom: 6px;
  line-height: 1.3;
}
</style>
