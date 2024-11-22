## Example: SQL Named Sources (Accidents by State)

This example is similar to the [query-accidents](../query-accidents/) example, but it leverages CARTO [Named Sources](https://docs.carto.com/carto-user-manual/developers/named-sources) instead of directly using SQL queries in the application.

By using Named Sources, we prevent SQL queries from being exposed in the code or the network requests made by the application, reducing the surface for attacks and hiding the business logic in our application. The architecture of the application is still lightweight, efficient and modern, and there is no performance or overhead by using Named Sources.

Uses [Vite](https://vitejs.dev/) to bundle and serve files.

## Usage

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/CartoDB/deck.gl-examples/tree/master/sql-named-sources?file=index.ts)

Or run it locally:

```bash
npm install
# or
yarn
```

Commands:

- `npm dev` is the development target, to serve the app and hot reload.
- `npm run build` is the production target, to create the final bundle and write to disk.
