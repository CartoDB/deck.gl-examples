
import {defineConfig} from 'vite';
import {getOcularConfig} from 'ocular-dev-tools';
import {join} from 'path';

const deckPath = join(__dirname, '../deck.gl');

/** https://vitejs.dev/config/ */
export default defineConfig(async () => {
  const {aliases} = await getOcularConfig({root: deckPath});

  return {
    resolve: {
      alias: {
        ...aliases,
        // Use root dependencies
        '@luma.gl': join(deckPath, './node_modules/@luma.gl'),
        '@math.gl': join(deckPath, './node_modules/@math.gl'),
        // '@loaders.gl/core': join(deckPath, './node_modules/@loaders.gl/core')
      }
    }
  };
});

