import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	define: { global: 'globalThis' },
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
		setupFiles: ['src/test-setup.ts'],
		// Run the provider through Vite so its dependencies resolve to their ESM builds.
		server: { deps: { inline: ['@walletconnect/universal-provider'] } }
	}
});
