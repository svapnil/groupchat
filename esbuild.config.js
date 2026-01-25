import esbuild from 'esbuild';
import { builtinModules } from 'node:module';

const isWatch = process.argv.includes('--watch');

// Plugin to stub out react-devtools-core (optional peer dep of ink)
const stubReactDevtoolsPlugin = {
  name: 'stub-react-devtools',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, args => ({
      path: args.path,
      namespace: 'react-devtools-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'react-devtools-stub' }, () => ({
      contents: 'export default { connectToDevTools: () => {} }',
      loader: 'js',
    }));
  },
};

// Node built-in modules (both with and without node: prefix)
const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
];

const config = {
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',

  // keytar (native), ws (CJS with dynamic requires), Node built-ins should be external
  external: ['keytar', 'ws', ...nodeBuiltins],

  // JSX configuration for React 17+ runtime
  jsx: 'automatic',
  jsxImportSource: 'react',

  // Add shebang and require shim for CJS packages
  banner: {
    js: `#!/usr/bin/env node
import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);`
  },

  // Keep readable for debugging
  minify: false,

  // Handle JSON imports
  loader: {
    '.json': 'json'
  },

  plugins: [stubReactDevtoolsPlugin],
};

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(config);
  console.log('Build complete');
}
