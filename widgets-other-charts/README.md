## Example: Other charts

This example shows how to build custom charts and experiences using CARTO + deck.gl, by leveraging the [CARTO Widgets models](https://docs.carto.com/carto-for-developers/reference/carto-widgets-reference/models). The charts stay synchronized with the map, ans of course, they use large-scale data coming from the same cloud data warehouse as your maps.

In this case, we leverage the _Categories_ and _Table_ models in CARTO to build a fully-custom radar chart and sankey chart, respectively, with data for 3.6M Citi Bike trips in Manhattan.

The UI for the charts is built using [Apache eCharts](https://echarts.apache.org) but developers can plug their own charting or data visualization library.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/widgets-other-charts?file=index.ts)

Or run it locally:

```bash
npm install
# or
yarn
```

Commands:

- `npm run dev` is the development target, to serve the app and hot reload.
- `npm run build` is the production target, to create the final bundle and write to disk.
