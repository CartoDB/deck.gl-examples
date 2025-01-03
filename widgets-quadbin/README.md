## Example: CARTO Widgets over Quadbin Spatial Index sources

This is an evolution of our [Quadbin example](https://github.com/CartoDB/deck.gl-examples/tree/master/spatial-features-quadbin), adding charts and filtering capabilities.

It showcases how to use [Widget models in CARTO](https://docs.carto.com/carto-for-developers/charts-and-widgets) to easily build interactive data visualizations that stay synchronized with the map, with added interactions such as filtering with inputs or by clicking in the charts. And in this case, how to integrate them into spatial index sources, such as H3 and Quadbin, for optimal performance and scalability.

The UI for the charts is built using [Chart JS](https://www.chartjs.org/) but developers can plug their own charting or data visualization library.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/widgets-quadbin?file=index.ts)

Or run it locally:

```bash
npm install
# or
yarn
```

Commands:

- `npm dev` is the development target, to serve the app and hot reload.
- `npm run build` is the production target, to create the final bundle and write to disk.
