// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { NudgeHandler } from '../physics/cabinet/nudge-handler.js'
import { type AnimationGate, animationGate } from '../util/animation-gate.js'
import { EventEmitter } from '../util/event-emitter.js'
import type { Vertex2D, Vertex3D } from '../util/vector.js'
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
	private readonly pinInput: PinInput
	private readonly physics: PlayerPhysics
	private isInitialized = false
	private previousStates: Record<string, ItemState> = {}
	private currentStates: Record<string, ItemState> = {}
	private simulatedTimeMs = 0
	private dirtySet = new Set<string>()
	private allStateNames: string[] = []
	private cachedAnimatables: Array<{ getName(): string }> | null = null
	private cachedMovables: Array<{ getName(): string }> | null = null
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
		const t = this.table as unknown as {
			runTableScriptAsync?: (p: Player, s: Record<string, unknown>) => Promise<void>
		}
		return async && t.runTableScriptAsync
			? t.runTableScriptAsync(this, scope)
			: this.table.runTableScript(this, scope)
	}

	private finishInit(): void {
		this.table.broadcastInit()
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
		await new Promise(r => setTimeout(r, 0))
		await this.runScript(scope, true)
		this.finishInit()
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
			this.dirtySet.add(s.getName())
		}
		this.allStateNames = Object.keys(this.currentStates)
	}

	public markDirty(name: string): void {
		if (name) this.dirtySet.add(name)
	}

	private wrapSingleApi(api: any, name: string): any {
		if (!api || !name || api.__isDirtyProxy) return api
		const player = this
		const methodCache = new Map<string | symbol, (...args: any[]) => unknown>()
		const proxy = new Proxy(api, {
			set(target: any, prop: string | symbol, value: any, receiver: any): boolean {
				if (typeof prop === 'symbol') return Reflect.set(target, prop, value, receiver)
				const ok = Reflect.set(target, prop, value, receiver)
				player.markDirty(name)
				return ok
			},
			get(target: any, prop: string | symbol, receiver: any): any {
				if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver)
				if (
					prop === 'constructor' ||
					prop === '__proto__' ||
					prop === 'prototype' ||
					prop === '__isDirtyProxy'
				) {
					return Reflect.get(target, prop, receiver)
				}
				if (typeof prop === 'string' && prop.startsWith('_')) {
					return Reflect.get(target, prop, receiver)
				}
				const val = Reflect.get(target, prop, receiver)
				if (typeof val === 'function') {
					let cached = methodCache.get(prop)
					if (cached) return cached
					cached = (...args: any[]): unknown => {
						const res = val.apply(target, args)
						const key = String(prop)
						if (
							!key.startsWith('get') &&
							!key.startsWith('is') &&
							!key.startsWith('has') &&
							key !== '_getPropertyNames' &&
							key !== '_getTimers'
						) {
							player.markDirty(name)
						}
						return res
					}
					methodCache.set(prop, cached)
					return cached
				}
				return val
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
	}

	private getAnimatables(): Array<{ getName(): string }> {
		if (this.cachedAnimatables) return this.cachedAnimatables
		this.cachedAnimatables = (this.table as any).getAnimatables?.() ?? []
		return this.cachedAnimatables!
	}

	private getMovables(): Array<{ getName(): string }> {
		if (this.cachedMovables) return this.cachedMovables
		this.cachedMovables = (this.table as any).getMovables?.() ?? []
		return this.cachedMovables!
	}

	public simulateTime(dTime: number): void {
		if (!this.isInitialized) throw new Error('Player must be initialized before simulating time!')
		for (const dt = 1000 / 60; this.simulatedTimeMs <= dTime; this.simulatedTimeMs += dt) {
			this.updatePhysics(this.simulatedTimeMs)
			this.updateAnimations(this.simulatedTimeMs)
		}
	}

	public updatePhysics(dTime?: number): number {
		const it = this.physics.updatePhysics(dTime)
		for (const b of this.physics.balls) this.markDirty(b.getName())
		for (const m of this.getMovables()) {
			this.markDirty(m.getName())
		}
		return it
	}
	public onFrame(): ChangedStates<ItemState> {
		this.updateAnimations(this.physics.timeMsec)
		return this.popStates()
	}
	public updateAnimations(timeMs: number): void {
		for (const animatable of this.getAnimatables() as unknown as Array<{
			getAnimation(): { updateAnimation(n: number, t: Table): boolean | void }
			getName(): string
		}>) {
			if (animatable.getAnimation().updateAnimation(timeMs, this.table)) {
				this.markDirty(animatable.getName())
			}
		}
	}
	public popStates(): ChangedStates<ItemState> {
		const changed = ChangedStates.claim()
		this.frameCount++
		const useFull = this.frameCount % 300 === 0 && this.dirtySet.size < this.allStateNames.length * 0.5
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

	public onKeyUp(e: {
		code: string
		key: string
		ts: number
		location?: number
		keyCode?: number
		which?: number
	}): void {
		this.pinInput.onKeyUp(keyEventToDirectInputKey(e as any), e.ts)
	}
	public onKeyDown(e: {
		code: string
		key: string
		ts: number
		location?: number
		keyCode?: number
		which?: number
	}): void {
		this.pinInput.onKeyDown(keyEventToDirectInputKey(e as any), e.ts)
	}

	public createBall(creator: IBallCreationPosition, radius = 25, mass = 1): Ball {
		const ball = this.physics.createBall(creator, this, radius, mass)
		const api: any = (ball as any).getApi?.()
		const wrapped = this.wrapSingleApi(api, ball.getName())
		if (wrapped !== api) (ball as any).api = wrapped
		this.currentStates[ball.getName()] = ball.getState()
		this.previousStates[ball.getName()] = ball.getState().clone()
		this.allStateNames.push(ball.getName())
		this.markDirty(ball.getName())
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
		this.dirtySet.delete(ball.getName())
		this.allStateNames = this.allStateNames.filter(n => n !== ball.getName())
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
	public getNudgeHandler(): NudgeHandler {
		return this.pinInput.getNudgeHandler()
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
		for (const _ in this.changedStates) return false
		return true
	}

	public static claim(): ChangedStates {
		return new ChangedStates()
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
