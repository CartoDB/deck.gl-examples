## Example: Widgets for tilesets

A simple example that showcases how to build customizable [Widgets](https://docs.carto.com/carto-for-developers/reference/carto-widgets-reference) using CARTO + deck.gl on top of large-scale pre-generated tilesets coming from the same cloud data warehouse as your maps.

The UI for these charts is built using [Apache eCharts](https://echarts.apache.org) but developers can plug their own charting or data visualization library.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/widgets-tileset?file=index.ts)

Or run it locally:

```bash
npm install
# or
yarn
```

Commands:

- `npm run dev` is the development target, to serve the app and hot reload.
- `npm run build` is the production target, to create the final bundle and write to disk.
