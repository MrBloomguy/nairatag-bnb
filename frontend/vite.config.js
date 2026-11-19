import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  resolve: {
    alias: [
      {
        find: /^@circle-fin\/swap-kit$/,
        replacement: path.resolve(__dirname, 'src/shims/circle-swap-kit.js'),
      },
      {
        find: /^@circle-fin\/adapter-viem-v2$/,
        replacement: path.resolve(__dirname, 'src/shims/circle-swap-kit.js'),
      },
      {
        find: /^@privy-io\/react-auth$/,
        replacement: path.resolve(__dirname, 'src/shims/privy-auth.jsx'),
      },
    ],
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
