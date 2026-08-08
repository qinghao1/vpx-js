// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const wasmDir = path.join(root, 'wasm')
const distJs = path.join(wasmDir, 'dist/libpinmame.js')
const distWasm = path.join(wasmDir, 'dist/libpinmame.wasm')
const mockJs = path.join(wasmDir, 'mock/libpinmame.mock.js')
const cmakeLists = path.join(wasmDir, 'CMakeLists.txt')
const presets = path.join(wasmDir, 'CMakePresets.json')
const buildSh = path.join(wasmDir, 'build.sh')

describe('WASM build artifacts', () => {
	it('CMakeLists.txt is modern (min 3.28, has EMSCRIPTEN guard, pthreads)', () => {
		const txt = fs.readFileSync(cmakeLists, 'utf-8')
		expect(txt).toMatch(/cmake_minimum_required\(VERSION 3\.28/)
		expect(txt).toMatch(/if\(NOT EMSCRIPTEN\)/)
		expect(txt).toMatch(/PINMAME_WASM_PTHREADS/)
		expect(txt).toMatch(/EXPORTED_FUNCTIONS/)
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
})
