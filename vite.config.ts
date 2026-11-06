import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // VITE_BASE_PATH lets CI publish the same app under any path — the public
  // demo site (flexzora-live repo) lives at /flexzora-live/, local dev at /.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    allowedHosts: ['.trycloudflare.com'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        // Vite 8 is rolldown-based: the Rollup object form of `manualChunks`
        // is gone, so vendor splitting is expressed as `codeSplitting` groups.
        // Each `test` regex is anchored to the package directory inside
        // node_modules so e.g. `react` doesn't also swallow `react-dom` or
        // `@radix-ui/react-*` — matching the old per-package manualChunks map.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router-dom|react-router|scheduler)[\\/]/,
            },
            {
              name: 'supabase',
              test: /node_modules[\\/]@supabase[\\/]/,
            },
            {
              name: 'charts',
              test: /node_modules[\\/](recharts|date-fns)[\\/]/,
            },
            {
              name: 'ui',
              test: /node_modules[\\/](framer-motion|sonner|lucide-react)[\\/]/,
            },
            {
              name: 'forms',
              test: /node_modules[\\/](react-hook-form|zod|@hookform[\\/]resolvers)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
