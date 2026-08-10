// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const wasmDir = path.join(root, 'wasm')
const distJs = path.join(wasmDir, 'dist/libpinmame.js')
const distWasm = path.join(wasmDir, 'dist/libpinmame.wasm')
const _mockJs = path.join(wasmDir, 'mock/libpinmame.mock.js')
const cmakeLists = path.join(wasmDir, 'CMakeLists.txt')
const presets = path.join(wasmDir, 'CMakePresets.json')
const buildSh = path.join(wasmDir, 'build.sh')

describe('WASM build artifacts', () => {
	it('CMakeLists.txt is modern (umbrella, min 3.28, EMSCRIPTEN, add_subdirectory)', () => {
		const txt = fs.readFileSync(cmakeLists, 'utf-8')
		expect(txt).toMatch(/cmake_minimum_required\(VERSION 3\.28/)
		expect(txt).toMatch(/if\(NOT EMSCRIPTEN\)/)
		expect(txt).toMatch(/add_subdirectory\(modules\/kernels\)/)
		expect(txt).toMatch(/add_subdirectory\(modules\/pinmame\)/)
		const pinmameCmake = fs.readFileSync(path.join(wasmDir, 'modules/pinmame/CMakeLists.txt'), 'utf-8')
		expect(pinmameCmake).toMatch(/PINMAME_WASM_PTHREADS/)
		expect(pinmameCmake).toMatch(/EXPORTED_FUNCTIONS/)
		const kernelsCmake = fs.readFileSync(path.join(wasmDir, 'modules/kernels/CMakeLists.txt'), 'utf-8')
		expect(kernelsCmake).toMatch(/createKernelsModule/)
		expect(kernelsCmake).toMatch(/msimd128/)
	})

	it('CMakePresets.json has wasm and debug presets with distinct binaryDir', () => {
		const j = JSON.parse(fs.readFileSync(presets, 'utf-8'))
		const names = j.configurePresets.map((p: any) => p.name)
		expect(names).toContain('wasm')
		expect(names).toContain('debug')
		const wasm = j.configurePresets.find((p: any) => p.name === 'wasm')
		const debug = j.configurePresets.find((p: any) => p.name === 'debug')
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal preset value
		expect(wasm.binaryDir).toBe('${sourceDir}/build/wasm')
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal preset value
		expect(debug.binaryDir).toBe('${sourceDir}/build/wasm-debug')
	})

	it('build.sh handles --mock and emcc fallback', () => {
		const txt = fs.readFileSync(buildSh, 'utf-8')
		expect(txt).toMatch(/--mock/)
		expect(txt).toMatch(/emcc not found/)
		expect(txt).toMatch(/emcmake cmake --preset/)
		expect(txt).toMatch(/modules\/pinmame\/patches/)
		expect(txt).toMatch(/kernels/)
	})

	it('mock exists and exports createPinmameModule + isMock', async () => {
		const mock = await import('../../wasm/mock/libpinmame.mock.js')
		expect(typeof mock.default).toBe('function')
		expect(mock.isMock).toBe(true)
		const mod = await mock.default()
		expect(typeof mod.cwrap).toBe('function')
		expect(mod.FS).toBeDefined()
	})

	it('dist/libpinmame.js exists (mock or wasm)', () => {
		expect(fs.existsSync(distJs)).toBe(true)
		const stat = fs.statSync(distJs)
		expect(stat.size).toBeGreaterThan(100)
		// mock is ~800 bytes, real wasm build is >1M js + wasm
		const txt = fs.readFileSync(distJs, 'utf-8')
		expect(txt.length).toBeGreaterThan(100)
	})

	it('dist wasm file is mock stub or real binary', () => {
		// mock build copies .js and creates a tiny stub .wasm.js; real build creates .wasm
		if (fs.existsSync(distWasm)) {
			const stat = fs.statSync(distWasm)
			// real wasm is several MB, stub may not exist
			expect(stat.size).toBeGreaterThan(0)
		} else {
			// stub case: check mock copied
			const stub = path.join(wasmDir, 'dist/libpinmame.wasm.js')
			if (fs.existsSync(stub)) {
				expect(fs.statSync(stub).size).toBeGreaterThan(0)
			}
		}
	})

	it('external/pinmame submodule exists', () => {
		expect(fs.existsSync(path.join(root, 'external/pinmame/src/libpinmame/libpinmame.h'))).toBe(true)
		expect(fs.existsSync(path.join(root, 'external/pinmame/src/wpc'))).toBe(true)
	})

	it('modules layout is idiomatic (kernels + pinmame subdirs)', () => {
		expect(fs.existsSync(path.join(wasmDir, 'modules/kernels/src/kernels.cpp'))).toBe(true)
		expect(fs.existsSync(path.join(wasmDir, 'modules/kernels/CMakeLists.txt'))).toBe(true)
		expect(fs.existsSync(path.join(wasmDir, 'modules/pinmame/CMakeLists.txt'))).toBe(true)
		expect(fs.existsSync(path.join(wasmDir, 'modules/pinmame/patches'))).toBe(true)
		const patches = fs.readdirSync(path.join(wasmDir, 'modules/pinmame/patches')).filter(f => f.endsWith('.patch'))
		expect(patches.length).toBeGreaterThanOrEqual(10)
		expect(fs.existsSync(path.join(wasmDir, 'dist'))).toBe(true)
	})

	it('kernels dist exists or legacy copy', () => {
		const canonical = path.join(wasmDir, 'dist/kernels.js')
		const legacy = path.join(wasmDir, 'kernels/dist/kernels.js')
		expect(fs.existsSync(canonical) || fs.existsSync(legacy)).toBe(true)
	})
})
