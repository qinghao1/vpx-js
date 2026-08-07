// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventEmitter } from 'events'
import type { Vertex2D } from '../math/vertex2d.js'
import type { Vertex3D } from '../math/vertex3d.js'
import { Pool } from '../util/object-pool.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { ItemState } from '../vpt/item-state.js'
import type { Table } from '../vpt/table/table.js'
import { Event } from './event.js'
import type { IEmulator } from './iemulator.js'
import { type AssignKey, keyEventToDirectInputKey } from './key-code.js'
import { PinInput } from './pin-input.js'
import { PlayerPhysics } from './player-physics.js'

/** Host-facing game controller: input, physics, animations and state diffing. */
export class Player extends EventEmitter {
	private readonly table: Table
	private readonly pinInput: PinInput
	private readonly physics: PlayerPhysics
	private isInitialized = false

	get balls(): Ball[] {
		return this.physics.balls
	}

	private previousStates: Record<string, ItemState> = {}
	private currentStates: Record<string, ItemState> = {}
	private simulatedTimeMs = 0

	public width = 0
	public height = 0

	constructor(table: Table) {
		super()
		this.table = table
		this.pinInput = new PinInput(table, this)
		this.physics = new PlayerPhysics(table, this.pinInput)
		this.setupTableElements()
		this.setupStates()
	}

	/** Initializes physics and runs table script. */
	public init(scope: Record<string, unknown> = {}): this {
		this.table.setupCollections()
		this.physics.init()
		this.table.prepareToPlay()
		this.table.runTableScript(this, scope)
		this.table.broadcastInit()
		this.isInitialized = true
		return this
	}

	private setupTableElements(): void {
		for (const p of this.table.getPlayables()) p.setupPlayer(this, this.table)
	}

	private setupStates(): void {
		for (const r of this.table.getRenderables()) {
			const s = r.getState() as ItemState
			this.currentStates[s.getName()] = s
			this.previousStates[s.getName()] = s.clone()
		}
	}

	/** Test helper: simulates time at 60Hz. */
	public simulateTime(dTime: number): void {
		if (!this.isInitialized) throw new Error('Player must be initialized before simulating time!')
		const dt = 1000 / 60
		while (this.simulatedTimeMs <= dTime) {
			this.updatePhysics(this.simulatedTimeMs)
			this.updateAnimations(this.simulatedTimeMs)
			this.simulatedTimeMs += dt
		}
	}

	/** Runs physics step; host should call in its physics loop. */
	public updatePhysics(dTime?: number): number {
		return this.physics.updatePhysics(dTime)
	}

	/** Runs animations and returns changed states since last frame. */
	public onFrame(): ChangedStates<ItemState> {
		this.updateAnimations(this.physics.timeMsec)
		return this.popStates()
	}

	/** Runs one animation cycle. */
	public updateAnimations(timeMs: number): void {
		for (const a of this.table.getAnimatables()) a.getAnimation().updateAnimation(timeMs, this.table)
	}

	/** Returns diffed states and resets tracking. Caller must release. */
	public popStates(): ChangedStates<ItemState> {
		const changed = ChangedStates.claim()
		for (const name of Object.keys(this.currentStates)) {
			const next = this.currentStates[name],
				prev = this.previousStates[name]
			if (!next.equals(prev)) {
				changed.setState(name, next.diff(prev))
				this.previousStates[name].release()
				this.previousStates[name] = next.clone()
			}
		}
		return changed
	}

	public onKeyUp(e: { code: string; key: string; ts: number }): void {
		this.pinInput.onKeyUp(keyEventToDirectInputKey(e), e.ts)
	}
	public onKeyDown(e: { code: string; key: string; ts: number }): void {
		this.pinInput.onKeyDown(keyEventToDirectInputKey(e), e.ts)
	}

	public createBall(creator: IBallCreationPosition, radius = 25, mass = 1): Ball {
		const ball = this.physics.createBall(creator, this, radius, mass)
		this.currentStates[ball.getName()] = ball.getState()
		this.previousStates[ball.getName()] = ball.getState().clone()
		this.emit('ballCreated', ball)
		return ball
	}

	public destroyBall(ball: Ball): void {
		if (!ball) return
		this.physics.destroyBall(ball)
		this.currentStates[ball.getName()].release()
		this.previousStates[ball.getName()].release()
		delete this.currentStates[ball.getName()]
		delete this.previousStates[ball.getName()]
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
		return this.pinInput.rgKeys[key]
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
	}
	public hasDmd(): boolean {
		return !!this.physics.emu?.getDmdDimensions()
	}
	public getDmdDimensions(): Vertex2D {
		return this.physics.emu!.getDmdDimensions()
	}
	public getDmdFrame(): Uint8Array {
		return this.physics.emu!.getDmdFrame()
	}
	public setCabinetInput(keyNr: number): void {
		this.physics.emu?.setCabinetInput(keyNr)
	}
	public setSwitchInput(nr: number, enable?: boolean): void {
		this.physics.emu?.setSwitchInput(nr, enable)
	}

	/** Sets render frame size (exposed to script). */
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
}

export interface IBallCreationPosition {
	getBallCreationPosition(table: Table): Vertex3D
	getBallCreationVelocity(table: Table): Vertex3D
	onBallCreated(physics: PlayerPhysics, ball: Ball): void
}

/** Pooled map of changed item states. */
export class ChangedStates<STATE extends ItemState = ItemState> {
	public static readonly POOL = new Pool(ChangedStates)
	public changedStates: Record<string, STATE> = {}

	get keys(): string[] {
		return Object.keys(this.changedStates)
	}
	get states(): STATE[] {
		return Object.values(this.changedStates)
	}

	public static claim(): ChangedStates {
		return ChangedStates.POOL.get()
	}
	public setState(name: string, state: STATE): void {
		this.changedStates[name] = state
	}
	public getState<S extends STATE>(name: string): S {
		return this.changedStates[name] as S
	}

	public release(): void {
		for (const k of this.keys) {
			this.changedStates[k].release()
			delete this.changedStates[k]
		}
		ChangedStates.POOL.release(this)
	}
}
