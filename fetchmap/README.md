## Example: fetchMap

This example demonstrates how to use the `fetchMap` function from `@carto/api-client` (version 0.5.5 or higher) to retrieve the configuration of a map created in CARTO Builder and render it using Deck.gl. Developers can then customize those layers and integrate them in their own application layers. This enables developers to collaborate with cartographers and other non-developers who will create layers directlly in CARTO, and greatly reduces the time to create an application.

Check the [documentation and technical reference for fetchMap](https://docs.carto.com/carto-for-developers/reference/fetchmap) to learn more.

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
