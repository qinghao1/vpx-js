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
import { extractGameName } from './vpinball-resolver.js'

function checker(label: string): { check: (cond: boolean, detail: string) => void; result: () => boolean } {
	let ok = true
	return {
		check: (cond: boolean, detail: string) => {
			console.log(`  ${cond ? '✓' : '✗'} ${detail}`)
			if (!cond) ok = false
		},
		result: () => {
			console.log(`  ${ok ? '✓' : '✗'} ${label}`)
			return ok
		},
	}
}

async function verifyEmptyPlayer() {
	console.log('=== Player: empty TableBuilder ===')
	const table = new TableBuilder().addFlipper('Flipper1').addBumper('Bumper1').build()
	const player = new Player(table).init()
	const t = checker('empty player')
	t.check(player.balls.length === 0, `no balls at init (balls=${player.balls.length})`)
	t.check(
		table.getPlayables().length >= 2,
		`flipper+bumper registered as playables (n=${table.getPlayables().length})`,
	)
	t.check(table.getRenderables().length > 0, `renderables registered (n=${table.getRenderables().length})`)
	const ticks = player.updatePhysics(16)
	t.check(ticks > 0, `updatePhysics(16) advances the clock (ticks=${ticks})`)
	player.simulateTime(100)
	t.check(player.balls.length === 0, `still no balls after simulateTime(100) (balls=${player.balls.length})`)
	const changed = player.popStates()
	t.check(
		changed?.changedStates !== undefined,
		`popStates returns a state diff (keys=${Object.keys(changed?.changedStates ?? {}).length})`,
	)
	player.onKeyDown({ code: 'ShiftLeft', key: 'Shift' })
	player.onKeyUp({ code: 'ShiftLeft', key: 'Shift' })
	console.log('  PinInput flipper keys dispatched without throw')
	return t.result()
}

async function verifyExampleGameNamePlayer() {
	console.log('\n=== Player: generic GameName script ===')
	const table = new TableBuilder().withTableScript('cGameName="twd_160h"').build() // generic: any GameName triggers PinMAME, twd_160h is just an example
	const player = new Player(table).init()
	const t = checker('generic GameName player init')
	t.check((table.tableScript?.length ?? 0) > 0, `table script present (${table.tableScript?.length ?? 0} chars)`)
	const gameName = extractGameName(table.tableScript ?? '')
	t.check(gameName === 'twd_160h', `GameName extracted from script (GameName=${gameName})`)
	t.check(player.balls.length === 0, `no balls at init (balls=${player.balls.length})`)
	const ticks = player.updatePhysics(16)
	t.check(ticks > 0, `updatePhysics(16) advances the clock (ticks=${ticks})`)
	const frame = player.onFrame()
	t.check(frame !== null && frame !== undefined, 'onFrame returns animation states')
	frame?.release?.()
	return t.result()
}

async function verifyKickerBall() {
	console.log('\n=== Player: kicker ball lifecycle ===')
	// Scriptless load: this leg covers kicker/ball physics, not the table script.
	const table = await Table.load(new NodeBinaryReader(path.resolve('test/fixtures/table-kicker.vpx')), {
		loadTableScript: false,
	})
	const player = new Player(table).init()
	const t = checker('ball moved')
	const kicker = (table.kickers as any).BallRelease?.getApi?.()
	t.check(!!kicker, 'BallRelease kicker API present in fixture')
	if (!kicker) return t.result()
	const ball = kicker.CreateBall()
	const y0 = ball.getState().pos.y
	t.check(player.balls.includes(ball), `created ball is tracked by the player (balls=${player.balls.length})`)
	kicker.Kick(0, 10)
	player.simulateTime(120)
	const y1 = ball.getState().pos.y
	console.log(`  y: ${y0.toFixed(1)} -> ${y1.toFixed(1)}`)
	t.check(y1 < y0, `ball moved after kick (y0=${y0.toFixed(1)} y1=${y1.toFixed(1)})`)
	t.check(y1 < 1100, `ball settled below the kicker mouth (y=${y1.toFixed(1)} < 1100)`)
	return t.result()
}

async function main() {
	console.log('vpx-js Player harness —', new Date().toISOString())
	const a = await verifyEmptyPlayer()
	const b = await verifyExampleGameNamePlayer()
	const c = await verifyKickerBall()
	console.log(`\n=== Result: ${a && b && c ? 'PASS' : 'FAIL'} ===`)
	if (!a || !b || !c) process.exit(1)
}

main().catch(error => {
	console.error(error)
	process.exit(1)
})
