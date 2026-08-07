import { defineConfig } from 'vitest/config'
export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['lib/**/*.spec.ts'],
		setupFiles: ['./test/setup.ts'],
		fileParallelism: false,
		pool: 'forks',
		coverage: {
			provider: 'v8',
			include: ['lib/**/*.ts'],
			exclude: [
				'lib/**/*.spec.ts',
				'lib/gltf/gltf-exporter.ts',
				'lib/util/logger.ts',
				'lib/render/threejs/vendor/**',
				'lib/scripting/grammar/rules.ts',
			],
			reporter: ['lcov', 'text-summary'],
		},
		testTimeout: 10000,
		hookTimeout: 10000,
	},
	esbuild: { target: 'es2024' },
})
