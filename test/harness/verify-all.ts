// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Unified E2E harness — runs all verify-* checks with TAP summary.
 * Run: npx tsx test/harness/verify-all.ts  or  npm run verify:all
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { PinMameEmulator } from '../../lib/emu/pinmame/pinmame-emu.js'
import { createPinmameModule, resetPinmameModuleCache } from '../../lib/emu/pinmame/pinmame-loader.js'
import { Player } from '../../lib/game/player.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Table } from '../../lib/vpt/table/table.js'
import { TableBuilder } from '../table-builder.js'

type Check = { name: string; fn: () => Promise<boolean> }

async function verifyWasm(): Promise<boolean> {
	console.log('# wasm — CMake, presets, mock, dist')
	const root = process.cwd()
	const wasmDir = path.join(root, 'wasm')
	const checks: Array<[string, boolean]> = [
		['CMakeLists 3.28+', fs.readFileSync(path.join(wasmDir, 'CMakeLists.txt'), 'utf-8').includes('3.28')],
		['EMSCRIPTEN guard', fs.readFileSync(path.join(wasmDir, 'CMakeLists.txt'), 'utf-8').includes('NOT EMSCRIPTEN')],
		[
			'presets distinct',
			(() => {
				const j = JSON.parse(fs.readFileSync(path.join(wasmDir, 'CMakePresets.json'), 'utf-8'))
				return (
					j.configurePresets.find((p: any) => p.name === 'wasm').binaryDir !==
					j.configurePresets.find((p: any) => p.name === 'debug').binaryDir
				)
			})(),
		],
		['mock exists', fs.existsSync(path.join(wasmDir, 'mock/libpinmame.mock.js'))],
		['dist exists', fs.existsSync(path.join(wasmDir, 'dist/libpinmame.js'))],
		['external/pinmame', fs.existsSync(path.join(root, 'external/pinmame/src/libpinmame/libpinmame.h'))],
	]
	for (const [n, ok] of checks) console.log(`  ${ok ? '✓' : '✗'} ${n}`)
	return checks.every(([, ok]) => ok)
}

async function verifyTable(): Promise<boolean> {
	console.log('# table — empty + example VPX (any GameName)')
	const empty = path.resolve('test/fixtures/table-empty.vpx')
	const exampleVpx = path.resolve('walking_dead.vpx') // example local VPX; any cGameName table works
	if (!fs.existsSync(empty)) {
		console.log('  ✗ empty fixture missing')
		return false
	}
	const t0 = await Table.load(new NodeBinaryReader(empty))
	console.log(`  ✓ empty: ${Object.keys(t0.items).length} items`)
	if (!fs.existsSync(exampleVpx)) {
		console.log('  ○ example VPX not found — skip (any .vpx with GameName would work)')
		return true
	}
	const t1 = await Table.load(new NodeBinaryReader(exampleVpx))
	const gameName = t1.tableScript?.match(/cGameName\s*=\s*["']([^"']+)["']/i)?.[1]
	console.log(`  ✓ example VPX: ${t1.info?.TableName}, GameName=${gameName}, lights=${Object.keys(t1.lights).length}`)
	return !!gameName
}

async function verifyPinmame(): Promise<boolean> {
	console.log('# pinmame — wasm mock + ROM + VPX')
	resetPinmameModuleCache()
	const { isMock } = await createPinmameModule()
	console.log(`  ${isMock ? 'mock' : 'wasm'} module`)
	const exampleRoms = ['twd_160h', 'mm_109', 'afm_113b', 'totan_14']
	for (const name of exampleRoms) {
		const cand = path.join(os.homedir(), `.pinmame/roms/${name}.zip`)
		if (fs.existsSync(cand)) {
			console.log(`  ROM found: ${cand} (${(fs.statSync(cand).size / 1024 / 1024).toFixed(1)} MB)`)
			break
		}
	}
	const vpx = path.resolve('walking_dead.vpx') // any local VPX with GameName
	if (fs.existsSync(vpx)) {
		const table = await Table.load(new NodeBinaryReader(vpx))
		const gameName = table.tableScript?.match(/cGameName\s*=\s*["']([^"']+)["']/i)?.[1] ?? 'twd_160h'
		console.log(`  Example VPX GameName=${gameName}`)
	}
	const emu = new PinMameEmulator()
	await emu.loadGame('twd_160h', new Uint8Array()) // generic: any GameName works via mock
	console.log(`  mock loadGame -> isInitialized=${emu.isInitialized()}`)
	emu.emuSimulateCycle(16)
	console.log(`  emuSimulateCycle ok`)
	return emu.isInitialized()
}

async function verifyPlayer(): Promise<boolean> {
	console.log('# player — TableBuilder + physics + kicker')
	const table = new TableBuilder().addFlipper('Flipper1').addBumper('Bumper1').build()
	const player = new Player(table).init()
	player.updatePhysics(16)
	player.simulateTime(20)
	console.log(`  empty player: balls=${player.balls.length}, ticks ok`)
	const kickerTable = await Table.load(new NodeBinaryReader(path.resolve('test/fixtures/table-kicker.vpx')))
	const kickerPlayer = new Player(kickerTable).init()
	const kicker = (kickerTable.kickers as any).BallRelease?.getApi?.()
	if (kicker) {
		const ball = kicker.CreateBall()
		kicker.Kick(0, 10)
		kickerPlayer.simulateTime(120)
		console.log(`  kicker ball y=${ball.getState().pos.y.toFixed(1)}`)
		if (ball.getState().pos.y >= 1100) return false
	}
	console.log('  ✓ player')
	return true
}

async function main() {
	console.log(`TAP version 13\n# vpx-js E2E — ${new Date().toISOString()}`)
	const checks: Check[] = [
		{ name: 'wasm', fn: verifyWasm },
		{ name: 'table', fn: verifyTable },
		{ name: 'pinmame', fn: verifyPinmame },
		{ name: 'player', fn: verifyPlayer },
	]
	console.log(`1..${checks.length}`)
	let pass = 0
	for (let i = 0; i < checks.length; i++) {
		const c = checks[i]!
		console.log(`\n# --- ${c.name} ---`)
		try {
			const ok = await c.fn()
			if (ok) {
				pass++
				console.log(`ok ${i + 1} - ${c.name}`)
			} else {
				console.log(`not ok ${i + 1} - ${c.name}`)
			}
		} catch (e) {
			console.log(`not ok ${i + 1} - ${c.name} — ${(e as Error).message}`)
		}
	}
	console.log(`\n# pass ${pass}/${checks.length}`)
	if (pass !== checks.length) {
		console.log('# Result: FAIL')
		process.exit(1)
	}
	console.log('# Result: PASS')
}

main().catch(e => {
	console.error(e)
	process.exit(1)
})
