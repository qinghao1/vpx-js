// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Vertex2D, Vertex3D } from '../math/vector.js'
import type { NudgeHandler } from '../physics/cabinet/nudge-handler.js'
import { DEFAULT_BALL_SIZE } from '../physics/constants.js'
import { type AnimationGate, animationGate } from '../util/animation-gate.js'
import { EventEmitter } from '../util/event-emitter.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { ItemState } from '../vpt/item-state.js'
import type { Table } from '../vpt/table/table.js'
import { Event } from './event.js'
import type { IEmulator } from './iemulator.js'
import { type AssignKey, keyEventToDirectInputKey } from './key-code.js'
import { PinInput } from './pin-input.js'
import { PlayerPhysics } from './player-physics.js'

/** DOM-style key event accepted by {@link Player.onKeyDown} / {@link Player.onKeyUp}. */
export interface DomKeyEvent {
	code: string
	key: string
	location?: number
	keyCode?: number
	which?: number
}

/** Full state-sweep cadence: every Nth popStates re-checks all states to catch unmarked mutations. */
export const FULL_SWEEP_EVERY = 300

/**
 * Full-sweep skip threshold: when the dirty set already covers this fraction
 * of all states, the incremental diff visits nearly everything anyway, so the
 * periodic full sweep is redundant that frame.
 */
const FULL_SWEEP_MIN_COVERAGE = 0.5

/** Host-facing game controller: input, physics, animations and state diffing. */
export class Player extends EventEmitter {
	private readonly pinInput: PinInput
	private readonly physics: PlayerPhysics
	private isInitialized = false
	private previousStates: Record<string, ItemState> = {}
	private currentStates: Record<string, ItemState> = {}
	private simulatedTimeMs = 0
	private dirtySet = new Set<string>()
	private allStateNames: string[] = []
	private frameCount = 0

	public width = 0
	public height = 0

	get balls(): Ball[] {
		return this.physics.balls
	}
	/** Active ball if any. */
	get activeBall(): Ball | undefined {
		return this.physics.activeBall
	}

	constructor(
		private readonly table: Table,
		public readonly gate: AnimationGate = animationGate,
	) {
		super()
		this.pinInput = new PinInput(table, this)
		this.physics = new PlayerPhysics(table, this.pinInput)
		this.setupTableElements()
		this.setupStates()
		this.wrapApis()
	}

	private prepareTable(): void {
		this.table.setupCollections()
		this.physics.init()
		this.table.prepareToPlay()
	}

	private runScript(scope: Record<string, unknown>, async: boolean): Promise<void> | void {
		const asyncTable = this.table as unknown as {
			runTableScriptAsync?: (player: Player, scriptScope: Record<string, unknown>) => Promise<void>
		}
		return async && asyncTable.runTableScriptAsync
			? asyncTable.runTableScriptAsync(this, scope)
			: this.table.runTableScript(this, scope)
	}

	private finishInit(): void {
		this.table.broadcastInit()
		this.table.broadcastOptionEvent(0)
		this.isInitialized = true
	}
	public init(scope: Record<string, unknown> = {}): this {
		this.prepareTable()
		this.runScript(scope, false)
		this.finishInit()
		return this
	}
	public async initAsync(scope: Record<string, unknown> = {}): Promise<this> {
		this.prepareTable()
		await new Promise(resolve => setTimeout(resolve, 0))
		await this.runScript(scope, true)
		this.finishInit()
		return this
	}

	private setupTableElements(): void {
		for (const playable of this.table.getPlayables()) playable.setupPlayer(this, this.table)
	}

	private setupStates(): void {
		for (const renderable of this.table.getRenderables()) {
			const state = renderable.getState() as ItemState
			this.currentStates[state.getName()] = state
			this.previousStates[state.getName()] = state.clone()
			this.dirtySet.add(state.getName())
		}
		this.allStateNames = Object.keys(this.currentStates)
	}

	public markDirty(name: string): void {
		if (name) this.dirtySet.add(name)
	}

