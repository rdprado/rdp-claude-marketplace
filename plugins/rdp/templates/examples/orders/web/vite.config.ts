// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Composition root — build, dev server and test configuration.
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter() })],
  server: {
    port: 5173,
    strictPort: true,
    // Coverage and the quality tools write reports here; watching them would reload the page.
    watch: { ignored: ['**/coverage/**', '**/target/**', '**/.metrics/**'] }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts']
    }
  }
});
