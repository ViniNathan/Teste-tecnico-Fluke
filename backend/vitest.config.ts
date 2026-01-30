import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		setupFiles: ['./tests/setup.ts'],
		clearMocks: true,
		restoreMocks: true,
		globals: true,
		testTimeout: 20000,
		pool: 'threads',
		maxWorkers: 1,
	},
});
