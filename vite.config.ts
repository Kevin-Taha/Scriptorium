import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
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

export default defineConfig({
  base: './',
  plugins: [react(), pdfjsAssets()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
