// Bundles the API and worker entrypoints for production (`node dist/api.js`).
// Workspace packages are bundled in (they are TypeScript sources); everything
// resolved from node_modules stays external so native modules keep working.
import { build } from 'esbuild';
import './build-widget.mjs';

/** @type {import('esbuild').Plugin} */
const externalizeNodeModules = {
  name: 'externalize-node-modules',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith('@clipsubtitles/')) return undefined; // bundle workspace code
      if (args.path.startsWith('node:')) return { path: args.path, external: true };
      return { path: args.path, external: true };
    });
  },
};

const entries = {
  api: 'src/bin/api.ts',
  worker: 'src/bin/worker.ts',
  'worker-push': 'src/bin/worker-push.ts',
  'runtime-check': 'src/bin/runtime-check.ts',
};

for (const [name, entry] of Object.entries(entries)) {
  await build({
    entryPoints: [entry],
    outfile: `dist/${name}.js`,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    sourcemap: true,
    logLevel: 'info',
    plugins: [externalizeNodeModules],
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
  });
}
