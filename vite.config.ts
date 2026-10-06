import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const learningReleaseApproved = false; // Await the owner's review of this content revision.

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
  // Owner review is pending. This compile-time gate also excludes draft chunks.
  // Set true only for the explicitly approved content revision.
  define: { __LEARNING_RELEASE_APPROVED__: JSON.stringify(learningReleaseApproved) },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
