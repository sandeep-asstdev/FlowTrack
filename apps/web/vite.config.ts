import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Production API URL — live Render backend URL fallback if explicitly set
const PRODUCTION_API_URL = 'https://flowtrack-api-rss4.onrender.com/api/v1';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isDev = mode === 'development';

  const googleClientId =
    env.VITE_GOOGLE_CLIENT_ID ||
    process.env.VITE_GOOGLE_CLIENT_ID ||
    '954853707879-khbiv8su3of67ih08vfflpj2vanqbj2j.apps.googleusercontent.com';

  // Use .env value if set, otherwise use local 3001 port by default to prevent sleeping Render cold-start latency
  const apiUrl =
    env.VITE_API_URL ||
    process.env.VITE_API_URL ||
    (process.env.BUILD_FOR_RENDER ? PRODUCTION_API_URL : 'http://localhost:3001/api/v1');

  const socketUrl =
    env.VITE_SOCKET_URL ||
    process.env.VITE_SOCKET_URL ||
    (process.env.BUILD_FOR_RENDER ? 'https://flowtrack-api-rss4.onrender.com' : 'http://localhost:3001');

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
      'import.meta.env.VITE_SOCKET_URL': JSON.stringify(socketUrl),
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-flow': ['@xyflow/react'],
            'vendor-icons': ['lucide-react'],
            'vendor-socket': ['socket.io-client'],
          },
        },
      },
    },
    server: {
      port: 5173,
      host: true,
    },
    test: {
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    },
  };
});
