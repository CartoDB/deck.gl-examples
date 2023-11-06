## Example: 1.4M Points of Interest
Uses [Vite](https://vitejs.dev/) to bundle and serve files.

This visualization is using [Dynamic Tiling](https://carto.com/blog/dynamic-tiling-for-highly-performant-cloud-native-maps) to load millions of points of interest across the United States.

CARTO drastically reduces development and maintenance times for geospatial applications. POIs for the selected category are highlighted on the map using CARTO + deck.gl properties.


## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/dynamic-tiling-pois?file=index.ts)

Or run it locally:

```bash
npm install
# or
yarn
```

Commands:
* `npm dev` is the development target, to serve the app and hot reload.
* `npm run build` is the production target, to create the final bundle and write to disk.
