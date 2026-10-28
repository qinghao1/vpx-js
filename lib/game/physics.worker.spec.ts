import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { DIK_1, DIK_LSHIFT, DIK_Z } from './key-code.js'
import { isSimFilteredKey, loadWorkerTable, WorkerSim } from './physics.worker.js'
import {
	createPhysicsSAB,
	INPUT_KEY_DOWN,
	INPUT_KEY_UP,
	pushInput,
	trySnap,
	writeFrame,
} from './shared/physics-buffer.js'

function stepSim(sim: WorkerSim, untilMs: number, stepMs = 16): void {
	for (let time = stepMs; time <= untilMs; time += stepMs) sim.physics.updatePhysics(time)
}

describe('physics.worker', () => {
	it('boots without a worker host (import has no side effects)', () => {
		expect(typeof WorkerSim).toBe('function')
	})

	it('drops a spawned ball under gravity without falling through the playfield', () => {
		const table = new TableBuilder().build()
		table.data.glassHeight = 4000
		const sim = new WorkerSim(table)
		const ball = sim.spawnBall({ id: 11, pos: [500, 500, 1000], vel: [0, 0, 0], radius: 25, frozen: false })
		expect(sim.physics.balls.length).toBe(1)
		stepSim(sim, 4000)
		expect(ball.state.pos.z).toBeLessThan(1000)
		expect(ball.state.pos.z).toBeGreaterThan(10)
		expect(Math.abs(ball.hit.vel.z)).toBeLessThan(2)
	})

	it('settles the ball instead of bouncing forever', () => {
		const table = new TableBuilder().build()
		table.data.glassHeight = 4000
		const sim = new WorkerSim(table)
		const ball = sim.spawnBall({ id: 12, pos: [500, 500, 1000], vel: [0, 0, 0], radius: 25, frozen: false })
		stepSim(sim, 3000)
		const resting = ball.state.pos.z
		stepSim(sim, 4000)
		expect(Math.abs(ball.state.pos.z - resting)).toBeLessThan(5)
	})

	it('routes ring input into simulated nudge forces', () => {
		const build = () => {
			const table = new TableBuilder().build()
			table.data.glassHeight = 4000
			const sim = new WorkerSim(table)
			const ball = sim.spawnBall({ id: 13, pos: [500, 500, 1000], vel: [0, 0, 0], radius: 25, frozen: false })
			return { sim, ball }
		}
		const control = build()
		const nudged = build()
		const handler = nudged.sim.pinInput.getNudgeHandler()
		const before = handler.getIndex()
		const sab = createPhysicsSAB()
		expect(pushInput(sab, INPUT_KEY_DOWN, DIK_Z, 0)).toBe(true)
		nudged.sim.drainInputs(sab)
		stepSim(control.sim, 500)
		stepSim(nudged.sim, 500)
		expect(handler.getIndex()).not.toBe(before)
		expect(Math.abs(nudged.ball.state.pos.x - control.ball.state.pos.x)).toBeGreaterThan(0.1)
	})

	it('ignores the start key so the main thread owns trough ejection', () => {
		const table = new TableBuilder().addKicker('Kicker1').build()
		const sim = new WorkerSim(table)
		table.kickers.Kicker1.getApi().CreateBall()
		expect(sim.physics.balls.length).toBe(1)
		const sab = createPhysicsSAB()
		pushInput(sab, INPUT_KEY_DOWN, DIK_1, 0)
		pushInput(sab, INPUT_KEY_UP, DIK_1, 0)
		sim.drainInputs(sab)
		stepSim(sim, 500)
		const ball = sim.physics.balls[0]
		expect(ball.hit.vel.length()).toBeLessThan(1)
	})

	it('filters the start key so the main thread owns trough creation', () => {
		expect(isSimFilteredKey(DIK_1, 0x02)).toBe(true)
		expect(isSimFilteredKey(0x2f, 0x2f)).toBe(true)
		expect(isSimFilteredKey(DIK_LSHIFT, DIK_1)).toBe(false)
	})

	it('publishes live balls through the frame buffer', () => {
		const sim = new WorkerSim(new TableBuilder().build())
		sim.spawnBall({ id: 21, pos: [100, 200, 300], vel: [1, 2, 3], radius: 25, frozen: false })
		sim.spawnBall({ id: 22, pos: [400, 500, 600], vel: [0, 0, 0], radius: 30, frozen: true })
		stepSim(sim, 32)
		const sab = createPhysicsSAB()
		const scratch = new Float32Array(32 * 12)
		const count = sim.packBalls(scratch)
		expect(count).toBe(2)
		writeFrame(sab, scratch, count, 0, 32, 32)
		const out = new Float32Array(32 * 12)
		const frame = trySnap(sab, out)
		expect(frame?.count).toBe(2)
		const live = sim.physics.balls[0]
		expect(out[0]).toBeCloseTo(live.state.pos.x)
		expect(out[1]).toBeCloseTo(live.state.pos.y)
		expect(out[3]).toBeCloseTo(live.hit.vel.x)
		expect(out[6]).toBeCloseTo(25)
		expect(out[7]).toBe(21)
		expect(out[7]).toBe(live.id)
		expect(out[8]).toBe(0)
		expect(out[12 + 6]).toBeCloseTo(30)
		expect(out[12 + 7]).toBe(22)
		expect(out[12 + 8]).toBe(1)
	})

	it('reconciles the ball list with main-thread snapshots', () => {
		const sim = new WorkerSim(new TableBuilder().build())
		sim.syncBalls([
			{ id: 31, pos: [10, 20, 50], vel: [0, 0, 0], radius: 25, frozen: false },
			{ id: 32, pos: [110, 120, 150], vel: [4, 5, 6], radius: 25, frozen: false },
		])
		expect(sim.physics.balls.length).toBe(2)
		expect(sim.physics.balls[0].state.pos.z).toBeCloseTo(50)
		expect(sim.teleportBall({ id: 31, pos: [1, 2, 3], vel: [7, 8, 9], radius: 25, frozen: true })).toBe(true)
		expect(sim.physics.balls[0].state.pos.x).toBe(1)
		expect(sim.physics.balls[0].hit.vel.z).toBe(9)
		expect(sim.physics.balls[0].state.isFrozen).toBe(true)
		sim.syncBalls([{ id: 31, pos: [1, 2, 3], vel: [7, 8, 9], radius: 25, frozen: true }])
		expect(sim.physics.balls.length).toBe(1)
		sim.destroyBallAt(0)
		expect(sim.physics.balls.length).toBe(0)
	})

	it('assigns the id triple at spawn and never mutates live ids', () => {
		const sim = new WorkerSim(new TableBuilder().build())
		const ball = sim.spawnBall({ id: 41, pos: [100, 200, 300], vel: [1, 2, 3], radius: 25, frozen: false })
		expect(ball.id).toBe(41)
		expect(ball.getName()).toBe('Ball41')
		expect(ball.state.name).toBe('Ball41')
		const scratch = new Float32Array(32 * 12)
		expect(sim.packBalls(scratch)).toBe(1)
		expect(scratch[7]).toBe(41)
		// A later sync for the same id teleports the same object in place: the
		// id survives, only pos/vel/frozen move.
		sim.syncBalls([{ id: 41, pos: [9, 9, 9], vel: [9, 9, 9], radius: 25, frozen: true }])
		expect(sim.physics.balls.length).toBe(1)
		expect(sim.physics.balls[0]).toBe(ball)
		expect(ball.id).toBe(41)
		expect(ball.getName()).toBe('Ball41')
		expect(ball.state.pos.x).toBe(9)
		expect(ball.state.isFrozen).toBe(true)
	})

	it('reconciles a destroy-first same-count shift with no aliasing', () => {
		const sim = new WorkerSim(new TableBuilder().build())
		sim.syncBalls([
			{ id: 51, pos: [10, 20, 50], vel: [0, 0, 0], radius: 25, frozen: false },
			{ id: 52, pos: [110, 120, 150], vel: [0, 0, 0], radius: 25, frozen: false },
		])
		const survivor = sim.physics.balls.find(ball => ball.id === 52)
		const retired = sim.physics.balls.find(ball => ball.id === 51)
		expect(survivor).toBeDefined()
		// Destroy-first + create at the same count: the surviving id keeps its
		// object, the retired id is gone, and the newborn is a fresh object
		// carrying the message id — never the retired object with a new id.
		sim.syncBalls([
			{ id: 52, pos: [110, 120, 150], vel: [0, 0, 0], radius: 25, frozen: false },
			{ id: 53, pos: [210, 220, 250], vel: [0, 0, 0], radius: 25, frozen: false },
		])
		expect(sim.physics.balls.map(ball => ball.id).sort((a, b) => a - b)).toEqual([52, 53])
		expect(sim.physics.balls.find(ball => ball.id === 52)).toBe(survivor)
		const newborn = sim.physics.balls.find(ball => ball.id === 53)
		expect(newborn).toBeDefined()
		expect(newborn).not.toBe(retired)
		expect(newborn?.getName()).toBe('Ball53')
		expect(retired && sim.physics.balls.includes(retired)).toBe(false)
	})

	it('treats an unknown-id teleport as a no-op', () => {
		const sim = new WorkerSim(new TableBuilder().build())
		sim.syncBalls([{ id: 61, pos: [10, 20, 50], vel: [0, 0, 0], radius: 25, frozen: false }])
		const before = sim.physics.balls[0].state.pos.x
		expect(sim.teleportBall({ id: 62, pos: [1, 2, 3], vel: [4, 5, 6], radius: 25, frozen: true })).toBe(false)
		expect(sim.physics.balls.length).toBe(1)
		expect(sim.physics.balls[0].id).toBe(61)
		expect(sim.physics.balls[0].state.pos.x).toBe(before)
		expect(sim.physics.balls[0].state.isFrozen).toBe(false)
	})

	it('resolves a teleport-before-sync post-sync without corruption', () => {
		const sim = new WorkerSim(new TableBuilder().build())
		// The teleport races ahead of the sync carrying its ball: dropped, not applied.
		expect(sim.teleportBall({ id: 71, pos: [1, 2, 3], vel: [4, 5, 6], radius: 25, frozen: false })).toBe(false)
		expect(sim.physics.balls.length).toBe(0)
		sim.syncBalls([{ id: 71, pos: [10, 20, 50], vel: [0, 0, 0], radius: 25, frozen: true }])
		expect(sim.physics.balls.length).toBe(1)
		expect(sim.physics.balls[0].id).toBe(71)
		expect(sim.physics.balls[0].state.pos.x).toBe(10)
		expect(sim.physics.balls[0].state.isFrozen).toBe(true)
	})

	it('loads a real table from vpx bytes with textures and script skipped', async () => {
		const bytes = new Uint8Array(readFileSync('test/fixtures/table-empty.vpx'))
		const table = await loadWorkerTable(bytes)
		expect(table.tableScript).toBeFalsy()
		expect(Object.keys(table.textures ?? {}).length).toBe(0)
		const sim = new WorkerSim(table)
		stepSim(sim, 64)
		expect(sim.physics.timeMsec).toBeGreaterThan(0)
		const ball = sim.spawnBall({ id: 81, pos: [500, 500, 800], vel: [0, 0, 0], radius: 25, frozen: false })
		stepSim(sim, 128)
		expect(ball.state.pos.z).toBeLessThan(800)
	}, 30000)
})
