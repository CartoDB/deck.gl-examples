<script setup lang="ts">
import { ref, watch, onBeforeUnmount, type Ref } from 'vue';
import type { WidgetSpec } from '../composables/useWidgets';

const props = defineProps<{
  widgets: WidgetSpec[];
}>();

const emit = defineEmits<{
  remove: [id: string];
}>();

function formatFormulaValue(data: unknown): string {
  const value = (data as any)?.value;
  if (value === undefined || value === null) return '';
  return typeof value === 'number' ? value.toLocaleString() : String(value);
}

function normalizeSpec(spec: Record<string, any>, widgetType: string): Record<string, any> {
  const encoding = spec.encoding;
  if (!encoding) return spec;
  if (widgetType === 'category') {
    return {
      ...spec,
      encoding: {
        x: { field: 'name', type: 'nominal', title: encoding.x?.title },
        y: { field: 'value', type: 'quantitative', title: encoding.y?.title },
      },
    };
  }
  return spec;
}

// Vega rendering
const vegaContainers = ref<Record<string, HTMLDivElement>>({});

function setVegaRef(el: any, id: string) {
  if (el) {
    vegaContainers.value[id] = el as HTMLDivElement;
  }
}

watch(
  () => props.widgets.map(w => ({ id: w.id, data: w.data, type: w.type, vegaLiteSpec: w.vegaLiteSpec })),
  async (newWidgets) => {
    for (const widget of newWidgets) {
      if (!widget.data || widget.type === 'formula') continue;
      const container = vegaContainers.value[widget.id];
      if (!container) continue;

      const fullWidget = props.widgets.find(w => w.id === widget.id);
      if (!fullWidget) continue;

      let values: unknown[];
      const data = fullWidget.data as any;
      if (Array.isArray(data)) {
        values = data;
      } else if (data?.rows && Array.isArray(data.rows)) {
        values = data.rows;
      } else {
        values = [data];
      }

      const normalizedSpec = normalizeSpec(fullWidget.vegaLiteSpec, fullWidget.type);
      const fullSpec = {
        ...normalizedSpec,
        data: { values },
        width: 'container',
        height: 150,
        background: 'transparent',
        config: {
          axis: { labelColor: '#64748b', titleColor: '#475569', gridColor: '#e2e8f0' },
          legend: { labelColor: '#475569', titleColor: '#475569' },
          title: { color: '#1e293b' },
          view: { stroke: 'transparent' },
        },
      };

      try {
        const { default: embed } = await import('vega-embed');
        container.innerHTML = '';
        await embed(container, fullSpec as any, { actions: false, renderer: 'svg' });
      } catch (err) {
        console.error('Vega embed error:', err);
      }
    }
  },
  { deep: true }
);
</script>

<template>
  <div v-if="widgets.length > 0" class="widget-container">
    <div class="widget-container-header">
      <h3>Widgets</h3>
    </div>
    <div v-for="widget in widgets" :key="widget.id" class="widget-card">
      <div class="widget-card-header">
        <span class="widget-card-title">{{ widget.name }}</span>
        <button class="widget-remove-btn" @click="emit('remove', widget.id)" title="Remove widget">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div class="widget-card-body">
        <div v-if="widget.loading" class="widget-loading">Loading...</div>
        <div v-else-if="widget.error" class="widget-error">{{ widget.error }}</div>
        <template v-else-if="widget.data != null">
          <div v-if="widget.type === 'formula'" class="widget-formula-value">
            {{ formatFormulaValue(widget.data) }}
          </div>
          <div v-else :ref="(el) => setVegaRef(el, widget.id)" class="widget-vega-container" />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.widget-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  min-width: 330px;
  color: #1e293b;
  font-size: 13px;
  overflow-y: auto;
  max-height: calc(40 - 100vh);
}
.widget-container-header {
  display: flex;
  align-items: center;
  padding: 15px 14px;
  font-weight: 600;
  font-size: 13px;
  color: #1e293b;
  border-bottom: 1px solid #e2e8f0;
}
.widget-card { border-bottom: 1px solid #e2e8f0; }
.widget-card:last-child { border-bottom: none; }
.widget-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-bottom: 1px solid #e2e8f0;
}
.widget-card-title { font-weight: 500; font-size: 12px; color: #475569; }
.widget-remove-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #94a3b8;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.widget-remove-btn:hover { color: #ef4444; background: #fef2f2; }
.widget-card-body { padding: 8px 14px; }
.widget-formula-value {
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  padding: 8px 0;
  color: #1e293b;
}
.widget-vega-container { width: 100%; min-height: 100px; }
.widget-vega-container :deep(svg) { width: 100% !important; }
.widget-loading { text-align: center; padding: 12px; color: #94a3b8; font-size: 12px; }
.widget-error { text-align: center; padding: 8px; color: #ef4444; font-size: 11px; }
</style>
