// Bundles the Electron main process and the two preload scripts with esbuild.
// Preloads are bundled to single files because sandboxed preloads cannot require local modules.
import { build } from 'esbuild';

const watch = process.argv.includes('--watch');
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: 'linked',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
};

const entries = [
  { entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js' },
  { entryPoints: ['src/preload/ui.ts'], outfile: 'dist/preload/ui.js' },
  { entryPoints: ['src/preload/page.ts'], outfile: 'dist/preload/page.js' },
];

if (watch) {
  const { context } = await import('esbuild');
  for (const e of entries) (await context({ ...common, ...e })).watch();
} else {
  await Promise.all(entries.map((e) => build({ ...common, ...e })));
}
