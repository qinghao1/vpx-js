// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BinaryReader } from '../io/binary-reader.js'
import { Vertex3D } from '../math/vector.js'
import { DEFAULT_BALL_SIZE } from '../physics/constants.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { Table } from '../vpt/table/table.js'
import { AssignKey, DIK_1 } from './key-code.js'
import { PinInput } from './pin-input.js'
import type { IBallCreationPosition, Player } from './player.js'
import { PlayerPhysics } from './player-physics.js'
import {
	BALL_FROZEN,
	BALL_ID,
	BALL_POS,
	BALL_RADIUS,
	BALL_RESERVED,
	BALL_STRIDE,
	BALL_VEL,
	drainInput,
	INPUT_KEY_DOWN,
	INPUT_KEY_UP,
	type InputEvent,
	MAX_BALLS,
	writeFrame,
} from './shared/physics-buffer.js'

type ProcessShim = {
	env: Record<string, string>
	browser: boolean
	platform: string
	version: string
	argv: string[]
	cwd: () => string
	nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => void
	on: (...args: never[]) => void
	once: (...args: never[]) => void
	off: (...args: never[]) => void
	addListener: (...args: never[]) => void
	removeListener: (...args: never[]) => void
	removeAllListeners: (...args: never[]) => void
	emit: (...args: never[]) => void
}

type HostScope = {
	process?: ProcessShim
	global?: typeof globalThis
	localStorage?: Storage
}

/** `process` event-emitter methods the table chain may call; missing ones become no-ops. */
const EMITTER_METHODS = ['on', 'once', 'off', 'addListener', 'removeListener', 'removeAllListeners', 'emit'] as const

/** Browser globals the table chain (wpc-emu) expects; installed before its lazy import. No-op in Node. */
function installHostShims(): void {
	const scope = globalThis as unknown as HostScope
	const noop = () => {}
	// Top up rather than replace: bundler preludes may have installed a bare process object already.
	const proc = (scope.process ??= {
		env: {},
		browser: true,
		platform: 'browser',
		version: '',
		argv: [],
		cwd: () => '/',
		nextTick: (callback, ...args) => queueMicrotask(() => callback(...args)),
		on: noop,
		once: noop,
		off: noop,
		addListener: noop,
		removeListener: noop,
		removeAllListeners: noop,
		emit: noop,
	})
	for (const name of EMITTER_METHODS) {
		proc[name] ??= noop
	}
	proc.nextTick ??= (callback, ...args) => queueMicrotask(() => callback(...args))
	proc.cwd ??= () => '/'
	scope.global ??= globalThis
	if (typeof scope.localStorage === 'undefined') {
		const store = new Map<string, string>()
		scope.localStorage = {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => store.set(key, String(value)),
			removeItem: (key: string) => {
				store.delete(key)
			},
			clear: () => store.clear(),
			key: (index: number) => Array.from(store.keys())[index] ?? null,
			get length() {
				return store.size
			},
		}
	}
}

installHostShims()

/** Minimal ball snapshot crossing the thread boundary in either direction. */
export type WorkerBallState = {
	pos: [number, number, number]
	vel: [number, number, number]
	radius: number
	frozen: boolean
}

type WorkerHost = {
	postMessage(message: unknown): void
	onmessage: ((event: MessageEvent) => void) | null
}

function resolveWorkerHost(): WorkerHost | null {
	const scope = globalThis as unknown as { WorkerGlobalScope?: unknown; self?: unknown }
	if (typeof scope.WorkerGlobalScope === 'undefined') return null
	return scope.self as WorkerHost
}

/** Headless Player surface: only what item apis, hits and movers reach without scripts or emu.
 * Input stays DIK-level (Player only exposes DOM-level events), scripts/emu/render stay on the main thread. */
class SimPlayerShim {
	private pinInput?: PinInput
	private physics?: PlayerPhysics

	public bind(pinInput: PinInput, physics: PlayerPhysics): void {
		this.pinInput = pinInput
		this.physics = physics
	}

	public getPhysics(): PlayerPhysics {
		return this.physics
	}

	public getBalls(): Ball[] {
		return this.physics.balls
	}

	public get balls(): Ball[] {
		return this.physics.balls
	}

	public getActiveBall(): Ball | undefined {
		return this.physics.activeBall
	}

	public getGameTime(): number {
		return this.physics.timeMsec
	}

	public getKey(key: AssignKey): number {
		return this.pinInput.getKey(key)
	}

	public createBall(creator: IBallCreationPosition, radius = DEFAULT_BALL_SIZE, mass = 1): Ball {
		return this.physics.createBall(creator, this as unknown as Player, radius, mass)
	}

	public destroyBall(ball: Ball): void {
		this.physics.destroyBall(ball)
		ball.getState().release()
	}
}

