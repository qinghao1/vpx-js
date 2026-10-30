// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Manual end-to-end harness for generic PinMAME (any game). Example uses example-table/twd_160h but any ROM works.
 * Run: npx tsx test/harness/verify-pinmame.ts
 * Requires: example VPX + ROM — default checks example-table.vpx + ~/.pinmame/roms/<gamename>.zip if present, else mock.
 * Exit: 0 all asserts pass (mock path included), 1 on any load failure or assert failure.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { EmulatorState } from '../../lib/emu/emulator-state.js'
import { PinMameEmulator } from '../../lib/emu/pinmame/pinmame-emu.js'
import { createPinmameModule, isPinmameMock, resetPinmameModuleCache } from '../../lib/emu/pinmame/pinmame-loader.js'
import type { IEmulator } from '../../lib/game/iemulator.js'
import { Player } from '../../lib/game/player.js'
import { Table } from '../../lib/index.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { VpmController } from '../../lib/scripting/objects/vpm-controller.js'
import { TableBuilder } from '../table-builder.js'
import { Tap } from './tap.js'
import { extractGameName, findRomForGameName } from './vpinball-resolver.js'

const tap = new Tap('pinmame e2e')

const ROM_GAME_NAMES = ['twd_160h', 'mm_109', 'afm_113b', 'totan_14', 'example']
const VPX = path.resolve('example-table.vpx')

function findRom(): string | undefined {
	for (const gameName of ROM_GAME_NAMES) {
		const found = findRomForGameName(gameName, path.dirname(VPX))
		if (found) return found
	}
	return undefined
}

function assertDimsAndFrame(emu: PinMameEmulator, label: string): void {
	const dims = emu.getDmdDimensions()
	const frame = emu.getDmdFrame()
	tap.assert(Number.isInteger(dims.x) && dims.x > 0, `${label}: DMD width positive (w=${dims.x})`)
	tap.assert(Number.isInteger(dims.y) && dims.y > 0, `${label}: DMD height positive (h=${dims.y})`)
	tap.assert(frame instanceof Uint8Array, `${label}: DMD frame is Uint8Array`)
	tap.assert(
		frame.length === dims.x * dims.y,
		`${label}: frame length matches dims (${frame.length}==${dims.x}x${dims.y})`,
	)
}

/** Deterministic lamp/sol/GI round-trip through EmulatorState: inject, read back, diff. */
function assertStateRoundTrip(label: string): void {
	const state = new EmulatorState()
	const lamps = new Uint8Array(64)
	const sols = new Uint8Array(64)
	const gis = new Uint8Array(64)
	for (let i = 0; i < 64; i++) {
		lamps[i] = (i * 7 + 3) % 256
		sols[i] = (i * 13 + 1) % 2
		gis[i] = (i * 5 + 2) % 256
	}
	state.applyPinmame(lamps, sols, gis)
	let lampOk = true
	let solOk = true
	let giOk = true
	for (let i = 0; i < 64; i++) {
		if (state.getLampStateDirect(i) !== lamps[i]) lampOk = false
		if (state.getSolenoidState(i) !== sols[i]) solOk = false
		if (state.getGIState(i) !== gis[i]) giOk = false
	}
	tap.assert(lampOk, `${label}: lamp round-trip (64/64 states read back)`)
	tap.assert(solOk, `${label}: solenoid round-trip (64/64 states read back)`)
	tap.assert(giOk, `${label}: GI round-trip (64/64 states read back)`)
	tap.assert(
		(state.getChangedLamps() as unknown as readonly unknown[]).length > 0,
		`${label}: injected lamps appear in getChangedLamps diff`,
	)
	tap.assert(state.getChangedSolenoids().length > 0, `${label}: injected sols appear in getChangedSolenoids diff`)
	tap.assert(state.getChangedGI().length > 0, `${label}: injected GI appears in getChangedGI diff`)
}

