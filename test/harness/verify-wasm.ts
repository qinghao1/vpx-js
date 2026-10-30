// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Quick wasm build verifier — checks CMake, presets, dist, mock, plus behavioral
 * checks: imports dist/kernels.js and calls an export through the real loader,
 * and verifies mock-vs-real loader consistency (same required surface).
 * Run: npx tsx test/harness/verify-wasm.ts
 * Exit: 0 all pass, 1 any failure.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getWasmBatchHitViewsOutCircle, getWasmKernels } from '../../lib/physics/wasm/kernels.js'

const root = process.cwd()
const wasmDir = path.join(root, 'wasm')
const readWasmFile = (rel: string): string => fs.readFileSync(path.join(wasmDir, rel), 'utf-8')
const checks: Array<[string, () => boolean]> = [
	['CMakeLists.txt exists', () => fs.existsSync(path.join(wasmDir, 'CMakeLists.txt'))],
	['modules/kernels CMake exists', () => fs.existsSync(path.join(wasmDir, 'modules/kernels/CMakeLists.txt'))],
	['modules/kernels source exists', () => fs.existsSync(path.join(wasmDir, 'modules/kernels/src/kernels.cpp'))],
	['modules/pinmame CMake exists', () => fs.existsSync(path.join(wasmDir, 'modules/pinmame/CMakeLists.txt'))],
	[
		'modules/pinmame patches exist',
		() =>
			fs.existsSync(
				path.join(wasmDir, 'modules/pinmame/patches/0001-wasm-make-update_display-polling-safe.patch'),
			),
	],
	['CMakeLists requires 3.28+', () => readWasmFile('CMakeLists.txt').includes('3.28')],
	['CMakeLists has EMSCRIPTEN guard', () => readWasmFile('CMakeLists.txt').includes('NOT EMSCRIPTEN')],
	[
		'CMakeLists is umbrella (kernels + pinmame)',
		() =>
			readWasmFile('CMakeLists.txt').includes('add_subdirectory(modules/kernels)') &&
			readWasmFile('CMakeLists.txt').includes('add_subdirectory(modules/pinmame)'),
	],
	[
		'CMakePresets has wasm+debug distinct dirs',
		() => {
			const presets = JSON.parse(readWasmFile('CMakePresets.json')) as {
				configurePresets: Array<{ name: string; binaryDir: string }>
			}
			const wasm = presets.configurePresets.find(preset => preset.name === 'wasm')
			const debug = presets.configurePresets.find(preset => preset.name === 'debug')
			return wasm.binaryDir !== debug.binaryDir
		},
	],
	['build.sh handles --mock', () => readWasmFile('build.sh').includes('--mock')],
	['build.sh mentions kernels', () => readWasmFile('build.sh').includes('kernels')],
	['mock file exists', () => fs.existsSync(path.join(wasmDir, 'mock/libpinmame.mock.js'))],
	['dist/libpinmame.js exists', () => fs.existsSync(path.join(wasmDir, 'dist/libpinmame.js'))],
	['dist/kernels.js exists', () => fs.existsSync(path.join(wasmDir, 'dist/kernels.js'))],
	['external/pinmame present', () => fs.existsSync(path.join(root, 'external/pinmame/src/libpinmame/libpinmame.h'))],
]

