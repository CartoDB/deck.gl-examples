# CARTO + deck.gl examples

:art:

This repository is a collection of examples tailored by the [CARTO](https://carto.com) team to showcase different possibilities when developing with CARTO and [deck.gl](https://deck.gl). 

CARTO + deck.gl is the best way to build large-scale geospatial applications. It is scalable, performant, easy to set up, and doesn't require you to migrate your data or build a complex backend. If you're new to CARTO or deck.gl, we recommend you to read our [Documentation](https://docs.carto.com/carto-for-developers/carto-for-deck.gl) first.

All data in the examples is being queried live from a data warehouse (EG: _Google BigQuery, Snowflake, Amazon Redshift, Databricks, PostgreSQL..._), using a connection previously created in CARTO. For these examples we already created and maintain that connection, but you can [connect your data](https://docs.carto.com/getting-started/quickstart-guides/connecting-to-your-data) and create your own examples and applications at any time. 


## Running the examples

All the examples can be executed locally in your computer or opened with [StackBlitz](https://stackblitz.com/).


## Locally setup with deck.gl master branch

All the examples have a script `dev-local` that can be used to link with the `master` branch of https://github.com/visgl/deck.gl.

In order to use those scripts you need to do the following.

Firts, clone both repos:
```
git clone https://github.com/visgl/deck.gl
git clone https://github.com/CartoDB/deck.gl-examples
```

Initialize deck.gl 
```bash
cd deck.gl
yarn 
yarn bootstrap
# yarn build to refresh in the future
```

Link all
```bash
cd modules/<module>
yarn link
```

Initialize deck.gl-examples 
```bash
cd deck.gl-examples
yarn 
yarn link-deck
# yarn unlink-deck
```

Execute the environment:
```bash
yarn dev-local 
# or
npm run dev-local
```