import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Owner approved review b107923 on 2026-10-06 and requested GitHub sync + deployment.
// This approval applies to the eight lessons and fourteen exercises in that revision.
const learningReleaseApproved = true;

export default defineConfig(({ command }) => ({
  base: '/',
  publicDir: 'public',
  plugins: [react(), {
    name: 'legacy-fieldbook-directory',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (/^\/fieldbook\/?(?:\?|$)/.test(request.url ?? '')) request.url = request.url!.replace(/^\/fieldbook\/?/, '/fieldbook/index.html');
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (/^\/fieldbook\/?(?:\?|$)/.test(request.url ?? '')) request.url = request.url!.replace(/^\/fieldbook\/?/, '/fieldbook/index.html');
        next();
      });
    },
  }, {
    name: 'exclude-unapproved-learning',
    enforce: 'pre',
    resolveId(source, importer) {
      if (command === 'build' && !learningReleaseApproved
        && importer?.replaceAll('\\', '/').endsWith('/src/learning/access.ts')
        && (source === './catalog' || source === './practice')) {
        return fileURLToPath(new URL('./src/learning/emptyContent.ts', import.meta.url));
      }
      return null;
    },
  }],
  // Compile-time gate for the explicitly approved content revision.
  // A future unapproved content batch must return to preview-only status.
  define: { __LEARNING_RELEASE_APPROVED__: JSON.stringify(learningReleaseApproved) },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
