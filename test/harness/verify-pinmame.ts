// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Manual end-to-end harness for generic PinMAME (any game). Example uses walking_dead/twd_160h but any ROM works.
 * Run: npx tsx test/harness/verify-pinmame.ts
 * Requires: example VPX + ROM — default checks walking_dead.vpx + ~/.pinmame/roms/<gamename>.zip if present, else mock.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { PinMameEmulator } from '../../lib/emu/pinmame/pinmame-emu.js'
import { createPinmameModule, isPinmameMock, resetPinmameModuleCache } from '../../lib/emu/pinmame/pinmame-loader.js'
import { Player } from '../../lib/game/player.js'
import { Table } from '../../lib/index.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { VpmController } from '../../lib/scripting/objects/vpm-controller.js'
import { TableBuilder } from '../table-builder.js'

const ROM_CANDIDATES = ['twd_160h', 'mm_109', 'afm_113b', 'totan_14', 'example']
	.map((n) => path.join(os.homedir(), `.pinmame/roms/${n}.zip`))
	.concat([path.join(os.homedir(), 'Downloads/twd_160h.zip')])
const ROMS = ROM_CANDIDATES
const VPX = path.resolve('walking_dead.vpx')

function findRom(): string | undefined {
	for (const p of ROMS) if (fs.existsSync(p)) return p
	return undefined
}

async function verifyWasm() {
	console.log('=== WASM module ===')
	resetPinmameModuleCache()
	const { module, isMock } = await createPinmameModule()
	console.log(`  isMock: ${isMock} — ${isMock ? 'mock (physics only)' : 'real wasm'}`)
	console.log(`  HEAPU8: ${Math.round(module.HEAPU8.byteLength / 1024 / 1024)} MB`)
	console.log(`  cwrap: ${typeof module.cwrap}, FS: ${!!module.FS}`)
	const mock2 = await isPinmameMock()
	console.log(`  isPinmameMock() matches: ${mock2 === isMock}`)
}

async function verifyVpx() {
	console.log('\n=== VPX ===')
	if (!fs.existsSync(VPX)) {
		console.log(`  SKIP — ${VPX} not found (symlink to ~/Downloads/walking_dead.vpx)`)
		return null
	}
	const reader = new NodeBinaryReader(VPX)
	const table = await Table.load(reader)
	const script = table.tableScript ?? ''
	const m = script.match(/cGameName\s*=\s*["']([^"']+)["']/i)
	const gameName = m?.[1] ?? 'twd_160h'
	console.log(`  Table: ${table.info?.TableName} (${table.info?.AuthorName})`)
	console.log(`  GameName: ${gameName}`)
	console.log(`  Script len: ${script.length}, has Controller.GameName: ${script.includes('GameName')}`)
	return { table, gameName }
}

async function verifyPinmame(romPath: string | undefined, gameName: string) {
	console.log('\n=== PinMAME ===')
	if (!romPath) {
		console.log('  SKIP — no ROM found at', ROMS[0])
		console.log('  Trying mock load with empty ROM...')
		const emu = new PinMameEmulator()
		await emu.loadGame(gameName, new Uint8Array())
		console.log(`  Mock loadGame(${gameName}) -> isInitialized=${emu.isInitialized()}`)
		emu.emuSimulateCycle(16)
		console.log(`  emuSimulateCycle(16) ok, lamps[0]=${emu.getLampState(0)}`)
		return emu
	}
	const rom = new Uint8Array(fs.readFileSync(romPath))
	console.log(`  ROM: ${romPath} (${(rom.length / 1024 / 1024).toFixed(1)} MB)`)
	const emu = new PinMameEmulator()
	const { isMock } = await createPinmameModule()
	if (isMock) {
		console.log('  wasm is mock — loading ROM as mock (physics only)')
		await emu.loadGame(gameName, rom)
		console.log(`  Mock + real ROM -> isInitialized=${emu.isInitialized()}, version=${emu.getVersion()}`)
	} else {
		console.log(`  Loading real PinMAME: PinmameRun(${gameName})...`)
		await emu.loadGame(gameName, rom)
		console.log(`  Loaded -> isInitialized=${emu.isInitialized()}`)
		for (let i = 0; i < 5; i++) {
			const cycles = emu.emuSimulateCycle(16)
			console.log(`  cycle ${i}: ${cycles} steps, DMD=${emu.getDmdFrame().length} bytes`)
		}
		console.log(
			`  Sample states: lamp11=${emu.getLampState(11)}, sol0=${emu.getSolenoidState(0)}, gi0=${emu.getGIState(0)}`,
		)
		console.log(`  ChangedLamps:`, emu.emulatorState.getChangedLamps().length, 'entries')
	}
	return emu
}

async function verifyVpmController(gameName: string) {
	console.log('\n=== VpmController wiring ===')
	const table = new TableBuilder().build()
	const player = new Player(table)
	const vpm = new VpmController(player)
	// stub fetch to avoid network for WPC games
	const origFetch = globalThis.fetch
	globalThis.fetch = async (url: any) => {
		const u = String(url)
		if (u.includes('twd_160h')) {
			const romPath = findRom()
			if (romPath) return { ok: true, arrayBuffer: async () => fs.readFileSync(romPath).buffer } as any
			return { ok: true, arrayBuffer: async () => new Uint8Array([0]).buffer } as any
		}
		return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } as any
	}
	vpm.GameName = gameName
	await new Promise((r) => setTimeout(r, 200))
	console.log(`  GameName=${vpm.GameName}, emulator=${player.getPhysics().emu?.constructor.name ?? 'none'}`)
	console.log(`  Switch[11]=${vpm.Switch[11]}, Lamp[0]=${vpm.Lamp[0]}, Dip[0]=${vpm.Dip[0]}`)
	// test fliptronics
	vpm.Switch[112] = 1
	console.log(`  Fliptronics Switch[112]=1 set via setFliptronicsInput`)
	globalThis.fetch = origFetch
}

async function main() {
	console.log('vpx-js PinMAME end-to-end harness —', new Date().toISOString())
	await verifyWasm()
	const vpx = await verifyVpx()
	const romPath = findRom()
	const gameName = vpx?.gameName ?? 'twd_160h'
	await verifyPinmame(romPath, gameName)
	await verifyVpmController(gameName)
	console.log('\n=== Done ===')
	if (!romPath)
		console.log('Tip: place twd_160h.zip at ~/.pinmame/roms/ for full test, or run npm run build:wasm for real wasm')
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
