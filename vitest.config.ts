import fs from 'node:fs'
import { availableParallelism } from 'node:os'
import { defineConfig } from 'vitest/config'

function cpuCount() {
	try {
		return Math.max(1, availableParallelism())
	} catch {
		return 4
	}
}

function rawLoader() {
	return {
		name: 'raw-loader',
		load(id: string) {
			const clean = id.split('?')[0].split('#')[0]
			if (clean.endsWith('.vbs') || clean.endsWith('.bnf')) {
				const content = fs.readFileSync(clean, 'utf-8')
				return `export default ${JSON.stringify(content)};`
			}
			return null
		},
	}
}

const cores = process.env.VITEST_MAX_WORKERS ? Number(process.env.VITEST_MAX_WORKERS) || cpuCount() : cpuCount()

export default defineConfig({
	plugins: [rawLoader()],
	test: {
		globals: true,
		environment: 'node',
		include: ['lib/**/*.spec.ts'],
		bench: { include: ['test/bench/**/*.bench.ts', 'lib/**/*.bench.ts'] },
		setupFiles: ['./test/setup.ts'],
		pool: 'forks',
		fileParallelism: true,
		maxWorkers: cores,
		minWorkers: 1,
		coverage: {
			provider: 'v8',
			include: ['lib/**/*.ts'],
			exclude: ['lib/**/*.spec.ts', 'lib/util/logger.ts', 'lib/scripting/grammar/rules.ts'],
			reporter: ['lcov', 'text-summary'],
		},
		testTimeout: 10000,
		hookTimeout: 10000,
	},
	esbuild: { target: 'es2024' },
})
