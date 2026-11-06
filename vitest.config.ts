import { availableParallelism } from 'node:os'
import { defineConfig } from 'vitest/config'

function cpuCount() {
	try {
		return Math.max(1, availableParallelism())
	} catch {
		return 4
	}
}

const cores = process.env.VITEST_MAX_WORKERS ? Number(process.env.VITEST_MAX_WORKERS) || cpuCount() : cpuCount()

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['lib/**/*.spec.ts', 'test/harness/*.spec.ts', 'demo-browser/src/**/*.spec.ts'],
		bench: { include: ['test/bench/**/*.bench.ts', 'lib/**/*.bench.ts'] },
		setupFiles: ['./test/setup.ts'],
		pool: 'forks',
		fileParallelism: true,
		maxWorkers: cores,
		minWorkers: 1,
		coverage: {
			provider: 'v8',
			include: ['lib/**/*.ts'],
			exclude: ['lib/**/*.spec.ts', 'lib/util/logger.ts'],
			reporter: ['lcov', 'text-summary'],
		},
		testTimeout: 10000,
		hookTimeout: 10000,
	},
})