/** Self-contained physics simulation for the worker thread: real table, real PlayerPhysics, no scripts. */
export class WorkerSim {
	public readonly table: Table
	public readonly pinInput: PinInput
	public readonly physics: PlayerPhysics
	private readonly shim = new SimPlayerShim()
	private readonly ringEvents: InputEvent[] = []

	constructor(table: Table) {
		this.table = table
		this.pinInput = new PinInput(table, this.shim as unknown as Player)
		this.physics = new PlayerPhysics(table, this.pinInput)
		this.shim.bind(this.pinInput, this.physics)
		for (const playable of table.getPlayables()) playable.setupPlayer(this.shim as unknown as Player, table)
		table.setupCollections()
		this.physics.init()
		table.prepareToPlay()
		table.broadcastInit()
		table.broadcastOptionEvent(0)
	}

	public spawnBall(state: WorkerBallState): Ball {
		const creator: IBallCreationPosition = {
			getBallCreationPosition: () => new Vertex3D(state.pos[0], state.pos[1], state.pos[2] - state.radius),
			getBallCreationVelocity: () => new Vertex3D(state.vel[0], state.vel[1], state.vel[2]),
			onBallCreated: () => {},
		}
		const ball = this.physics.createBall(creator, this.shim as unknown as Player, state.radius)
		ball.state.isFrozen = state.frozen
		return ball
	}

	/** Full reconcile with the main thread's ball list: append-only order keeps indices aligned. */
	public syncBalls(states: WorkerBallState[]): void {
		const balls = this.physics.balls
		while (balls.length > states.length) this.destroyBallAt(balls.length - 1)
		for (let index = 0; index < states.length; index++) {
			if (index < balls.length) this.teleportBall(index, states[index])
			else this.spawnBall(states[index])
		}
	}

	public teleportBall(index: number, state: WorkerBallState): void {
		const ball = this.physics.balls[index]
		if (!ball) return
		ball.state.pos.set(state.pos[0], state.pos[1], state.pos[2])
		ball.hit.vel.set(state.vel[0], state.vel[1], state.vel[2])
		ball.state.isFrozen = state.frozen
		ball.coll.clear()
	}

	public destroyBallAt(index: number): void {
		const ball = this.physics.balls[index]
		if (!ball) return
		this.physics.destroyBall(ball)
		ball.getState().release()
	}

	/** Drains the SAB input ring into PinInput, skipping keys the main thread owns discretely. */
	public drainInputs(sab: SharedArrayBuffer): number {
		this.ringEvents.length = 0
		const drained = drainInput(sab, this.ringEvents)
		const startKey = this.pinInput.getKey(AssignKey.StartGameKey)
		for (const event of this.ringEvents) {
			if (isSimFilteredKey(event.key, startKey)) continue
			if (event.kind === INPUT_KEY_DOWN) this.pinInput.onKeyDown(event.key)
			else if (event.kind === INPUT_KEY_UP) this.pinInput.onKeyUp(event.key)
		}
		return drained
	}

	/** Packs live balls into the frame scratch buffer following the BALL_* layout. */
	public packBalls(scratch: Float32Array): number {
		const balls = this.physics.balls
		const count = Math.min(balls.length, MAX_BALLS)
		for (let index = 0; index < count; index++) {
			const ball = balls[index]
			const offset = index * BALL_STRIDE
			scratch[offset + BALL_POS] = ball.state.pos.x
			scratch[offset + BALL_POS + 1] = ball.state.pos.y
			scratch[offset + BALL_POS + 2] = ball.state.pos.z
			scratch[offset + BALL_VEL] = ball.hit.vel.x
			scratch[offset + BALL_VEL + 1] = ball.hit.vel.y
			scratch[offset + BALL_VEL + 2] = ball.hit.vel.z
			scratch[offset + BALL_RADIUS] = ball.data.radius
			scratch[offset + BALL_ID] = ball.id
			scratch[offset + BALL_FROZEN] = ball.state.isFrozen ? 1 : 0
			scratch.fill(0, offset + BALL_RESERVED, offset + BALL_STRIDE)
		}
		return count
	}
}

/** Start stays main-thread owned: its mock trough eject would otherwise double-create balls. */
export function isSimFilteredKey(dik: number, startKey: number): boolean {
	return dik === DIK_1 || dik === startKey
}

/** Loads a physics-only table copy: meshes stay (collision needs them), textures and script are skipped. */
export async function loadWorkerTable(source: Uint8Array | ArrayBuffer): Promise<Table> {
	const bytes = source instanceof Uint8Array ? source : new Uint8Array(source)
	const reader = new BinaryReader(bytes)
	await reader.open()
	// Lazy: the table chain pulls wpc-emu, which needs the host shims above in workers.
	const { Table } = await import('../vpt/table/table.js')
	return Table.load(reader, { skipTextures: true, loadTableScript: false })
}

