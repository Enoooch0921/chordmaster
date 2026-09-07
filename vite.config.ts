import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const isDevelopment = mode === 'development';
  const isCapacitorBuild = mode === 'capacitor' || env.VITE_APP_TARGET === 'capacitor';
  return {
    base: isCapacitorBuild ? './' : isDevelopment ? '/' : '/chordmaster/',
    plugins: [react(), tailwindcss(), {
      name: 'offline-build-assets',
      writeBundle(options, bundle) {
        const assets = Object.keys(bundle).filter((file) => /\.(js|css)$/.test(file)).sort();
        const version = createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 12);
        const worker = readFileSync(new URL('./public/sw.js', import.meta.url), 'utf-8')
          .replace("'chordmaster-pwa-v2'", JSON.stringify(`chordmaster-pwa-${version}`))
          .replace('const BUILD_ASSETS = [];', `const BUILD_ASSETS = ${JSON.stringify(assets.map((file) => `./${file}`))};`);
        writeFileSync(path.resolve(options.dir ?? 'dist', 'sw.js'), worker);
      },
    }],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      restoreMocks: true,
    },
  };
});
