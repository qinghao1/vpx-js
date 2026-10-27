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

function defaultWorkers() {
	return Math.max(1, cpuCount() - 1)
}

function resolveWorkers() {
	const raw = process.env.VITEST_MAX_WORKERS
	if (raw == null || raw === '') return defaultWorkers()
	if (raw.trim().endsWith('%')) {
		const pct = Number.parseFloat(raw) / 100
		if (Number.isFinite(pct) && pct > 0) return Math.max(1, Math.round(cpuCount() * pct))
		return defaultWorkers()
	}
	const n = Number.parseInt(raw, 10)
	return Number.isFinite(n) && n > 0 ? n : defaultWorkers()
}

const workers = resolveWorkers()

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
		maxWorkers: workers,
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
