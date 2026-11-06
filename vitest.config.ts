// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		globals: true,
		include: ['lib/**/*.spec.ts', 'test/harness/*.spec.ts', 'demo-browser/src/**/*.spec.ts'],
		bench: { include: ['test/bench/**/*.bench.ts', 'lib/**/*.bench.ts'] },
		setupFiles: ['./test/setup.ts'],
		coverage: {
			provider: 'v8',
			include: ['lib/**/*.ts'],
			exclude: ['lib/**/*.spec.ts', 'lib/util/logger.ts'],
			reporter: ['lcov', 'text-summary'],
		},
		testTimeout: 10000,
	},
})