async function verifyWasm() {
	console.log('=== WASM module ===')
	resetPinmameModuleCache()
	const { module, isMock } = await createPinmameModule()
	const distExists = fs.existsSync(path.resolve('wasm/dist/libpinmame.js'))
	console.log(`  isMock: ${isMock} — ${isMock ? 'mock (physics only)' : 'real wasm'}`)
	console.log(`  HEAPU8: ${Math.round(module.HEAPU8.byteLength / 1024 / 1024)} MB`)
	tap.assert(isMock === !distExists, `loader selects real iff dist exists (isMock=${isMock} dist=${distExists})`)
	tap.assert(module.HEAPU8.byteLength > 0, 'wasm HEAPU8 non-empty')
	tap.assert(typeof module.cwrap === 'function', 'wasm cwrap callable')
	tap.assert(!!module.FS, 'wasm FS present')
	const mock2 = await isPinmameMock()
	tap.assert(mock2 === isMock, 'isPinmameMock() agrees with loader flag')
}

async function verifyVpx() {
	console.log('\n=== VPX ===')
	if (!fs.existsSync(VPX)) {
		console.log(`  SKIP — ${VPX} not found (symlink any .vpx with GameName to example-table.vpx)`)
		return null
	}
	const reader = new NodeBinaryReader(VPX)
	const table = await Table.load(reader)
	const script = table.tableScript ?? ''
	const extracted = extractGameName(script)
	console.log(`  Table: ${table.info?.TableName} (${table.info?.AuthorName})`)
	console.log(`  GameName: ${extracted ?? '(none)'}`)
	// No fallback before the assert: a table that reaches this leg must carry
	// an extractable GameName, otherwise ROM resolution below is meaningless.
	tap.assert(extracted !== null && extracted.length > 0, 'VPX GameName extracted')
	const gameName = extracted ?? 'twd_160h'
	return { table, gameName }
}

function frameStats(frame: Uint8Array): { max: number; sum: number } {
	let max = 0
	let sum = 0
	for (const v of frame) {
		if (v > max) max = v
		sum += v
	}
	return { max, sum }
}

/** Poll paced cycles until the booted game shows DMD + lamp activity (emulation runs on wall-clock). */
async function pollBootActivity(
	emu: IEmulator,
	timeoutMs = 20000,
): Promise<{ dmdSum: number; dmdMax: number; changedTotal: number }> {
	const started = Date.now()
	let changedTotal = 0
	let dmdSum = 0
	let dmdMax = 0
	for (;;) {
		emu.emuSimulateCycle(16)
		const { max, sum } = frameStats(emu.getDmdFrame())
		if (sum > dmdSum) dmdSum = sum
		if (max > dmdMax) dmdMax = max
		changedTotal +=
			(emu.emulatorState.getChangedLamps() as unknown as readonly unknown[]).length +
			emu.emulatorState.getChangedSolenoids().length +
			emu.emulatorState.getChangedGI().length
		if (dmdSum > 0 && changedTotal > 0) break
		if (Date.now() - started > timeoutMs) break
		await new Promise(resolve => setTimeout(resolve, 100))
	}
	return { dmdSum, dmdMax, changedTotal }
}

async function verifyPinmame(romPath: string | undefined, gameName: string) {
	console.log('\n=== PinMAME ===')
	if (!romPath) {
		console.log('  no ROM found (place twd_160h.zip in ~/.pinmame/roms/) — exercising mock load')
		const emu = new PinMameEmulator()
		await emu.loadGame(gameName, new Uint8Array())
		tap.assert(emu.isInitialized(), `mock loadGame(${gameName}) initializes`)
		const steps = emu.emuSimulateCycle(16)
		tap.assert(steps === 16, `mock emuSimulateCycle(16) advances (${steps})`)
		tap.assert(emu.getLampState(0) === 0, 'mock lamp state readable (0)')
		assertDimsAndFrame(emu, 'mock')
		assertStateRoundTrip('mock')
		return
	}
	const rom = new Uint8Array(fs.readFileSync(romPath))
	console.log(`  ROM: ${romPath} (${(rom.length / 1024 / 1024).toFixed(1)} MB)`)
	const emu = new PinMameEmulator()
	// Stream-liveness guard: the wasm mixer must keep producing PCM once the
	// stream starts (a no-callback update path returning 0 stalls it forever).
	let audioChunks = 0
	emu.registerAudioConsumer(() => {
		audioChunks++
	})
	const { isMock } = await createPinmameModule()
	if (isMock) {
		console.log('  wasm is mock — loading ROM as mock (physics only)')
		await emu.loadGame(gameName, rom)
		tap.assert(emu.isInitialized(), 'mock+ROM loadGame initializes')
		assertDimsAndFrame(emu, 'mock+ROM')
		assertStateRoundTrip('mock+ROM')
		return
	}
	console.log(`  Loading real PinMAME: PinmameRun(${gameName})...`)
	await emu.loadGame(gameName, rom)
	tap.assert(emu.isInitialized(), 'real loadGame initializes')
	const boot = await pollBootActivity(emu)
	console.log(`  boot poll: dmdSum=${boot.dmdSum} dmdMax=${boot.dmdMax} changed=${boot.changedTotal}`)
	tap.assert(boot.dmdSum > 0, `real boot shows DMD content within timeout (sum=${boot.dmdSum})`)
	tap.assert(boot.changedTotal > 0, `real boot drives lamp/sol/GI changes (n=${boot.changedTotal})`)
	tap.assert(audioChunks > 0, `real boot streams ROM audio PCM (chunks=${audioChunks})`)
	for (const [label, value] of [
		['lamp11', emu.getLampState(11)],
		['sol0', emu.getSolenoidState(0)],
		['gi0', emu.getGIState(0)],
	] as const) {
		tap.assert(Number.isInteger(value) && value >= 0 && value <= 255, `real ${label} in byte range (${value})`)
	}
	assertDimsAndFrame(emu, 'real')
	assertStateRoundTrip('real')
}

