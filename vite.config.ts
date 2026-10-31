import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

/**
 * Serves (dev) and emits (build) the pdf.js runtime assets — CMaps, standard
 * fonts, and WASM decoders — under `/pdfjs/` so documents with CJK text,
 * non-embedded fonts, or JPEG2000 images render correctly offline.
 */
function pdfjsAssets(): Plugin {
  return {
    name: 'scriptorium:pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const [dir] = rel.split('/');
        const file = path.resolve(pdfjsRoot, rel);
        if (!PDFJS_ASSET_DIRS.includes(dir) || !file.startsWith(pdfjsRoot)) return next();
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader('Cache-Control', 'public, max-age=86400');
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const dir of PDFJS_ASSET_DIRS) {
        const abs = path.join(pdfjsRoot, dir);
        for (const name of readdirSync(abs)) {
          const file = path.join(abs, name);
          if (!statSync(file).isFile()) continue;
          this.emitFile({ type: 'asset', fileName: `pdfjs/${dir}/${name}`, source: readFileSync(file) });
        }
      }
    },
  };
}

/**
 * Gives the built app a strict Content-Security-Policy: everything comes from its own origin, and
 * the one inline script (the pre-paint theme) is allowed by a hash taken from the final markup so
 * the two can't drift. Covers and thumbnails are `data:` URLs. The dev server is left without a
 * policy because Vite injects inline scripts for hot reloading.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'scriptorium:content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
        const hashes = inlineScripts.map(
          ([, source]) => `'sha256-${createHash('sha256').update(source).digest('base64')}'`,
        );
        const policy = [
          "default-src 'self'",
          ["script-src 'self'", ...hashes].join(' '),
          "style-src 'self'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "worker-src 'self'",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ');
        return [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}

function offlineApp(): Plugin {
  let outDir: string;
  return {
    name: 'scriptorium:offline-app',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle: {
      order: 'post',
      handler() {
        const files = (directory: string): string[] =>
          readdirSync(path.join(outDir, directory), { withFileTypes: true }).flatMap((entry) => {
            const name = path.posix.join(directory, entry.name);
            return entry.isDirectory() ? files(name) : [name];
          });
        const urls = files('')
          .filter(
            (name) =>
              name === 'index.html' ||
              name === 'manifest.webmanifest' ||
              name === 'favicon.svg' ||
              name.startsWith('icons/') ||
              name.startsWith('assets/') ||
              name.startsWith('pdfjs/'),
          )
          .sort();
        const template = readFileSync(
          fileURLToPath(new URL('./src/app/pwa/service-worker.js', import.meta.url)),
          'utf8',
        );
        const hash = createHash('sha256').update(template);
        for (const name of urls) hash.update(name).update(readFileSync(path.join(outDir, name)));
        const source = template
          .replace('__PRECACHE_URLS__', JSON.stringify(urls.map((name) => `./${name}`)))
          .replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 16));
        writeFileSync(path.join(outDir, 'sw.js'), source);
      },
    },
  };
}

export default defineConfig({
  base: './',
  // Browser storage belongs to an exact address, so a fallback port would open an empty library.
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  plugins: [react(), pdfjsAssets(), contentSecurityPolicy(), offlineApp()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
