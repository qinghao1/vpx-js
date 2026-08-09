import fs from 'node:fs'
import { defineConfig } from 'vitest/config'

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

export default defineConfig({
	plugins: [rawLoader()],
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
				'lib/util/logger.ts',
				'lib/scripting/grammar/rules.ts',
			],
			reporter: ['lcov', 'text-summary'],
		},
		testTimeout: 10000,
		hookTimeout: 10000,
	},
	esbuild: { target: 'es2024' },
})
