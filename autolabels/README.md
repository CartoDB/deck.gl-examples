## Example: Auto Labels

This example demonstrates the [autoLabels feature of VectorTileLayer](https://deck.gl/docs/api-reference/carto/vector-tile-layer#autolabels), which automatically generates labels for polygon and line features.

The example includes two demonstrations:
- **Polygons**: US counties with labels at their centroids, styled by population
- **Lines**: Bristol UK cycle network with labels along routes, styled by status

The `autoLabels` property enables automatic label generation with collision resolution (ie: non-overlapping) for lines and polygons, making it easy to add readable labels to geographic features such as zipcodes or roads without manual label placement.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/autolabels?file=index.ts)

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
