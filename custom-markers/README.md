## Example: Custom Markers

This visualization is using [Dynamic Tiling](https://carto.com/blog/dynamic-tiling-for-highly-performant-cloud-native-maps) to load millions of points of interest represented with custom markers across the United States. Custom markers for the selected category are filtered in the server by query parameters and uses a deck.gl CollisionFilterExtension to hide markers that overlap with other markers.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/custom-markers?file=index.ts)

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
