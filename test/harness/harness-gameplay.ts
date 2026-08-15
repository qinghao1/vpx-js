// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import fs from 'node:fs'
import path from 'node:path'
import { Player } from '../../lib/game/player.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Table } from '../../lib/vpt/table/table.js'
import { Vertex3D } from '../../lib/util/vector.js'

async function runGameplayHarness() {
	console.log('=== Comprehensive Gameplay Physics & Flipper Collision Harness ===')
	const twdPath = path.resolve('/home/qinghao1/Downloads/walking_dead.vpx')
	const flipperFixture = path.resolve('test/fixtures/table-flipper.vpx')
	const targetVpx = fs.existsSync(twdPath) ? twdPath : flipperFixture
	console.log(`Loading table: ${targetVpx}`)

	const reader = new NodeBinaryReader(targetVpx)
	const table = await Table.load(reader)
	const player = new Player(table).init()

	const leftFlipper = table.flippers?.LeftFlipper || Object.values(table.flippers || {})[0]
	const rightFlipper = table.flippers?.RightFlipper || Object.values(table.flippers || {})[1]

	const lfCenter = leftFlipper ? leftFlipper.data.center : { x: 281, y: 1915 }
	const rfCenter = rightFlipper ? rightFlipper.data.center : { x: 597, y: 1915 }

	console.log(`Left flipper center: (${lfCenter.x}, ${lfCenter.y}) | Right flipper center: (${rfCenter.x}, ${rfCenter.y})`)

	// Test Scenarios:
	// 1. Ball striking Left Flipper face during stroke
	// 2. Ball striking Right Flipper face during stroke
	// 3. Ball hitting Flipper tip / end radius
	// 4. Ball resting & rolling along flipper face
	const scenarios = [
		{ name: 'Left Flipper Face Strike', pos: new Vertex3D(lfCenter.x + 30, lfCenter.y - 120, 25), vel: new Vertex3D(0, 80, 0), flipper: leftFlipper, flipFrame: 25 },
		{ name: 'Right Flipper Face Strike', pos: new Vertex3D(rfCenter.x - 30, rfCenter.y - 120, 25), vel: new Vertex3D(0, 80, 0), flipper: rightFlipper, flipFrame: 25 },
		{ name: 'Left Flipper Tip Hit', pos: new Vertex3D(lfCenter.x + 100, lfCenter.y - 50, 25), vel: new Vertex3D(0, 50, 0), flipper: leftFlipper, flipFrame: 30 },
		{ name: 'Resting & Rolling on Left Flipper', pos: new Vertex3D(lfCenter.x + 40, lfCenter.y - 60, 25), vel: new Vertex3D(0, 10, 0), flipper: leftFlipper, flipFrame: -1 },
	]

	let totalPassed = 0

	let globalTimeMs = 0

	for (let sIdx = 0; sIdx < scenarios.length; sIdx++) {
		const s = scenarios[sIdx]!
		console.log(`\n--- Scenario ${sIdx + 1}: ${s.name} ---`)

		const ballCreator = {
			getBallCreationPosition: () => s.pos.clone(),
			getBallCreationVelocity: () => s.vel.clone(),
			onBallCreated: () => {},
		}

		const ball = player.createBall(ballCreator as any)
		let disappeared = false
		let flipped = false

		for (let frame = 0; frame < 120; frame++) {
			globalTimeMs += 1000 / 60
			const timeMs = globalTimeMs

			if (frame === s.flipFrame && s.flipper) {
				s.flipper.getApi().RotateToEnd()
				flipped = true
			}
			if (frame === (s.flipFrame + 25) && s.flipper) {
				s.flipper.getApi().RotateToStart()
			}

			player.updatePhysics(timeMs)
			const changed = player.onFrame()

			const state = ball.getState()
			const ballExists = player.getBalls().includes(ball)
			const inStates = !!(player as any).currentStates[ball.getName()]
			const validPos = Number.isFinite(state.pos.x) && Number.isFinite(state.pos.y) && Number.isFinite(state.pos.z) && state.pos.z > -10

			if (frame % 20 === 0 || !ballExists || !inStates || !validPos) {
				console.log(`  [F${frame.toString().padStart(3)}] pos=(${state.pos.x.toFixed(1)}, ${state.pos.y.toFixed(1)}, ${state.pos.z.toFixed(1)}) vel=(${ball.hit.vel.x.toFixed(1)}, ${ball.hit.vel.y.toFixed(1)}, ${ball.hit.vel.z.toFixed(1)}) balls=${player.getBalls().length} valid=${validPos}`)
			}

			if (!ballExists || !inStates || !validPos) {
				console.error(`  FAIL at frame ${frame}: ball disappeared or invalid!`)
				disappeared = true
				changed.release()
				break
			}

			changed.release()
		}

		player.destroyBall(ball)

		if (!disappeared) {
			console.log(`  PASS: ${s.name}`)
			totalPassed++
		}
	}

	console.log(`\n=== Results: ${totalPassed}/${scenarios.length} scenarios passed ===`)
	if (totalPassed === scenarios.length) {
		console.log('SUCCESS: All gameplay physics and flipper collision tests passed!')
	} else {
		process.exit(1)
	}
}

runGameplayHarness().catch(err => {
	console.error('Error in gameplay harness:', err)
	process.exit(1)
})
