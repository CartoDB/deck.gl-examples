## Example: Dynamic Heatmap using a 587k points worldwide fires dataset

This visualization showcases how easy it is with CARTO to build a heatmap from large point datasets directly from your cloud data warehouse, such as BigQuery, Snowflake, Redshift, Databricks... As an example, it uses a 587k rows dataset of fires worldwide from NASA.

The process uses two steps:

- First, the point data is dynamically aggregated by CARTO into quadbins using the [quadbinTableSource](https://deck.gl/docs/api-reference/carto/data-sources#quadbintablesource).
- Then, the [HeatmapTileLayer](https://deck.gl/docs/api-reference/carto/heatmap-tile-layer) takes care of the heatmap rendering, with different options for styling.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/dynamic-heatmap?file=index.ts)

Or run it locally:

```bash
npm install
# or
yarn
```

Commands:

- `npm dev` is the development target, to serve the app and hot reload.
- `npm run build` is the production target, to create the final bundle and write to disk.
