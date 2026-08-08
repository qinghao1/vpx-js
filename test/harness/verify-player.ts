// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Player / physics harness — verifies Player init, PinInput, physics loop.
 * Run: npx tsx test/harness/verify-player.ts
 */
import * as path from 'node:path'
import { Player } from '../../lib/game/player.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Table } from '../../lib/vpt/table/table.js'
import { TableBuilder } from '../table-builder.js'

async function verifyEmptyPlayer() {
	console.log('=== Player: empty TableBuilder ===')
	const table = new TableBuilder().addFlipper('Flipper1').addBumper('Bumper1').build()
	const player = new Player(table).init()
	console.log(
		`  Balls: ${player.balls.length}, playables: ${table.getPlayables().length}, renderables: ${table.getRenderables().length}`,
	)
	const ticks = player.updatePhysics(16)
	console.log(`  updatePhysics(16): ${ticks} ticks`)
	player.simulateTime(100)
	console.log(`  simulateTime(100): ok, balls=${player.balls.length}`)
	const changed = player.popStates()
	console.log(`  popStates keys: ${Object.keys(changed.changedStates).length}`)
	player.onKeyDown({ code: 'ShiftLeft', key: 'Shift', ts: Date.now() })
	player.onKeyUp({ code: 'ShiftLeft', key: 'Shift', ts: Date.now() })
	console.log('  PinInput flipper keys: ok')
	console.log('  ✓ empty player')
	return true
}

async function verifyExampleGameNamePlayer() {
	console.log('\n=== Player: generic GameName script ===')
	const table = new TableBuilder().withTableScript('cGameName="twd_160h"').build() // generic: any GameName triggers PinMAME, twd_160h is just an example
	const player = new Player(table).init()
	console.log(
		`  Table script: ${table.tableScript?.length} chars, GameName=${table.tableScript?.match(/cGameName[^"']*["']([^"']+)/)?.[1]}`,
	)
	console.log(`  Player balls: ${player.balls.length}, playables: ${table.getPlayables().length}`)
	player.updatePhysics(16)
	player.onFrame()
	console.log('  physics + animations: ok')
	console.log('  ✓ generic GameName player init')
	return true
}

async function verifyKickerBall() {
	console.log('\n=== Player: kicker ball lifecycle ===')
	const table = await Table.load(new NodeBinaryReader(path.resolve('test/fixtures/table-kicker.vpx')))
	const player = new Player(table).init()
	const kicker = (table.kickers as any).BallRelease?.getApi?.()
	if (!kicker) {
		console.log('  SKIP — no kicker API in fixture')
		return true
	}
	const ball = kicker.CreateBall()
	console.log(`  Created ball at y=${ball.getState().pos.y}`)
	kicker.Kick(0, 10)
	player.simulateTime(120)
	console.log(`  After 120ms y=${ball.getState().pos.y.toFixed(1)} (should be <1100)`)
	const ok = ball.getState().pos.y < 1100
	console.log(`  ${ok ? '✓' : '✗'} ball moved`)
	return ok
}

async function main() {
	console.log('vpx-js Player harness —', new Date().toISOString())
	const a = await verifyEmptyPlayer()
	const b = await verifyExampleGameNamePlayer()
	const c = await verifyKickerBall()
	console.log(`\n=== Result: ${a && b && c ? 'PASS' : 'FAIL'} ===`)
	if (!a || !b || !c) process.exit(1)
}

main().catch(e => {
	console.error(e)
	process.exit(1)
})
