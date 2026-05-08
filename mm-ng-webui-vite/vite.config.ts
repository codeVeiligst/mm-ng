import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const apiPaths = [
  '/aaa',
  '/auth',
  '/config',
  '/extensions',
  '/feeds',
  '/jobs',
  '/login',
  '/logout',
  '/metrics',
  '/prototype',
  '/status',
  '/supervisor',
  '/traced',
  '/validate',
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_MM_API_TARGET ?? 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api/status': {
          target,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          rewrite: () => '/status/minemeld',
        },
        '/api/supervisor': {
          target,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          rewrite: () => '/supervisor',
        },
        '/supervisor/status': {
          target,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          rewrite: () => '/supervisor',
        },
        '/api/logs/engine': {
          target,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          rewrite: () => '/logs/minemeld-engine.log',
        },
        '/api/logs/web': {
          target,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          rewrite: () => '/logs/minemeld-web.log',
        },
        '/api/login': {
          target,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          rewrite: () => '/login',
        },
        '/api/logout': {
          target,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          rewrite: () => '/logout',
        },
        ...Object.fromEntries(
          apiPaths.map((path) => [
            path,
            {
              target,
              changeOrigin: true,
              secure: false,
              xfwd: true,
            },
          ]),
        ),
      },
    },
  };
});