async function ensureWasm(): Promise<void> {
	const mod = await import('../physics/wasm/kernels.js')
	await mod.getWasmKernels?.()
	mod.warmWasmPools?.(2048, 2048, 2048, 2048, 2048, 2048, 2048, 2048)
}

type HostMessage = {
	type?: string
	sab?: SharedArrayBuffer
	vpx?: Uint8Array | ArrayBuffer
	id?: number
	index?: number
	balls?: WorkerBallState[]
	pos?: [number, number, number]
	vel?: [number, number, number]
	radius?: number
	frozen?: boolean
}

/** Starts the worker message loop on `host`. Exported so the host protocol
 * (init/start/frames/ping/stop) stays drivable and testable in-process. */
export function startHost(host: WorkerHost): void {
	let sab: SharedArrayBuffer | null = null
	let sim: WorkerSim | null = null
	let running = false
	let wantStart = false
	let timer: ReturnType<typeof setTimeout> | null = null
	let prevMsec = 0
	let stepCount = 0
	let pendingSync: WorkerBallState[] | null = null
	const scratch = new Float32Array(MAX_BALLS * BALL_STRIDE)

	function tick(): void {
		if (!sab || !sim) return
		sim.drainInputs(sab)
		sim.physics.updatePhysics()
		const count = sim.packBalls(scratch)
		const timeMsec = sim.physics.timeMsec
		writeFrame(sab, scratch, count, prevMsec, timeMsec, timeMsec)
		prevMsec = timeMsec
		stepCount++
	}

	function loop(): void {
		if (!running || !sab || !sim) return
		try {
			tick()
		} catch (error) {
			// A fault in the off-thread step must be explicit: without this the
			// loop would stop rescheduling and the main thread would keep
			// mirroring stale frames with no signal. Report and halt instead;
			// the host already terminates on { type: 'error' }.
			running = false
			wantStart = false
			if (timer !== null) {
				clearTimeout(timer)
				timer = null
			}
			const failure = error as Error
			host.postMessage({
				type: 'error',
				message: failure?.message ?? String(error),
				stack: failure?.stack,
			})
			return
		}
		timer = setTimeout(loop, 1)
	}

	function startLoop(): void {
		if (running) return
		running = true
		loop()
		host.postMessage({ type: 'started', timeMsec: sim?.physics.timeMsec ?? 0 })
	}

	function stopLoop(): void {
		running = false
		wantStart = false
		if (timer !== null) {
			clearTimeout(timer)
			timer = null
		}
		host.postMessage({ type: 'stopped' })
	}

	function handleInit(message: HostMessage): void {
		if (!message.vpx) {
			host.postMessage({ type: 'error', message: 'init requires vpx bytes' })
			return
		}
		const bytes = message.vpx
		void ensureWasm().catch(() => {})
		loadWorkerTable(bytes).then(
			loaded => {
				sim = new WorkerSim(loaded)
				if (pendingSync) {
					sim.syncBalls(pendingSync)
					pendingSync = null
				}
				host.postMessage({ type: 'ready', balls: sim.physics.balls.length, timeMsec: sim.physics.timeMsec })
				if (wantStart) {
					wantStart = false
					startLoop()
				}
			},
			(error: unknown) => {
				const failure = error as Error
				host.postMessage({
					type: 'error',
					message: failure?.message ?? String(error),
					stack: failure?.stack,
				})
			},
		)
	}

	host.onmessage = (event: MessageEvent) => {
		const data = event.data as HostMessage
		if (data?.sab) sab = data.sab
		if (!data?.type) return
		switch (data.type) {
			case 'init':
				handleInit(data)
				break
			case 'start':
				if (sim) startLoop()
				else wantStart = true
				break
			case 'stop':
				stopLoop()
				break
			case 'pause':
				if (sim) sim.physics.isPaused = true
				host.postMessage({ type: 'paused', timeMsec: sim?.physics.timeMsec ?? 0 })
				break
			case 'resume':
				if (sim) sim.physics.isPaused = false
				host.postMessage({ type: 'resumed', timeMsec: sim?.physics.timeMsec ?? 0 })
				break
			case 'syncBalls':
				if (!Array.isArray(data.balls)) return
				if (sim) sim.syncBalls(data.balls)
				else pendingSync = data.balls
				break
			case 'teleportBall':
				if (!sim || data.index === undefined || !data.pos || !data.vel) return
				sim.teleportBall(data.index, {
					pos: data.pos,
					vel: data.vel,
					radius: data.radius ?? 25,
					frozen: data.frozen ?? false,
				})
				break
			case 'ping':
				host.postMessage({
					type: 'pong',
					id: data.id ?? 0,
					timeMsec: sim?.physics.timeMsec ?? 0,
					balls: sim?.physics.balls.length ?? 0,
					steps: stepCount,
				})
				break
		}
	}

	host.postMessage({ type: 'worker-ready' })
}

const host = resolveWorkerHost()
if (host) startHost(host)
