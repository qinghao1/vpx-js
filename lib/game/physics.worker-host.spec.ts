import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { Vertex3D } from '../math/vector.js'
import { DIK_1 } from './key-code.js'
import { startHost, type WorkerBallState, WorkerSim } from './physics.worker.js'
import type { IBallCreationPosition } from './player.js'
import { Player } from './player.js'
import {
	BALL_STRIDE,
	createPhysicsSAB,
	INPUT_KEY_DOWN,
	INPUT_NUDGE,
	MAX_BALLS,
	pushInput,
	trySnap,
} from './shared/physics-buffer.js'

type Posted = {
	type: string
	balls?: number
	id?: number
	steps?: number
	epoch?: number
}

function makeHost() {
	const posted: Posted[] = []
	const host = {
		postMessage: (message: unknown): void => {
			posted.push(message as Posted)
		},
		onmessage: null as ((event: MessageEvent) => void) | null,
	}
	const send = (data: unknown): void => {
		host.onmessage?.({ data } as MessageEvent)
	}
	return { host, posted, send }
}

async function waitFor(pred: () => boolean, what: string, timeoutMs = 20000): Promise<void> {
	const start = Date.now()
	while (!pred()) {
		if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`)
		await new Promise(resolve => setTimeout(resolve, 10))
	}
}

// Lets an already-scheduled host tick (or its absence) settle: message handling
// is synchronous, so a bounded macrotask flush proves no stray ack/tick is
// pending without a fixed 300-500ms sleep. (Fake timers don't fit: the loop's
// setTimeout chain and the async VPX table load need the real clock.)
async function flushMacrotasks(rounds = 10): Promise<void> {
	for (let i = 0; i < rounds; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

const dropAt = (x: number, y: number, z: number): IBallCreationPosition => ({
	getBallCreationPosition: () => new Vertex3D(x, y, z),
	getBallCreationVelocity: () => new Vertex3D(0, 0, 0),
	onBallCreated: () => {},
})

describe('physics worker host wiring', () => {
	it('runs the viewer protocol over the shared buffer: ready/start/frames/ping/stop', async () => {
		const { host, posted, send } = makeHost()
		startHost(host)
		expect(posted[0]).toMatchObject({ type: 'worker-ready' })

		const sab = createPhysicsSAB()
		const vpx = new Uint8Array(readFileSync('test/fixtures/table-empty.vpx'))
		send({ type: 'init', sab, vpx })
		await waitFor(() => posted.some(m => m.type === 'ready'), 'ready')

		send({ type: 'start' })
		await waitFor(() => posted.some(m => m.type === 'started'), 'started')

		const out = new Float32Array(MAX_BALLS * BALL_STRIDE)
		await waitFor(() => {
			const frame = trySnap(sab, out)
			return !!frame && frame.timeMsec >= 30
		}, 'advancing frames')

		send({ type: 'ping', id: 7 })
		let pongId = -1
		let pongSteps = 0
		await waitFor(() => {
			const pong = posted.find(m => m.type === 'pong')
			if (!pong) return false
			pongId = pong.id ?? -1
			pongSteps = pong.steps ?? 0
			return true
		}, 'pong')
		expect(pongId).toBe(7)
		expect(pongSteps).toBeGreaterThan(0)

		send({ type: 'stop' })
		await waitFor(() => posted.some(m => m.type === 'stopped'), 'stopped')
		expect(posted.some(m => m.type === 'error')).toBe(false)
	}, 30000)

	it('worker sim agrees with the main-thread player trajectory', () => {
		const startZ = 1000
		const mkTable = () => {
			const table = new TableBuilder().build()
			table.data.glassHeight = 4000
			return table
		}

		const player = new Player(mkTable()).init()
		// Player.createBall adds the radius on top of the creation position, so
		// pass the bottom to start the center at startZ like spawnBall does.
		const ball = player.createBall(dropAt(500, 500, startZ - 25), 25)
		const sim = new WorkerSim(mkTable())
		const workerBall = sim.spawnBall({
			id: ball.id,
			pos: [500, 500, startZ],
			vel: [0, 0, 0],
			radius: 25,
			frozen: false,
		})

		for (let timeMs = 16; timeMs <= 2000; timeMs += 16) {
			player.updatePhysics(timeMs)
			sim.physics.updatePhysics(timeMs)
		}
		expect(workerBall.state.pos.z).toBeLessThan(startZ)
		expect(Math.abs(ball.state.pos.z - workerBall.state.pos.z)).toBeLessThan(1e-9)
		expect(Math.abs(ball.hit.vel.z - workerBall.hit.vel.z)).toBeLessThan(1e-9)

		for (let timeMs = 2016; timeMs <= 4000; timeMs += 16) {
			player.updatePhysics(timeMs)
			sim.physics.updatePhysics(timeMs)
		}
		expect(Math.abs(ball.hit.vel.z)).toBeLessThan(2)
		expect(ball.state.pos.z).toBeGreaterThan(10)
		expect(Math.abs(ball.state.pos.z - workerBall.state.pos.z)).toBeLessThan(1e-6)
	})
})

describe('physics worker protocol hardening', () => {
	const loadVpx = (): Uint8Array => new Uint8Array(readFileSync('test/fixtures/table-empty.vpx'))

	const pongSteps = (posted: Posted[], id: number): number | undefined =>
		posted.find(m => m.type === 'pong' && m.id === id)?.steps

	it('rejects init with an invalid SAB instead of stalling later', async () => {
		const { host, posted, send } = makeHost()
		startHost(host)
		send({ type: 'init', sab: new ArrayBuffer(8) as unknown as SharedArrayBuffer, vpx: loadVpx() })
		await waitFor(() => posted.some(m => m.type === 'error'), 'init sab error')
		expect(posted.some(m => m.type === 'ready')).toBe(false)
	}, 30000)

	it('ignores a SAB smuggled on non-init messages', async () => {
		const { host, posted, send } = makeHost()
		startHost(host)
		const sab = createPhysicsSAB()
		send({ type: 'init', sab, vpx: loadVpx() })
		await waitFor(() => posted.some(m => m.type === 'ready'), 'ready')
		send({ type: 'start' })
		await waitFor(() => posted.some(m => m.type === 'started'), 'started')
		const out = new Float32Array(MAX_BALLS * BALL_STRIDE)
		await waitFor(() => (trySnap(sab, out)?.timeMsec ?? 0) >= 30, 'advancing frames')

		send({ type: 'ping', id: 101, sab: new ArrayBuffer(8) as unknown as SharedArrayBuffer })
		await waitFor(() => pongSteps(posted, 101) !== undefined, 'pong 101')
		const before = pongSteps(posted, 101) ?? 0
		// Poll for a live tick via fresh pings instead of a fixed sleep: each
		// ping answers synchronously with the current step count (unique ids —
		// pongSteps reads the first match per id).
		let probe = 1000
		await waitFor(() => {
			probe++
			send({ type: 'ping', id: probe })
			return (pongSteps(posted, probe) ?? 0) > before
		}, 'steps advance past smuggled SAB')
		expect(posted.some(m => m.type === 'error')).toBe(false)

		send({ type: 'stop' })
		await waitFor(() => posted.some(m => m.type === 'stopped'), 'stopped')
	}, 30000)

	it('re-init stops the loop and resets counters before reloading', async () => {
		const { host, posted, send } = makeHost()
		startHost(host)
		const sab = createPhysicsSAB()
		send({ type: 'init', sab, vpx: loadVpx() })
		await waitFor(() => posted.some(m => m.type === 'ready'), 'ready')
		send({ type: 'start' })
		await waitFor(() => posted.some(m => m.type === 'started'), 'started')
		const out = new Float32Array(MAX_BALLS * BALL_STRIDE)
		await waitFor(() => (trySnap(sab, out)?.timeMsec ?? 0) >= 30, 'advancing frames')

		const readies = (): number => posted.filter(m => m.type === 'ready').length
		const readiesBefore = readies()
		send({ type: 'init', sab, vpx: loadVpx() })
		await waitFor(() => readies() > readiesBefore, 'second ready')
		send({ type: 'ping', id: 201 })
		await waitFor(() => pongSteps(posted, 201) !== undefined, 'pong 201')
		expect(pongSteps(posted, 201)).toBe(0)
		// Re-init halted the loop and cleared its timer, so flushing pending
		// macrotasks settles any stray tick without a fixed sleep.
		await flushMacrotasks()
		send({ type: 'ping', id: 202 })
		await waitFor(() => pongSteps(posted, 202) !== undefined, 'pong 202')
		expect(pongSteps(posted, 202)).toBe(0)
		expect(posted.some(m => m.type === 'error')).toBe(false)

		send({ type: 'start' })
		await waitFor(() => posted.filter(m => m.type === 'started').length >= 2, 'restarted')
		await waitFor(() => (trySnap(sab, out)?.timeMsec ?? 0) >= 30, 'frames after restart')
		send({ type: 'stop' })
		await waitFor(() => posted.some(m => m.type === 'stopped'), 'stopped')
	}, 60000)

	it('withholds started until a live tick, then kicks a parked start', async () => {
		const { host, posted, send } = makeHost()
		startHost(host)
		send({ type: 'init', vpx: loadVpx() })
		await waitFor(() => posted.some(m => m.type === 'error'), 'init sab error')
		expect(posted.some(m => m.type === 'ready')).toBe(false)
		send({ type: 'start' })
		await flushMacrotasks()
		expect(posted.some(m => m.type === 'started')).toBe(false)

		const sab = createPhysicsSAB()
		send({ type: 'init', sab, vpx: loadVpx() })
		await waitFor(() => posted.some(m => m.type === 'ready'), 'ready')
		await waitFor(() => posted.some(m => m.type === 'started'), 'started')
		const out = new Float32Array(MAX_BALLS * BALL_STRIDE)
		await waitFor(() => (trySnap(sab, out)?.timeMsec ?? 0) >= 30, 'advancing frames')
		expect(posted.filter(m => m.type === 'error').length).toBe(1)
		send({ type: 'stop' })
		await waitFor(() => posted.some(m => m.type === 'stopped'), 'stopped')
	}, 60000)

	it('reports unknown and malformed messages instead of dropping them', async () => {
		const { host, posted, send } = makeHost()
		startHost(host)
		send({ type: 'init', sab: createPhysicsSAB(), vpx: loadVpx() })
		await waitFor(() => posted.some(m => m.type === 'ready'), 'ready')
		send({ type: 'frobnicate' })
		send({ type: 'syncBalls' })
		send({ type: 'syncBalls', balls: 'nope' })
		send({ type: 'teleportBall', index: 0 })
		send({ type: 'teleportBall' })
		await waitFor(() => posted.filter(m => m.type === 'error').length >= 5, 'five errors')
	}, 30000)

	it('recovers ball counts through the syncBalls message path', async () => {
		const { host, posted, send } = makeHost()
		startHost(host)
		const sab = createPhysicsSAB()
		send({ type: 'init', sab, vpx: loadVpx() })
		await waitFor(() => posted.some(m => m.type === 'ready'), 'ready')
		const pongBalls = async (id: number): Promise<number> => {
			send({ type: 'ping', id })
			await waitFor(() => posted.some(m => m.type === 'pong' && m.id === id), `pong ${id}`)
			return posted.find(m => m.type === 'pong' && m.id === id)?.balls ?? -1
		}
		let nextId = 1000
		const ball = (frozen: boolean): WorkerBallState => ({
			id: nextId++,
			pos: [0, 0, 50],
			vel: [0, 0, 0],
			radius: 25,
			frozen,
		})
		// Grow: main-thread creation (trough eject, multiball) converges the worker list.
		send({ type: 'syncBalls', balls: [ball(false), ball(false)] })
		expect(await pongBalls(1)).toBe(2)
		// Shrink: main-thread destroy (drain, kicker release) converges too —
		// counts never self-heal through drift, so this path is the recovery.
		send({ type: 'syncBalls', balls: [ball(true)] })
		expect(await pongBalls(2)).toBe(1)
		expect(posted.some(m => m.type === 'error')).toBe(false)
	}, 30000)

	it('acks stop/pause/resume only on real transitions', async () => {
		const { host, posted, send } = makeHost()
		startHost(host)
		send({ type: 'stop' })
		send({ type: 'pause' })
		send({ type: 'resume' })
		await flushMacrotasks()
		expect(posted.map(m => m.type)).toEqual(['worker-ready'])

		send({ type: 'init', sab: createPhysicsSAB(), vpx: loadVpx() })
		await waitFor(() => posted.some(m => m.type === 'ready'), 'ready')
		const count = (type: string): number => posted.filter(m => m.type === type).length
		send({ type: 'pause' })
		send({ type: 'pause' })
		send({ type: 'resume' })
		send({ type: 'resume' })
		expect(count('paused')).toBe(1)
		expect(count('resumed')).toBe(1)
		send({ type: 'stop' })
		expect(count('stopped')).toBe(0)
		send({ type: 'start' })
		await waitFor(() => posted.some(m => m.type === 'started'), 'started')
		send({ type: 'stop' })
		await waitFor(() => posted.some(m => m.type === 'stopped'), 'stopped')
		expect(count('stopped')).toBe(1)
	}, 30000)

	it('acks syncBalls epochs so the main thread can gate resync', async () => {
		const { host, posted, send } = makeHost()
		startHost(host)
		const sab = createPhysicsSAB()
		send({ type: 'init', sab, vpx: loadVpx() })
		await waitFor(() => posted.some(m => m.type === 'ready'), 'ready')
		const syncedEpochs = (): (number | undefined)[] => posted.filter(m => m.type === 'synced').map(m => m.epoch)
		const ball = (id: number): WorkerBallState => ({
			id,
			pos: [0, 0, 50],
			vel: [0, 0, 0],
			radius: 25,
			frozen: false,
		})
		send({ type: 'syncBalls', epoch: 4, balls: [ball(2001)] })
		await waitFor(() => syncedEpochs().includes(4), 'synced 4')
		// Latest-wins pre-init coverage is separate; here each applied sync acks its own epoch.
		send({ type: 'syncBalls', epoch: 5, balls: [ball(2001), ball(2002)] })
		await waitFor(() => syncedEpochs().includes(5), 'synced 5')
		expect(syncedEpochs()).toEqual([4, 5])
		// Unknown-id teleports stay silent: no ack, no error, no corruption.
		const errorsBefore = posted.filter(m => m.type === 'error').length
		send({ type: 'teleportBall', id: 9999, pos: [1, 2, 3], vel: [0, 0, 0] })
		await flushMacrotasks()
		expect(posted.filter(m => m.type === 'error').length).toBe(errorsBefore)
		expect(posted.filter(m => m.type === 'synced').length).toBe(2)
		send({ type: 'teleportBall', id: 2002, pos: [7, 8, 9], vel: [0, 0, 0] })
		await flushMacrotasks()
		expect(posted.filter(m => m.type === 'error').length).toBe(errorsBefore)
	}, 30000)

	it('applies a queued loading-window sync on load and acks its epoch', async () => {
		const { host, posted, send } = makeHost()
		startHost(host)
		const sab = createPhysicsSAB()
		send({ type: 'init', sab, vpx: loadVpx() })
		// Sync while the table loads (sim not yet constructed) queues latest-wins;
		// the ack lands after load applies it.
		send({
			type: 'syncBalls',
			epoch: 9,
			balls: [{ id: 3001, pos: [0, 0, 50], vel: [0, 0, 0], radius: 25, frozen: false }],
		})
		await waitFor(() => posted.some(m => m.type === 'ready'), 'ready')
		await waitFor(() => posted.some(m => m.type === 'synced' && m.epoch === 9), 'synced 9')
		send({ type: 'ping', id: 301 })
		await waitFor(() => posted.some(m => m.type === 'pong' && m.id === 301), 'pong 301')
		expect(posted.find(m => m.type === 'pong' && m.id === 301)?.balls).toBe(1)
		expect(posted.some(m => m.type === 'error')).toBe(false)
	}, 30000)
})

describe('physics worker script/emu edit propagation', () => {
	it('applies frozen-only ball edits without waiting for drift', () => {
		const table = new TableBuilder().build()
		table.data.glassHeight = 4000
		const sim = new WorkerSim(table)
		sim.syncBalls([{ id: 91, pos: [100, 200, 300], vel: [0, 0, 0], radius: 25, frozen: false }])
		expect(sim.physics.balls[0].state.isFrozen).toBe(false)
		// Frozen-only change: identical pos/vel, so no drift budget would ever trip.
		sim.syncBalls([{ id: 91, pos: [100, 200, 300], vel: [0, 0, 0], radius: 25, frozen: true }])
		expect(sim.physics.balls.length).toBe(1)
		expect(sim.physics.balls[0].state.isFrozen).toBe(true)
		expect(sim.physics.balls[0].state.pos.x).toBe(100)
		// Same through the discrete teleport op the viewer sends on frozen mismatch.
		expect(sim.teleportBall({ id: 91, pos: [100, 200, 300], vel: [0, 0, 0], radius: 25, frozen: false })).toBe(true)
		expect(sim.physics.balls[0].state.isFrozen).toBe(false)
	})

	it('nudges identically on the main thread and through the input ring', () => {
		const mkMain = (): { player: Player; ball: ReturnType<Player['createBall']> } => {
			const table = new TableBuilder().build()
			table.data.glassHeight = 4000
			const player = new Player(table).init()
			return { player, ball: player.createBall(dropAt(500, 500, 975), 25) }
		}
		const mkWorker = (id: number): { sim: WorkerSim; ball: ReturnType<WorkerSim['spawnBall']> } => {
			const table = new TableBuilder().build()
			table.data.glassHeight = 4000
			const sim = new WorkerSim(table)
			const ball = sim.spawnBall({ id, pos: [500, 500, 1000], vel: [0, 0, 0], radius: 25, frozen: false })
			return { sim, ball }
		}
		const main = mkMain()
		const worker = mkWorker(main.ball.id)
		main.player.nudge(285, 2.6)
		const sab = createPhysicsSAB()
		expect(pushInput(sab, INPUT_NUDGE, Math.round(2.6 * 1000), 285)).toBe(true)
		expect(worker.sim.drainInputs(sab)).toBe(1)
		expect(worker.sim.pinInput.getNudgeHandler().getIndex()).toBe(main.player.getNudgeHandler().getIndex())
		for (let timeMs = 16; timeMs <= 500; timeMs += 16) {
			main.player.updatePhysics(timeMs)
			worker.sim.physics.updatePhysics(timeMs)
		}
		// Integer angles and force×1000 survive the ring exactly (float32/uint16),
		// so both sims run bit-identical cabinet impulses; assert tight.
		const mainAcc = main.player.getPhysics().getCabinetAcceleration()
		const workerAcc = worker.sim.physics.getCabinetAcceleration()
		expect(Math.abs(mainAcc.x - workerAcc.x)).toBeLessThan(1e-12)
		expect(Math.abs(mainAcc.y - workerAcc.y)).toBeLessThan(1e-12)
		expect(Math.abs(main.ball.state.pos.x - worker.ball.state.pos.x)).toBeLessThan(1e-9)
		expect(Math.abs(main.ball.state.pos.y - worker.ball.state.pos.y)).toBeLessThan(1e-9)
		expect(Math.abs(main.ball.state.pos.z - worker.ball.state.pos.z)).toBeLessThan(1e-9)
		expect(Math.abs(main.ball.hit.vel.x - worker.ball.hit.vel.x)).toBeLessThan(1e-9)
	})

	it('applies ring nudges whose force slot collides with the filtered start key', () => {
		const sim = new WorkerSim(new TableBuilder().build())
		const before = sim.pinInput.getNudgeHandler().getIndex()
		const sab = createPhysicsSAB()
		// force DIK_1/1000 encodes to key DIK_1: the start-key filter must not swallow it.
		expect(pushInput(sab, INPUT_NUDGE, DIK_1, 90)).toBe(true)
		expect(sim.drainInputs(sab)).toBe(1)
		expect(sim.pinInput.getNudgeHandler().getIndex()).toBe(before + 1)
		// While a real Start key press stays main-thread owned.
		expect(pushInput(sab, INPUT_KEY_DOWN, DIK_1, 0)).toBe(true)
		sim.drainInputs(sab)
		expect(sim.pinInput.getNudgeHandler().getIndex()).toBe(before + 1)
	})
})
