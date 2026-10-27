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
const prod = process.argv.includes('--prod');

/** 优先原生 esbuild；否则走 wasm（Node 下无需 initialize） */
function loadEsbuild() {
  try {
    return require('esbuild');
  } catch {
    return require('esbuild-wasm');
  }
}
const esbuild = loadEsbuild();

function argValue(name) {
  const prefix = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : '';
}

/** 简单解析 KEY=VALUE（支持 # 注释） */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const i = trimmed.indexOf('=');
    if (i <= 0) {
      continue;
    }
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function resolveBackendUrls() {
  const fileName = prod ? 'deploy.env' : 'deploy.local.env';
  const fromFile = loadEnvFile(path.join(root, fileName));
  // 生产必须能读到云地址；本地可用默认局域网
  const defaults = {
    api: 'http://192.168.5.206:8080',
    media: 'http://192.168.5.206:8000',
  };

  const api =
    argValue('--api') ||
    process.env.MP_API_BASE_URL ||
    fromFile.MP_API_BASE_URL ||
    (prod ? '' : defaults.api);
  const media =
    argValue('--media') ||
    process.env.MP_MEDIA_BASE_URL ||
    fromFile.MP_MEDIA_BASE_URL ||
    (prod ? '' : defaults.media);

  if (!api || !media) {
    console.error(
      '[app-mp] 缺少后端地址。请复制 deploy.env.example 为 deploy.env 并填写，或传参：\n' +
        '  --api=http://公网IP:8080 --media=http://公网IP:8000',
    );
    process.exit(1);
  }
  if (prod && /你的公网IP|example\.com|YOUR_/i.test(`${api}${media}`)) {
    console.error('[app-mp] deploy.env 仍是占位符，请改成真实云服务器地址');
    process.exit(1);
  }

  return {
    api: api.replace(/\/$/, ''),
    media: media.replace(/\/$/, ''),
  };
}

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
}

function sharedAlias() {
  return {
    '@cocktail/shared': path.resolve(root, '../../packages/shared/src/index.ts'),
  };
}

function jsBuildOptions({ sourcemap, minify, api, media }) {
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
      __MP_API_BASE_URL__: JSON.stringify(api),
      __MP_MEDIA_BASE_URL__: JSON.stringify(media),
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

async function buildJs(urls) {
  await esbuild.build(
    jsBuildOptions({ sourcemap: false, minify: true, ...urls }),
  );
  purgeSourceMaps();
}

async function run() {
  const urls = resolveBackendUrls();
  console.log(`[app-mp] API   = ${urls.api}`);
  console.log(`[app-mp] MEDIA = ${urls.media}`);
  fs.mkdirSync(dist, { recursive: true });
  copyStatic();
  await buildJs(urls);
  console.log(`[app-mp] built → ${dist}${prod ? ' (prod)' : ''}`);
}

if (watch) {
  const urls = resolveBackendUrls();
  console.log(`[app-mp] API   = ${urls.api}`);
  console.log(`[app-mp] MEDIA = ${urls.media}`);
  fs.mkdirSync(dist, { recursive: true });
  copyStatic();
  const ctx = await esbuild.context(
    jsBuildOptions({ sourcemap: true, minify: false, ...urls }),
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