let pass = 0
let total = 0
function report(ok: boolean, name: string, detail?: string): void {
	total++
	if (ok) pass++
	console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

for (const [name, fn] of checks) {
	try {
		report(fn(), name)
	} catch (error) {
		report(false, name, (error as Error).message)
	}
}

// ---- Behavioral: import dist/kernels.js directly and call one export ----
try {
	const kernelsUrl = path.join(wasmDir, 'dist/kernels.js')
	const kernelsMod = (await import(kernelsUrl)) as { default: (opts?: unknown) => Promise<any> }
	report(typeof kernelsMod.default === 'function', 'dist/kernels.js has default factory export')
	const direct = await kernelsMod.default()
	const batchExports = [
		'_batchHitTestCircle',
		'_batchHitTestPlane',
		'_batchHitTestLineZ',
		'_batchHitTestPoint',
		'_batchHitTestTriangle',
		'_batchHitTestLineSeg',
		'_batchHitTestLine3D',
		'_batchHitTestPoly',
		'_batchElasticityWithFalloff',
	]
	const missing = batchExports.filter(k => typeof direct[k] !== 'function')
	report(missing.length === 0, 'dist/kernels.js exposes all 9 batch exports', missing.join(', ') || undefined)
	const ptr = direct._malloc(64)
	report(typeof ptr === 'number' && ptr !== 0, '_malloc(64) returns a live pointer')
	direct._free(ptr)
	report(true, '_free(pointer) round-trip without throw')
} catch (error) {
	report(false, 'dist/kernels.js import + export call', (error as Error).message)
}

// ---- Behavioral: same module through the real loader, with hit/miss results ----
try {
	const mod = await getWasmKernels()
	report(typeof mod._batchHitTestCircle === 'function', 'loader getWasmKernels() resolves callable module')
	const miss = getWasmBatchHitViewsOutCircle(1)
	miss.cx[0] = 100
	miss.cy[0] = 100
	miss.cr[0] = 25
	miss.zl[0] = 0
	miss.zh[0] = 100
	miss.run(0, 0, 50, 0, 0, 0, 25, 0.016)
	report(miss.oT[0] === -1, 'loader circle query reports clean miss (oT=-1)', `oT=${miss.oT?.[0]}`)
	const hit = getWasmBatchHitViewsOutCircle(1)
	hit.cx[0] = 0
	hit.cy[0] = 60
	hit.cr[0] = 25
	hit.zl[0] = 0
	hit.zh[0] = 100
	hit.run(0, 0, 50, 0, 100, 0, 25, 1)
	const t = hit.oT?.[0] ?? Number.NaN
	report(t >= 0 && t <= 1, 'loader circle query reports hit within dt', `oT=${t}`)
} catch (error) {
	report(false, 'loader kernels hit/miss behavior', (error as Error).message)
}

// ---- Behavioral: mock-vs-real loader consistency (same required surface) ----
const LOADER_SURFACE = ['cwrap', 'HEAPU8', 'FS', '_malloc', '_free', 'getValue', 'stringToUTF8', 'lengthBytesUTF8']
function surfaceGaps(m: any): string[] {
	const gaps: string[] = []
	for (const key of LOADER_SURFACE) {
		const v = m?.[key]
		if (v === undefined || v === null) gaps.push(key)
		else if ((key === 'cwrap' || key === '_malloc' || key === '_free') && typeof v !== 'function') gaps.push(key)
	}
	if (!(m?.HEAPU8 instanceof Uint8Array) || m.HEAPU8.length === 0) gaps.push('HEAPU8(non-empty-Uint8Array)')
	if (typeof m?.FS?.mkdirTree !== 'function') gaps.push('FS.mkdirTree')
	return gaps
}
try {
	const { createPinmameModule } = await import('../../lib/emu/pinmame/pinmame-loader.js')
	const distExists = fs.existsSync(path.join(wasmDir, 'dist/libpinmame.js'))
	const real = await createPinmameModule()
	report(
		real.isMock === !distExists,
		'loader selects real iff dist exists (mock iff missing)',
		`isMock=${real.isMock} distExists=${distExists}`,
	)
	const realGaps = surfaceGaps(real.module)
	report(realGaps.length === 0, 'real module exposes loader surface', realGaps.join(', ') || undefined)
	const mockMod = (await import(path.join(wasmDir, 'mock/libpinmame.mock.js'))) as {
		default: () => Promise<any>
		isMock?: boolean
	}
	report(mockMod.isMock === true, 'mock module flags isMock=true')
	const mock = await mockMod.default()
	const mockGaps = surfaceGaps(mock)
	report(mockGaps.length === 0, 'mock module exposes same loader surface', mockGaps.join(', ') || undefined)
	report(typeof mock.cwrap('x', null, [] as string[]) === 'function', 'mock cwrap returns callable stub')
} catch (error) {
	report(false, 'mock-vs-real loader consistency', (error as Error).message)
}

console.log(`\n${pass}/${total} checks passed`)
if (pass !== total) process.exit(1)
