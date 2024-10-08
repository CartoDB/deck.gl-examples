## Example: Scatterplot widget

A simple example that showcases how to build a scalable [Time series widget](https://docs.carto.com/carto-for-developers/reference/carto-widgets-reference/models/gettimeseries) using CARTO + deck.gl that stays synchronized with the map, using large-scale data coming from the same cloud data warehouse as your maps.

It also allows you to filter the data using GPU-based client-side filtering thanks to the [DataFilterExtension](https://deck.gl/docs/api-reference/extensions/data-filter-extension) from deck.gl.

The UI for the chart is built using [Apache eCharts](https://echarts.apache.org) but developers can plug their own charting or data visualization library.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/widgets-time-series?file=index.ts)

Or run it locally:

```bash
npm install
# or
yarn
```

Commands:

- `npm run dev` is the development target, to serve the app and hot reload.
- `npm run build` is the production target, to create the final bundle and write to disk.
