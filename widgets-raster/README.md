## Example: CARTO Widgets over Raster sources

CARTO Widgets can also be used over raster sources, such as satellite imagery or continuous earth surface data, to create custom charts that help users explore and find insights quicker.

In this example we add a tree area chart over a raster covering land use in the US, powered by [Widget models in CARTO](https://docs.carto.com/carto-for-developers/charts-and-widgets) that allow it to stay synchronized with the map, with added interactions such as filtering with inputs or by clicking in the charts. For raster sources, widgets are calculated on the client side.

The UI for the charts is built using [Apache eCharts](https://echarts.apache.org) but developers can plug their own charting or data visualization library.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/widgets-raster?file=index.ts)

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
