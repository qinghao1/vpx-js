import { defineConfig } from 'tsup'
export default defineConfig({
	entry: {
		index: 'lib/index.ts',
		'lib/refs.node': 'lib/refs.node.ts',
		'lib/refs.browser': 'lib/refs.browser.ts',
		'bin/vbs2js': 'bin/vbs2js.ts',
		'bin/vpt2glb': 'bin/vpt2glb.ts',
		'bin/vptscript': 'bin/vptscript.ts',
		'bin/vbs-benchmark': 'bin/vbs-benchmark.ts',
	},
	format: ['esm'],
	dts: {
		entry: {
			index: 'lib/index.ts',
			'lib/refs.node': 'lib/refs.node.ts',
			'lib/refs.browser': 'lib/refs.browser.ts',
		},
	},
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
