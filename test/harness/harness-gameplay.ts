// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Comprehensive gameplay physics & flipper collision harness.
// Run: npx tsx test/harness/harness-gameplay.ts [--vpx=/path/to/table.vpx]
// Exit: 0 all scenarios pass, 1 on any assert failure.
import * as fs from 'node:fs'
import { Player } from '../../lib/game/player.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Vertex3D } from '../../lib/math/vector.js'
import type { Flipper } from '../../lib/vpt/flipper/flipper.js'
import { Table } from '../../lib/vpt/table/table.js'
import { Tap } from './tap.js'
import { parseVpxArgs, resolveVpxPath } from './vpinball-resolver.js'

const tap = new Tap('gameplay harness')

interface Scenario {
	name: string
	pos: Vertex3D
	vel: Vertex3D
	flipper?: Flipper
	flipFrame: number
}

async function runGameplayHarness() {
	console.log('=== Comprehensive Gameplay Physics & Flipper Collision Harness ===')
	const parsed = parseVpxArgs(process.argv.slice(2))
	const benchVpx = process.env.WALKING_DEAD_VPX ?? '/home/qinghao1/Downloads/walking_dead.vpx'
	const defaultVpx = fs.existsSync(benchVpx) ? benchVpx : 'test/fixtures/table-flipper.vpx'
	const targetVpx = parsed.vpx ? (resolveVpxPath(parsed.vpx) ?? parsed.vpx) : defaultVpx
	if (!fs.existsSync(targetVpx)) {
		tap.assert(false, `VPX not found: ${targetVpx}`)
		tap.done()
		process.exit(1)
	}
	console.log(`Loading table: ${targetVpx}`)

	const reader = new NodeBinaryReader(targetVpx)
	// Scriptless load: this harness covers flipper/ball physics, not the table
	// script pipeline (covered by the transpile/parity gates). Loading the script
	// would abort the run on any script error before a single scenario executes.
	const table = await Table.load(reader, { loadTableScript: false })
	console.log('# scriptless load: table script skipped (physics-only scenarios)')
	const flippers = Object.values(table.flippers || {})
	const leftFlipper = (table.flippers as any)?.LeftFlipper ?? flippers[0]
	const rightFlipper = (table.flippers as any)?.RightFlipper ?? flippers[1]
	if (!leftFlipper || !rightFlipper) {
		tap.assert(false, 'table has at least two flippers')
		tap.done()
		process.exit(1)
	}

	const lfCenter = leftFlipper.data.center
	const rfCenter = rightFlipper.data.center
	console.log(
		`Left flipper center: (${lfCenter.x}, ${lfCenter.y}) | Right flipper center: (${rfCenter.x}, ${rfCenter.y})`,
	)

	// Test Scenarios:
	// 1. Ball striking Left Flipper face during stroke
	// 2. Ball striking Right Flipper face during stroke
	// 3. Ball hitting Flipper tip / end radius
	// 4. Ball resting & rolling along flipper face
	const scenarios: Scenario[] = [
		{
			name: 'Left Flipper Face Strike',
			pos: new Vertex3D(lfCenter.x + 30, lfCenter.y - 120, 25),
			vel: new Vertex3D(0, 80, 0),
			flipper: leftFlipper,
			flipFrame: 25,
		},
		{
			name: 'Right Flipper Face Strike',
			pos: new Vertex3D(rfCenter.x - 30, rfCenter.y - 120, 25),
			vel: new Vertex3D(0, 80, 0),
			flipper: rightFlipper,
			flipFrame: 25,
		},
		{
			name: 'Left Flipper Tip Hit',
			pos: new Vertex3D(lfCenter.x + 100, lfCenter.y - 50, 25),
			vel: new Vertex3D(0, 50, 0),
			flipper: leftFlipper,
			flipFrame: 30,
		},
		{
			name: 'Resting & Rolling on Left Flipper',
			pos: new Vertex3D(lfCenter.x + 40, lfCenter.y - 60, 25),
			vel: new Vertex3D(0, 10, 0),
			flipper: leftFlipper,
			flipFrame: -1,
		},
	]

	for (const scenario of scenarios) {
		console.log(`\n--- Scenario: ${scenario.name} ---`)
		// Fresh Player per scenario: no shared balls, clocks, or physics state leak across runs.
		const player = new Player(table).init()
		leftFlipper.getApi().RotateToStart()
		rightFlipper.getApi().RotateToStart()

		const ballCreator = {
			getBallCreationPosition: () => scenario.pos.clone(),
			getBallCreationVelocity: () => scenario.vel.clone(),
			onBallCreated: () => {},
		}

		const ball = player.createBall(ballCreator as any)
		let timeMs = 0
		let survived = true
		let minPreVy = Number.POSITIVE_INFINITY
		let minPostVy = Number.POSITIVE_INFINITY
		let contactDuringStroke = false
		let anglePre = Number.NaN
		let anglePost = Number.NaN
		const strokeEnd = scenario.flipFrame + 25

		for (let frame = 0; frame < 120; frame++) {
			timeMs += 1000 / 60

			if (scenario.flipper) {
				if (frame === scenario.flipFrame) {
					anglePre = scenario.flipper.getState().angle
					scenario.flipper.getApi().RotateToEnd()
				}
				if (frame === strokeEnd) {
					scenario.flipper.getApi().RotateToStart()
				}
				if (frame === scenario.flipFrame + 3) {
					anglePost = scenario.flipper.getState().angle
				}
			}

			player.updatePhysics(timeMs)
			const changed = player.onFrame()

			const state = ball.getState()
			const ballExists = player.getBalls().includes(ball)
			const inStates = !!(player as any).currentStates?.[ball.getName()]
			const vel = ball.hit.vel
			const validPos =
				Number.isFinite(state.pos.x) &&
				Number.isFinite(state.pos.y) &&
				Number.isFinite(state.pos.z) &&
				state.pos.z > -10
			const validVel = Number.isFinite(vel.x) && Number.isFinite(vel.y) && Number.isFinite(vel.z)

			if (scenario.flipFrame >= 0 && frame >= scenario.flipFrame - 10 && frame < scenario.flipFrame) {
				minPreVy = Math.min(minPreVy, vel.y)
			}
			if (scenario.flipFrame >= 0 && frame > scenario.flipFrame && frame <= strokeEnd) {
				minPostVy = Math.min(minPostVy, vel.y)
				if (scenario.flipper?.getMover().isInContact) contactDuringStroke = true
			}

			if (frame % 20 === 0 || !ballExists || !inStates || !validPos || !validVel) {
				console.log(
					`  [F${frame.toString().padStart(3)}] pos=(${state.pos.x.toFixed(1)}, ${state.pos.y.toFixed(1)}, ${state.pos.z.toFixed(1)}) vel=(${vel.x.toFixed(1)}, ${vel.y.toFixed(1)}, ${vel.z.toFixed(1)}) balls=${player.getBalls().length} valid=${validPos && validVel}`,
				)
			}

			if (!ballExists || !inStates || !validPos || !validVel) {
				console.error(`  FAIL at frame ${frame}: ball disappeared or invalid!`)
				survived = false
				changed.release()
				break
			}

			changed.release()
		}

		tap.assert(survived, `${scenario.name}: ball survives 120 frames with finite pos+vel`)
		if (!survived) continue
		if (scenario.flipFrame >= 0 && scenario.flipper) {
			const swing = Math.abs(anglePost - anglePre)
			console.log(
				`  flip: angle ${anglePre.toFixed(3)} -> ${anglePost.toFixed(3)} (swing=${swing.toFixed(3)} rad), contact=${contactDuringStroke}, minPreVy=${minPreVy.toFixed(1)}, minPostVy=${minPostVy.toFixed(1)}`,
			)
			tap.assert(
				Number.isFinite(swing) && swing > 0.2,
				`${scenario.name}: flipper actuates (swing=${swing.toFixed(2)} rad)`,
			)
			// A strike needs both bat contact AND upward impulse from the flip (post
			// lower than pre by a margin): a graze or an unrelated wall bounce must
			// not engage the rebound asserts.
			const struck = contactDuringStroke && minPostVy < minPreVy - 1.0
			if (struck) {
				// Ball was on the bat during the stroke: the flip must launch it upward (-y).
				tap.assert(minPostVy < 0, `${scenario.name}: post-flip vel.y sign is upward (${minPostVy.toFixed(1)})`)
				tap.assert(
					minPostVy < -3,
					`${scenario.name}: post-flip vel.y magnitude is a strike (${minPostVy.toFixed(1)})`,
				)
			} else {
				console.log(
					`  no strike (contact=${contactDuringStroke}) — rebound asserts skipped for ${scenario.name}`,
				)
			}
		} else {
			const endVel = ball.hit.vel
			const endSpeed = Math.hypot(endVel.x, endVel.y, endVel.z)
			console.log(`  rest: endSpeed=${endSpeed.toFixed(1)}`)
			tap.assert(endSpeed < 20, `${scenario.name}: resting ball settles (speed=${endSpeed.toFixed(1)})`)
		}
	}

	const passed = tap.done()
	console.log(passed ? '\n# gameplay harness PASS' : '\n# gameplay harness FAIL')
	process.exit(passed ? 0 : 1)
}

runGameplayHarness().catch(err => {
	console.error('Error in gameplay harness:', err)
	process.exit(1)
})
