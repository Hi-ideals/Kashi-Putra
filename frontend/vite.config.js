import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Default backend URL: read PORT from ../backend/.env so the two always match. */
function backendFromEnvFile() {
  try {
    const txt = fs.readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8');
    const m = txt.match(/^\s*PORT\s*=\s*(\d+)/m);
    if (m) return `http://127.0.0.1:${m[1]}`;
  } catch { /* no backend/.env */ }
  return 'http://127.0.0.1:5000';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_BACKEND_URL || backendFromEnvFile();
  console.log(`  API proxy → ${target}`);
  const proxy = Object.fromEntries(['/api', '/uploads', '/manifest.webmanifest', '/pwa-icon-192.png', '/pwa-icon-512.png', '/sitemap.xml', '/robots.txt']
    .map((p) => [p, { target, changeOrigin: true, configure: (proxy) => proxy.on('error', (err, req, res) => { if (res && !res.headersSent && res.writeHead) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: `Cannot reach the backend at ${target}. Is \"npm run dev\" running in the backend folder?` })); } }) }]));
  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 900,
      rollupOptions: { output: { manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom', 'axios'] } } },
    },
  };
});
