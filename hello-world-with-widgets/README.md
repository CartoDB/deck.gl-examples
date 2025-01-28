## Example: Hello World, now with Widgets

This is an evolution of our [Hello World](https://github.com/CartoDB/deck.gl-examples/tree/master/hello-world) example, with a few interesting additions such as charts and filters.

It showcases how to use [Widget models in CARTO](https://docs.carto.com/carto-for-developers/charts-and-widgets) to easily build interactive data visualizations that stay synchronized with the map, with added interactions such as filtering with inputs or by clicking in the charts.

The UI for the charts is built using [Apache eCharts](https://echarts.apache.org) but developers can plug their own charting or data visualization library.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/hello-world-with-widgets?file=index.ts)

> [!WARNING]
> Please make sure you recreate the `.env` file from this repository in your Stackblitz project.

Or run it locally:

```bash
npm install
# or
yarn
```

Commands:

- `npm run dev` is the development target, to serve the app and hot reload.
- `npm run build` is the production target, to create the final bundle and write to disk.
