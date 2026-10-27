import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { Vertex3D } from '../math/vector.js'
import { startHost, WorkerSim } from './physics.worker.js'
import type { IBallCreationPosition } from './player.js'
import { Player } from './player.js'
import { BALL_STRIDE, createPhysicsSAB, MAX_BALLS, trySnap } from './shared/physics-buffer.js'

type Posted = {
	type: string
	id?: number
	steps?: number
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
		const workerBall = sim.spawnBall({ pos: [500, 500, startZ], vel: [0, 0, 0], radius: 25, frozen: false })

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
