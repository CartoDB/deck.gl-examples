## Example: fetchMap

This example demonstrates how to use the `fetchMap` function from `@carto/api-client` (version 0.5.2 or higher) to retrieve the configuration of a map created in CARTO Builder and render it using Deck.gl.

## Description

The application initializes a Deck.gl instance, fetches map data (including layers, initial view state, and other configurations) using a specific `mapId`, and then renders the map.

It also displays two simple widgets:

1.  **Map Name**: Shows the title of the fetched CARTO map.
2.  **Number of Layers**: Shows the count of layers in the fetched CARTO map.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/fetchmap?file=index.ts)

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
