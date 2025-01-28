## Example: Spatial Index H3

This is a great example on how performant spatial indexes are to visualize and operate with large geospatial datasets. In this case we're using a dataset based in an hexagonal grid (H3), from our CARTO Data Observatory. This datasets includes demographic, financial, and environmental variables across the US. CARTO + deck.gl offer native support for spatial indexes. If you want to learn more about spatial indexes, we recommend you to check our [Spatial Indexes 101 guide](https://go.carto.com/report-spatial-indexes-101).

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/spatial-features-h3?file=index.ts)

> [!WARNING]
> Please make sure you recreate the `.env` file from this repository in your Stackblitz project.

Or run it locally:

```bash
npm install
# or
yarn
```

Commands:

- `npm dev` is the development target, to serve the app and hot reload.
- `npm run build` is the production target, to create the final bundle and write to disk.