async function verifyVpmController(gameName: string) {
	console.log('\n=== VpmController wiring ===')
	// Fresh wasm module: a second PinmameRun on one module instance corrupts the
	// already-running game (double-load), so each section gets its own instance.
	resetPinmameModuleCache()
	const table = new TableBuilder().build()
	const player = new Player(table)
	const vpm = new VpmController(player)
	// stub fetch to avoid network for WPC games
	const origFetch = globalThis.fetch
	globalThis.fetch = (async (url: any) => {
		const u = String(url)
		if (u.includes('twd_160h')) {
			const romPath = findRom()
			if (romPath) {
				// Slice to the Buffer's view: .buffer alone may alias the shared pool.
				const data = fs.readFileSync(romPath)
				const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
				return { ok: true, arrayBuffer: () => Promise.resolve(copy) } as any
			}
			return { ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([0]).buffer) } as any
		}
		return { ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) } as any
	}) as typeof fetch
	try {
		vpm.GameName = gameName
		await vpm.whenReady()
	} finally {
		globalThis.fetch = origFetch
	}
	const emu = player.getPhysics().emu
	console.log(`  GameName=${vpm.GameName}, emulator=${emu?.constructor.name ?? 'none'}`)
	tap.assert(emu instanceof PinMameEmulator, 'controller attaches a PinMameEmulator')
	tap.assert(emu?.isInitialized() === true, 'controller emu initialized after whenReady (load completed)')
	tap.assert(typeof vpm.Switch[11] === 'number', `controller Switch readable (${vpm.Switch[11]})`)
	tap.assert(typeof vpm.Lamp[0] === 'number', `controller Lamp readable (${vpm.Lamp[0]})`)
	tap.assert(typeof vpm.Dip[0] === 'number', `controller Dip readable (${vpm.Dip[0]})`)
	// fliptronics: Switch reads COM VARIANT_BOOL, so True is -1
	vpm.Switch[112] = 1
	tap.assert(vpm.Switch[112] === -1, 'fliptronics Switch[112] round-trips through setFliptronicsInput')
	if (emu && !emu.isMock) {
		const boot = await pollBootActivity(emu, 10000)
		console.log(`  controller boot poll: dmdSum=${boot.dmdSum} changed=${boot.changedTotal}`)
		tap.assert(boot.dmdSum > 0, 'controller-loaded game boots to live DMD')
	}
}

async function main() {
	console.log('vpx-js PinMAME end-to-end harness —', new Date().toISOString())
	await verifyWasm()
	const vpx = await verifyVpx()
	const romPath = findRom()
	const gameName = vpx?.gameName ?? 'twd_160h'
	await verifyPinmame(romPath, gameName)
	await verifyVpmController(gameName)
	const passed = tap.done()
	console.log(passed ? '\n# pinmame harness PASS' : '\n# pinmame harness FAIL')
	if (!romPath) {
		console.log(
			'Tip: place twd_160h.zip at ~/.pinmame/roms/ for full test, or run npm run build:wasm for real wasm',
		)
	}
	process.exit(passed ? 0 : 1)
}

main().catch(error => {
	console.error(error)
	process.exit(1)
})
