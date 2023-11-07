# CARTO deck.gl examples

[WIP]:construction: :construction_worker: :construction:
This repository contains examples to show case the different visualizations that can be achieved using [CARTO](https://carto.com) + [deck.gl](https://deck.gl).

All the examples can be executed locally or opened with [StackBlitz](https://stackblitz.com/).


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
```

Initialize deck.gl-examples 
```bash
cd deck.gl-examples
yarn
```

Link types:
```bash
cd deck.gl
yarn build
cd ../deck.gl-examples
cd ../<examples>/node_modules/@types
ln -s ../../../../deck.gl/modules/carto/typed deck.gl__carto
```

Execute the environment:
```bash
yarn dev-local 
# or
npm run dev-local
```