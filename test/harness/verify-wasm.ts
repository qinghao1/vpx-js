// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Quick wasm build verifier — checks CMake, presets, dist, mock.
 * Run: npx tsx test/harness/verify-wasm.ts
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const root = process.cwd()
const wasmDir = path.join(root, 'wasm')
const checks: Array<[string, () => boolean]> = [
	['CMakeLists.txt exists', () => fs.existsSync(path.join(wasmDir, 'CMakeLists.txt'))],
	['modules/kernels CMake exists', () => fs.existsSync(path.join(wasmDir, 'modules/kernels/CMakeLists.txt'))],
	['modules/kernels source exists', () => fs.existsSync(path.join(wasmDir, 'modules/kernels/src/kernels.cpp'))],
	['modules/pinmame CMake exists', () => fs.existsSync(path.join(wasmDir, 'modules/pinmame/CMakeLists.txt'))],
	[
		'modules/pinmame patches exist',
		() => fs.existsSync(path.join(wasmDir, 'modules/pinmame/patches/0001-wasm-guard-__rolq-__rorq-for-WASM.patch')),
	],
	[
		'CMakeLists requires 3.28+',
		() => fs.readFileSync(path.join(wasmDir, 'CMakeLists.txt'), 'utf-8').includes('3.28'),
	],
	[
		'CMakeLists has EMSCRIPTEN guard',
		() => fs.readFileSync(path.join(wasmDir, 'CMakeLists.txt'), 'utf-8').includes('NOT EMSCRIPTEN'),
	],
	[
		'CMakeLists is umbrella (add_subdirectory)',
		() =>
			fs
				.readFileSync(path.join(wasmDir, 'CMakeLists.txt'), 'utf-8')
				.includes('add_subdirectory(modules/kernels)'),
	],
	[
		'CMakePresets has wasm+debug distinct dirs',
		() => {
			const j = JSON.parse(fs.readFileSync(path.join(wasmDir, 'CMakePresets.json'), 'utf-8'))
			const w = j.configurePresets.find((p: any) => p.name === 'wasm')
			const d = j.configurePresets.find((p: any) => p.name === 'debug')
			return w.binaryDir !== d.binaryDir
		},
	],
	['build.sh handles --mock', () => fs.readFileSync(path.join(wasmDir, 'build.sh'), 'utf-8').includes('--mock')],
	['build.sh mentions kernels', () => fs.readFileSync(path.join(wasmDir, 'build.sh'), 'utf-8').includes('kernels')],
	['mock file exists', () => fs.existsSync(path.join(wasmDir, 'mock/libpinmame.mock.js'))],
	['dist/libpinmame.js exists', () => fs.existsSync(path.join(wasmDir, 'dist/libpinmame.js'))],
	['dist/kernels.js exists', () => fs.existsSync(path.join(wasmDir, 'dist/kernels.js'))],
	['external/pinmame present', () => fs.existsSync(path.join(root, 'external/pinmame/src/libpinmame/libpinmame.h'))],
]

let pass = 0
for (const [name, fn] of checks) {
	try {
		const ok = fn()
		console.log(`${ok ? '\u2713' : '\u2717'} ${name}`)
		if (ok) pass++
	} catch (e) {
		console.log(`\u2717 ${name} — ${(e as Error).message}`)
	}
}
console.log(`\n${pass}/${checks.length} checks passed`)
if (pass !== checks.length) process.exit(1)
