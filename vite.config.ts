import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isSingleFile = process.env.SINGLEFILE === 'true';

export default defineConfig({
  plugins: isSingleFile ? [viteSingleFile()] : [],
  build: {
    target: 'es2022',
    sourcemap: !isSingleFile && process.env.CF_PAGES !== '1',
    chunkSizeWarningLimit: 1100
  }
});
