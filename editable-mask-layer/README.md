## Example: Editable mask layer to filter layers and widgets

A simple example that showcases how to use the `EditableGeoJsonLayer` from `@deck.gl-community/editable-layers` to draw, edit and remove polygons on the map.

We use those polygons in the the `MaskExtension` from `@deck.gl/extensions` to filter locally the CARTO map layer and the `createPolygonSpatialFilter` from `@carto/api-client` to filter the widgets built using CARTO.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/editable-mask-layer?file=index.ts)

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
