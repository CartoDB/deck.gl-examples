## Example: Boundaries

This example showcases how you can use CARTO + deck.gl to create highly-performant visualizations that combine large datasets and custom or known boundaries, such as zip codes or block groups.

A set of known boundaries is made available for free by CARTO. You can explore them at [https://boundaries-explorer.carto.com](https://boundaries-explorer.carto.com)

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/boundaries?file=index.ts)

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
