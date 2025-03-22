const esbuild = require('esbuild')

esbuild.build({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  platform: 'node',
  external: ['vscode'],
  outfile: 'out/extension.js',
  sourcemap: true,
  format: 'cjs',
})
