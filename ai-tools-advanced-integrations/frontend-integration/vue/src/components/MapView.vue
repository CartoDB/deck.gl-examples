<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useDeckMap } from '../composables/useDeckMap';
import type { ViewState } from '../composables/useDeckMap';

const emit = defineEmits<{
  viewStateChange: [viewState: ViewState];
}>();

const deckMap = useDeckMap();

onMounted(async () => {
  await deckMap.initialize('map-container', 'map-canvas');
  deckMap.onViewStateChange((vs) => {
    emit('viewStateChange', vs);
  });
  deckMap.startWatching();
});

onUnmounted(() => {
  deckMap.destroy();
});
</script>

<template>
  <div class="map-view-container">
    <div id="map-container" />
    <canvas id="map-canvas" />
  </div>
</template>

<style scoped>
/* MapView container - fills available space */
.map-view-container {
  position: relative;
  width: 100%;
  height: 100%;
}

#map-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

#map-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
