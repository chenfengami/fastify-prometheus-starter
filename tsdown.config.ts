import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  platform: 'node',
  target: 'node22',
  format: ['esm'],
  // package.json declares type: module; retain npm start's server.js path.
  fixedExtension: false,
  sourcemap: false,
  clean: true,
  // This executable service does not publish a library API.
  dts: false,
  // Runtime dependencies are installed separately, as in the previous build.
  deps: { neverBundle: [/^[^./]/] },
});