	private wrapSingleApi(api: any, name: string): any {
		if (!api || !name || api.__isDirtyProxy) return api
		const player = this
		// Mark-dirty on set-only: a property read or a non-mutating method call
		// must not dirty the state — script mutations go through property sets
		// (mover/physics mutations are re-dirtied every updatePhysics anyway).
		const proxy = new Proxy(api, {
			set(target: any, prop: string | symbol, value: any, receiver: any): boolean {
				if (typeof prop === 'symbol') return Reflect.set(target, prop, value, receiver)
				const ok = Reflect.set(target, prop, value, receiver)
				player.markDirty(name)
				return ok
			},
		})
		;(proxy as any).__isDirtyProxy = true
		return proxy
	}

	private wrapApis(): void {
		for (const item of this.table.getScriptables() as unknown as Array<{
			getName(): string
			getApi(): unknown
		}>) {
			const api: any = (item as any).getApi?.()
			const name = item.getName()
			const wrapped = this.wrapSingleApi(api, name)
			if (wrapped !== api) (item as any).api = wrapped
		}
		// No collection fix-up here: at construction time collection.items is still
		// empty (Table.setupCollections runs later in init and pushes the
		// already-wrapped item apis), so a wrap pass over it would be dead code.
	}

	/** Headless driver: steps physics + animations at 60 Hz up to absolute `endMs` (ms, not a delta). */
	public simulateTime(endMs: number): void {
		if (!this.isInitialized) throw new Error('Player must be initialized before simulating time!')
		// 1 ns tolerance: float accumulation overshoots exact grid multiples
		// (t=100.00000000000001 > 100), which would otherwise skip the terminal
		// step and leave game time behind endMs. Far below the 16.7 ms grid, so
		// no spurious step is possible.
		for (const dt = 1000 / 60; this.simulatedTimeMs <= endMs + 1e-6; this.simulatedTimeMs += dt) {
			this.updatePhysics(this.simulatedTimeMs)
			this.updateAnimations(this.simulatedTimeMs)
		}
	}

	/** Advances physics to absolute `timeMs` (ms, not a delta); omitted = real clock. Returns iterations run. */
	public updatePhysics(timeMs?: number): number {
		const iterations = this.physics.updatePhysics(timeMs)
		if (iterations > 0) {
			for (const ball of this.physics.balls) this.markDirty(ball.getName())
			for (const movable of this.table.getMovables()) {
				this.markDirty(movable.getName())
			}
		}
		return iterations
	}
	public onFrame(): ChangedStates<ItemState> {
		this.updateAnimations(this.physics.timeMsec)
		return this.popStates()
	}
	public updateAnimations(timeMs: number): void {
		for (const animatable of this.table.getAnimatables()) {
			if (animatable.getAnimation().updateAnimation(timeMs, this.table)) {
				this.markDirty(animatable.getName())
			}
		}
	}
	public popStates(): ChangedStates<ItemState> {
		const changed = new ChangedStates<ItemState>()
		this.frameCount++
		const useFull =
			this.frameCount % FULL_SWEEP_EVERY === 0 &&
			this.dirtySet.size < this.allStateNames.length * FULL_SWEEP_MIN_COVERAGE
		if (useFull) {
			for (const name of this.allStateNames) this.dirtySet.add(name)
		}
		for (const name of this.dirtySet) {
			const next = this.currentStates[name]
			const prev = this.previousStates[name]
			if (!next || !prev) continue
			if (!next.equals(prev)) {
				changed.setState(name, next.diff(prev))
				prev.copyFrom(next)
			}
		}
		this.dirtySet.clear()
		return changed
	}

	public onKeyUp(e: DomKeyEvent): void {
		this.pinInput.onKeyUp(keyEventToDirectInputKey(e))
	}
	public onKeyDown(e: DomKeyEvent): void {
		this.pinInput.onKeyDown(keyEventToDirectInputKey(e))
	}

	public createBall(creator: IBallCreationPosition, radius = DEFAULT_BALL_SIZE, mass = 1): Ball {
		const ball = this.physics.createBall(creator, this, radius, mass)
		const name = ball.getName()
		const api: any = (ball as any).getApi?.()
		const wrapped = this.wrapSingleApi(api, name)
		if (wrapped !== api) (ball as any).api = wrapped
		this.currentStates[name] = ball.getState()
		this.previousStates[name] = ball.getState().clone()
		this.allStateNames.push(name)
		this.markDirty(name)
		this.emit('ballCreated', ball)
		return ball
	}

