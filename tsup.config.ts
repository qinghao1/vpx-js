import { defineConfig } from 'tsup'
export default defineConfig({
	entry: {
		index: 'lib/index.ts',
		'lib/refs.node': 'lib/refs.node.ts',
		'lib/refs.browser': 'lib/refs.browser.ts',
	},
	format: ['esm'],
	// NOTE: tsup cannot bundle declarations here (its dts bundler needs the
	// legacy TypeScript compiler API); build:dts emits them with tsc instead.
	dts: false,
	splitting: false,
	sourcemap: true,
	clean: true,
	target: 'es2024',
	shims: false,
	treeshake: false,
	skipNodeModulesBundle: true,
	esbuildOptions(options) {
		options.loader = { ...options.loader, '.node': 'ts', '.vbs': 'text', '.bnf': 'text' }
	},
})
