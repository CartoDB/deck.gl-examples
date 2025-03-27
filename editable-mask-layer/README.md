## Example: Formula widget + Editable mask layer

A simple example that showcases how to build a scalable [Formula widget](https://docs.carto.com/carto-for-developers/reference/carto-widgets-reference/models/getformula) using CARTO + deck.gl that stays synchronized with the map, using large-scale data coming from the same cloud data warehouse as your maps.

This examples also showcases how to use the `EditableGeoJsonLayer` from `@deck.gl-community/editable-layers` to draw, edit and remove polygons on the map

This example integrates the result with the `MaskExtension` from `@deck.gl/extensions` to filter the map layer on the client side and the `createPolygonSpatialFilter` from `@carto/api-client` to integrate the widgets on the server side.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/widgets-formula?file=index.ts)

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
