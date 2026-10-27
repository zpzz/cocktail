import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

/** 优先原生 esbuild；否则走 wasm（Node 下无需 initialize） */
function loadEsbuild() {
  try {
    return require('esbuild');
  } catch {
    return require('esbuild-wasm');
  }
}
const esbuild = loadEsbuild();

function walk(dir, filter) {
  const out = [];
  if (!fs.existsSync(dir)) {
    return out;
  }
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, filter));
    } else if (filter(full)) {
      out.push(full);
    }
  }
  return out;
}

function copyStatic() {
  const files = walk(src, (f) => /\.(wxml|wxss|json|png|jpg|jpeg|gif|svg)$/i.test(f));
  for (const file of files) {
    const rel = path.relative(src, file);
    const dest = path.join(dist, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
  // sitemap / project 级 json 已在 src
}

function sharedAlias() {
  return {
    '@cocktail/shared': path.resolve(root, '../../packages/shared/src/index.ts'),
  };
}

function jsBuildOptions({ sourcemap, minify }) {
  return {
    entryPoints: [
      path.join(src, 'app.ts'),
      ...walk(path.join(src, 'pages'), (f) => f.endsWith('.ts')),
      ...walk(path.join(src, 'components'), (f) => f.endsWith('.ts')),
    ],
    outdir: dist,
    outbase: src,
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2018'],
    sourcemap,
    minify,
    logLevel: 'info',
    charset: 'utf8',
    define: {
      'process.env.NODE_ENV': JSON.stringify(
        minify ? 'production' : 'development',
      ),
    },
    alias: sharedAlias(),
    loader: { '.ts': 'ts' },
    mainFields: ['module', 'main'],
    conditions: ['import', 'module', 'default'],
  };
}

function purgeSourceMaps() {
  for (const file of walk(dist, (f) => f.endsWith('.map'))) {
    fs.unlinkSync(file);
  }
}

async function buildJs() {
  await esbuild.build(jsBuildOptions({ sourcemap: false, minify: true }));
  purgeSourceMaps();
}

async function run() {
  fs.mkdirSync(dist, { recursive: true });
  copyStatic();
  await buildJs();
  console.log(`[app-mp] built → ${dist}`);
}

if (watch) {
  fs.mkdirSync(dist, { recursive: true });
  copyStatic();
  const ctx = await esbuild.context(
    jsBuildOptions({ sourcemap: true, minify: false }),
  );
  await ctx.watch();
  fs.watch(src, { recursive: true }, () => {
    try {
      copyStatic();
    } catch {
      // ignore
    }
  });
  console.log('[app-mp] watching…');
} else {
  await run();
}
