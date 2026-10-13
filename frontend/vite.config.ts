import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';

  // Hosts allowed to reach the dev/preview server through Cloudflare Tunnel.
  // Without this, Vite replies "Blocked request. This host is not allowed"
  // (HTTP 403) because the Host header is not localhost.
  const allowedHosts = [
    'adhiratasktracker.co.in',
    'www.adhiratasktracker.co.in',
    '.trycloudflare.com',
  ];

  const proxy = {
    '/api': {
      target: backendTarget,
      changeOrigin: true,
      secure: false,
    },
    '/socket.io': {
      target: backendTarget,
      changeOrigin: true,
      secure: false,
      ws: true,
    },
    '/uploads': {
      target: backendTarget,
      changeOrigin: true,
      secure: false,
    },
  };

  return {
    plugins: [react()],
    server: {
      allowedHosts,
      proxy,
    },
    // `npm run preview` (what you run on AWS) uses this block
    preview: {
      allowedHosts,
      proxy,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});