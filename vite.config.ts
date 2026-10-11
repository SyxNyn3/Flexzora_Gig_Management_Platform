import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // VITE_BASE_PATH lets CI publish the same app under any path — the public
  // demo site (flexzora-live repo) lives at /flexzora-live/, local dev at /.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
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
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts', 'date-fns'],
          ui: ['framer-motion', 'sonner', 'lucide-react'],
          forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
        },
      },
    },
  },
});