	public destroyBall(ball: Ball): void {
		if (!ball) return
		const name = ball.getName()
		this.physics.destroyBall(ball)
		// Guard: destroying an unknown (or already-destroyed) ball must not throw
		// on the state release below — physics cleanup above is idempotent.
		if (!(name in this.currentStates) || !(name in this.previousStates)) return
		this.currentStates[name].release()
		this.previousStates[name].release()
		delete this.currentStates[name]
		delete this.previousStates[name]
		this.dirtySet.delete(name)
		this.allStateNames = this.allStateNames.filter(stateName => stateName !== name)
		this.emit('ballDestroyed', ball)
	}

	public getActiveBall(): Ball | undefined {
		return this.physics.activeBall
	}
	public getGameTime(): number {
		return this.physics.timeMsec
	}
	public getBalls(): Ball[] {
		return this.physics.balls
	}
	public getKey(key: AssignKey): number {
		return this.pinInput.rgKeys[key] ?? 0
	}
	public setKey(key: AssignKey, dik: number): void {
		this.pinInput.setKey(key, dik)
	}
	public getNudgeHandler(): NudgeHandler {
		return this.pinInput.getNudgeHandler()
	}
	/** Seed the keyboard-nudge RNG (tests); production default is Math.random. */
	public setNudgeRandomSource(random: () => number): void {
		this.pinInput.setRandomSource(random)
	}
	public nudge(angle: number, force: number): void {
		this.pinInput.nudge(angle, force)
	}
	public getPhysics(): PlayerPhysics {
		return this.physics
	}
	public setGravity(slopeDeg: number, strength: number): void {
		this.physics.setGravity(slopeDeg, strength)
	}
	public setEmulator(emu: IEmulator): void {
		this.physics.emu = emu
		this.emit('emuStarted')
		this.pinInput.ensureFreePlay()
	}
	public hasDmd(): boolean {
		return !!this.physics.emu?.getDmdDimensions()
	}
	public getDmdDimensions(): Vertex2D {
		return this.physics.emu?.getDmdDimensions()
	}
	public getDmdFrame(): Uint8Array {
		return this.physics.emu?.getDmdFrame()
	}
	public setCabinetInput(keyNr: number): void {
		this.physics.emu?.setCabinetInput(keyNr)
	}
	public setSwitchInput(nr: number, enable?: boolean): void {
		this.physics.emu?.setSwitchInput(nr, enable)
	}
	public setDimensions(w: number, h: number): void {
		this.width = w
		this.height = h
	}
	public pause(): void {
		this.physics.isPaused = true
		this.table.fireVoidEvent(Event.GameEventsPaused)
		this.emit('paused')
	}
	public resume(): void {
		this.physics.isPaused = false
		this.table.fireVoidEvent(Event.GameEventsUnPaused)
		this.emit('resumed')
	}
	public setPhysicsEnabled(enabled: boolean): void {
		this.physics.disablePhysics = !enabled
	}
	public isPhysicsEnabled(): boolean {
		return !this.physics.disablePhysics
	}
}

export interface IBallCreationPosition {
	getBallCreationPosition(table: Table): Vertex3D
	getBallCreationVelocity(table: Table): Vertex3D
	onBallCreated(physics: PlayerPhysics, ball: Ball): void
}

/** Map of changed item states. */
export class ChangedStates<STATE extends ItemState = ItemState> {
	public changedStates: Record<string, STATE> = {}

	get keys(): string[] {
		return Object.keys(this.changedStates)
	}
	get states(): STATE[] {
		return Object.values(this.changedStates)
	}
	get isEmpty(): boolean {
		return Object.keys(this.changedStates).length === 0
	}

	public setState(name: string, state: STATE): void {
		this.changedStates[name] = state
	}
	public getState<S extends STATE>(name: string): S {
		return this.changedStates[name] as S
	}
	public release(): void {
		for (const k in this.changedStates) {
			this.changedStates[k]?.release()
			delete this.changedStates[k]
		}
	}
}
