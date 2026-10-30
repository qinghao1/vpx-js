// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = process.cwd()
const wasmDir = path.join(root, 'wasm')
const distJs = path.join(wasmDir, 'dist/libpinmame.js')
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
		expect(pinmameCmake).toMatch(/PinmameGetAudioFrame/)
		expect(pinmameCmake).toMatch(/PinmameGetAudioChannels/)
		expect(pinmameCmake).toMatch(/PinmameGetAudioSeq/)
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
		// 4-patch series (see wasm/modules/pinmame/patches/).
		expect(patches.length).toBe(4)
		expect(fs.existsSync(path.join(wasmDir, 'dist'))).toBe(true)
	})

	it('kernels dist exists', () => {
		expect(fs.existsSync(path.join(wasmDir, 'dist/kernels.js'))).toBe(true)
	})
})

const hasGit = (() => {
	try {
		return spawnSync('git', ['--version']).status === 0
	} catch {
		return false
	}
})()

describe.skipIf(!hasGit)('build.sh failure behavior', () => {
	interface Sandbox {
		root: string
		buildSh: string
		dist: string
		patches: string
		pinmame: string
		mockSrc: string
		home: string
	}

	const tmpDirs: string[] = []
	afterEach(() => {
		while (tmpDirs.length > 0) {
			const d = tmpDirs.pop()
			if (d) fs.rmSync(d, { recursive: true, force: true })
		}
	})

	// PATH shim with every executable of the real PATH except `exclude`.
	function pathExcluding(exclude: Set<string>): string {
		const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-path-'))
		tmpDirs.push(shim)
		for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
			if (!dir) continue
			let entries: string[]
			try {
				entries = fs.readdirSync(dir)
			} catch {
				continue
			}
			for (const e of entries) {
				if (exclude.has(e) || fs.existsSync(path.join(shim, e))) continue
				try {
					fs.symlinkSync(path.join(dir, e), path.join(shim, e))
				} catch {
					// dangling link or race — lookup just skips it
				}
			}
		}
		return shim
	}

	// Sandbox with the REAL build.sh + mock; only toolchain/pinmame are fixtures.
	function setupSandbox(): Sandbox {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-build-'))
		tmpDirs.push(root)
		const proj = path.join(root, 'proj')
		const sb: Sandbox = {
			root,
			buildSh: path.join(proj, 'wasm/build.sh'),
			dist: path.join(proj, 'wasm/dist'),
			patches: path.join(proj, 'wasm/modules/pinmame/patches'),
			pinmame: path.join(proj, 'external/pinmame'),
			mockSrc: path.join(proj, 'wasm/mock/libpinmame.mock.js'),
			home: path.join(root, 'home'),
		}
		fs.mkdirSync(sb.dist, { recursive: true })
		fs.mkdirSync(sb.patches, { recursive: true })
		fs.mkdirSync(path.dirname(sb.mockSrc), { recursive: true })
		fs.mkdirSync(sb.home, { recursive: true })
		fs.copyFileSync(buildSh, sb.buildSh)
		fs.copyFileSync(path.join(wasmDir, 'mock/libpinmame.mock.js'), sb.mockSrc)
		expect(spawnSync('git', ['init', '-q', sb.pinmame]).status).toBe(0)
		return sb
	}

	function runBuild(sb: Sandbox, args: string[], pathValue: string) {
		const { EMSDK: _omitEmsdk, ...rest } = process.env
		void _omitEmsdk
		const env = { ...rest, HOME: sb.home, PATH: pathValue }
		const r = spawnSync('bash', [sb.buildSh, ...args], {
			cwd: path.dirname(sb.buildSh),
			env,
			encoding: 'utf-8',
		})
		return { status: r.status, out: `${r.stdout}${r.stderr}` }
	}

	function fakeToolchainPath(sb: Sandbox, cmakeOk: boolean): string {
		const bin = path.join(sb.root, 'fakebin')
		fs.mkdirSync(bin, { recursive: true })
		fs.writeFileSync(path.join(bin, 'emcc'), '#!/bin/sh\necho "fake emcc 1.0"\n')
		fs.writeFileSync(path.join(bin, 'emcmake'), '#!/bin/sh\nexec "$@"\n')
		fs.writeFileSync(
			path.join(bin, 'cmake'),
			cmakeOk
				? '#!/bin/sh\nexit 0\n'
				: '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "cmake fake"; exit 0; fi\necho "fake cmake: BUILD FAILURE" >&2\nexit 1\n',
		)
		for (const f of fs.readdirSync(bin)) fs.chmodSync(path.join(bin, f), 0o755)
		return `${bin}${path.delimiter}${pathExcluding(new Set(['emcc', 'emcmake', 'cmake']))}`
	}

	it('fails without emcc unless --allow-mock; mock fallback drops the stale wasm mate', () => {
		const sb = setupSandbox()
		const noEmcc = pathExcluding(new Set(['emcc']))
		fs.writeFileSync(path.join(sb.dist, 'libpinmame.js'), 'REAL-JS-SENTINEL')
		fs.writeFileSync(path.join(sb.dist, 'libpinmame.wasm'), 'STALE-WASM-SENTINEL')

		const failed = runBuild(sb, [], noEmcc)
		expect(failed.status).toBe(1)
		expect(failed.out).toMatch(/ERROR: emcc not found/)
		expect(fs.readFileSync(path.join(sb.dist, 'libpinmame.js'), 'utf-8')).toBe('REAL-JS-SENTINEL')
		expect(fs.readFileSync(path.join(sb.dist, 'libpinmame.wasm'), 'utf-8')).toBe('STALE-WASM-SENTINEL')

		const allowed = runBuild(sb, ['--allow-mock'], noEmcc)
		expect(allowed.status).toBe(0)
		expect(fs.readFileSync(path.join(sb.dist, 'libpinmame.js'), 'utf-8')).toBe(fs.readFileSync(sb.mockSrc, 'utf-8'))
		expect(fs.existsSync(path.join(sb.dist, 'libpinmame.wasm'))).toBe(false)
	})

	it('build failure exits nonzero without clobbering real artifacts', () => {
		const sb = setupSandbox()
		const toolchain = fakeToolchainPath(sb, false)
		fs.writeFileSync(path.join(sb.dist, 'libpinmame.js'), 'REAL-JS-SENTINEL')
		fs.writeFileSync(path.join(sb.dist, 'libpinmame.wasm'), 'REAL-WASM-SENTINEL')

		const failed = runBuild(sb, [], toolchain)
		expect(failed.status).toBe(1)
		expect(failed.out).toMatch(/build failed/)
		expect(fs.readFileSync(path.join(sb.dist, 'libpinmame.js'), 'utf-8')).toBe('REAL-JS-SENTINEL')
		expect(fs.readFileSync(path.join(sb.dist, 'libpinmame.wasm'), 'utf-8')).toBe('REAL-WASM-SENTINEL')

		const allowed = runBuild(sb, ['--allow-mock'], toolchain)
		expect(allowed.status).toBe(0)
		expect(fs.readFileSync(path.join(sb.dist, 'libpinmame.js'), 'utf-8')).toBe(fs.readFileSync(sb.mockSrc, 'utf-8'))
		expect(fs.existsSync(path.join(sb.dist, 'libpinmame.wasm'))).toBe(false)
	})

	it('broken patch fails loudly; applied patch skips idempotently', () => {
		const sb = setupSandbox()
		const toolchain = fakeToolchainPath(sb, true)
		fs.writeFileSync(path.join(sb.pinmame, 'foo.c'), 'original content\n')
		spawnSync('git', ['-C', sb.pinmame, 'add', 'foo.c'])
		expect(
			spawnSync('git', ['-C', sb.pinmame, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'])
				.status,
		).toBe(0)

		fs.writeFileSync(
			path.join(sb.patches, '9999-broken.patch'),
			'--- a/foo.c\n+++ b/foo.c\n@@ -1 +1 @@\n-totally different context line\n+patched line\n',
		)
		const broken = runBuild(sb, [], toolchain)
		expect(broken.status).toBe(1)
		expect(broken.out).toMatch(/9999-broken\.patch/)

		fs.rmSync(path.join(sb.patches, '9999-broken.patch'))
		fs.writeFileSync(
			path.join(sb.patches, '0001-good.patch'),
			'--- a/foo.c\n+++ b/foo.c\n@@ -1 +1 @@\n-original content\n+patched line\n',
		)
		const first = runBuild(sb, [], toolchain)
		expect(first.status).toBe(0)
		expect(first.out).toMatch(/apply 0001-good\.patch/)
		const second = runBuild(sb, [], toolchain)
		expect(second.status).toBe(0)
		expect(second.out).toMatch(/already applied: 0001-good\.patch/)
	})

	it('--mock still exits 0 and drops a stale wasm mate', () => {
		const sb = setupSandbox()
		fs.writeFileSync(path.join(sb.dist, 'libpinmame.js'), 'OLD-JS')
		fs.writeFileSync(path.join(sb.dist, 'libpinmame.wasm'), 'STALE-WASM-SENTINEL')

		const r = runBuild(sb, ['--mock'], process.env.PATH ?? '')
		expect(r.status).toBe(0)
		expect(fs.readFileSync(path.join(sb.dist, 'libpinmame.js'), 'utf-8')).toBe(fs.readFileSync(sb.mockSrc, 'utf-8'))
		expect(fs.existsSync(path.join(sb.dist, 'libpinmame.wasm'))).toBe(false)
	})
})
