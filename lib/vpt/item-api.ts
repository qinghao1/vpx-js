// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Event } from '../game/event.js'
import type { EventProxy } from '../game/event-proxy.js'
import type { Player } from '../game/player.js'
import { EventEmitter } from '../util/event-emitter.js'
import type { Collection } from './collection/collection.js'
import type { ItemData } from './item-data.js'
import type { Table } from './table/table.js'
import { MAX_TIMER_MSEC_INTERVAL, TimerMode } from './timer/timer-const.js'
import { TimerHit } from './timer/timer-hit.js'

const INTERNAL = new Set([
	'data',
	'events',
	'player',
	'table',
	'collections',
	'collectionsItemPos',
	'propertyMap',
	'hitTimer',
	'animation',
	'constructor',
	'prototype',
	'__proto__',
	'_events',
	'_eventsCount',
	'_maxListeners',
	'_e',
])

/** Script-visible property: a string that is neither private nor internal. */
function isExposed(prop: string | symbol): prop is string {
	return typeof prop === 'string' && !prop.startsWith('_') && !INTERNAL.has(prop)
}

const lowerCache = new Map<string, string>()
function lc(s: string): string {
	let r = lowerCache.get(s)
	if (r !== undefined) return r
	r = s.toLowerCase()
	if (lowerCache.size < 4096) lowerCache.set(s, r)
	return r
}

/** Base for VBS-exposed item APIs. */
export abstract class ItemApi<DATA extends ItemData> extends EventEmitter {
	protected readonly collections: Collection[] = []
	protected readonly collectionsItemPos: number[] = []
	private propertyMap?: Record<string, string>
	private hitTimer?: TimerHit
	// Explicit initializer: with useDefineForClassFields=false a bare declaration emits no
	// own property, which would hide UserValue from case-insensitive lookup below.
	public UserValue: unknown = undefined

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(Object.getPrototypeOf(this))
	}

	public InterfaceSupportsErrorInfo(_riid: unknown): boolean {
		return false
	}

	get Name() {
		return this.data.getName()
	}
	set Name(v) {
		this.data.name = v
	}
	get TimerInterval() {
		return this.data.timer.interval
	}
	set TimerInterval(v) {
		this._setTimerInterval(v)
	}
	get TimerEnabled() {
		return this.data.timer.enabled
	}
	set TimerEnabled(v) {
		this._setTimerEnabled(v)
	}

	constructor(
		protected readonly data: DATA,
		protected readonly events: EventProxy,
		protected readonly player: Player,
		protected readonly table: Table,
	) {
		super()
		return new Proxy(this, {
			get(target: unknown, prop: string | symbol, receiver: unknown) {
				if (isExposed(prop)) {
					const mapped = (target as ItemApi<DATA>)._getPropertyName(prop)
					if (mapped) {
						const v = Reflect.get(target as object, mapped, receiver)
						if (v !== undefined || mapped in (target as object))
							return typeof v === 'function' ? (v as Function).bind(target) : v
					}
				}
				const v = Reflect.get(target as object, prop, receiver)
				return typeof v === 'function' && typeof prop === 'string' && !INTERNAL.has(prop) ? v.bind(target) : v
			},
			set(target: unknown, prop: string | symbol, value: unknown, receiver: unknown) {
				if (isExposed(prop)) {
					const mapped = (target as ItemApi<DATA>)._getPropertyName(prop)
					if (mapped) return Reflect.set(target as object, mapped, value)
				}
				return Reflect.set(target as object, prop as string, value)
			},
			has(target: unknown, prop: string | symbol) {
				if (isExposed(prop)) {
					const mapped = (target as ItemApi<DATA>)._getPropertyName(prop)
					if (mapped) return mapped in (target as object)
				}
				return Reflect.has(target as object, prop)
			},
		}) as unknown as ItemApi<DATA>
	}

	public fireKeyEvent(event: Event, ...args: unknown[]): void {
		this.events.fireVoidEventParm(event, ...args)
	}

	public _getTimers(): TimerHit[] {
		this._beginPlay()
		const interval =
			this.data.timer.interval >= 0
				? Math.max(this.data.timer.interval, MAX_TIMER_MSEC_INTERVAL)
				: Math.max(TimerMode.OnGameSync, this.data.timer.interval)
		this.hitTimer = new TimerHit(this.events, interval, interval)
		return this.data.timer.enabled ? [this.hitTimer] : []
	}

	public _resetCollections(): void {
		this.collections.length = 0
		this.collectionsItemPos.length = 0
	}

	public _addCollection(collection: Collection, pos: number): void {
		this.collections.push(collection)
		this.collectionsItemPos.push(pos)
	}

	public _getPropertyName(vbScriptName: string): string | undefined {
		if (!this.propertyMap) {
			this.propertyMap = {}
			for (const name of this._getPropertyNames()) this.propertyMap[lc(name)] = name
			for (const name of Object.getOwnPropertyNames(ItemApi.prototype)) {
				const key = lc(name)
				if (!(key in this.propertyMap)) this.propertyMap[key] = name
			}
			this._addOwnPropertyNames(this.propertyMap)
		}
		const key = lc(vbScriptName)
		let mapped = this.propertyMap[key]
		if (mapped === undefined) {
			// Subclass constructors assign instance fields through this proxy, so the map
			// may predate some of them; merge any new names before giving up.
			this._addOwnPropertyNames(this.propertyMap)
			mapped = this.propertyMap[key]
		}
		return mapped
	}

	private _addOwnPropertyNames(map: Record<string, string>): void {
		for (const name of Object.getOwnPropertyNames(this)) {
			if (!isExposed(name)) continue
			const key = lc(name)
			if (!(key in map)) map[key] = name
		}
	}

	protected _beginPlay(): void {
		this.events.eventCollection.length = 0
		this.events.eventCollectionItemPos.length = 0
		this.events.singleEvents = true
		for (let i = 0; i < this.collections.length; i++) {
			const col = this.collections[i]!
			if (col.fireEvents) {
				this.events.eventCollection.push(col.getEvents())
				this.events.eventCollectionItemPos.push(this.collectionsItemPos[i]!)
			}
			if (col.stopSingleEvents) this.events.singleEvents = false
		}
	}

	protected _assertNonHdrImage(imageName?: string): void {
		if (!imageName) return
		// Unknown names are stored as-is, like native put_Image; only HDR textures are rejected.
		if (this.table.getTexture(imageName)?.isHdr()) throw new Error('Cannot use a HDR image (.exr/.hdr) here')
	}

	protected _ballCountOver(events: EventProxy): number {
		let cnt = 0
		for (const ball of this.player.balls) {
			if (ball.hit.isRealBall() && ball.hit.vpVolObjs.includes(events)) {
				cnt++
				this.player.getPhysics().activeBall = ball
			}
		}
		return cnt
	}

	protected _setTimerEnabled(isEnabled: boolean): void {
		if (isEnabled !== this.data.timer.enabled && this.hitTimer) {
			this.player.getPhysics().timerStateChange(this.hitTimer, isEnabled)
		}
		this.data.timer.enabled = isEnabled
	}

	protected _setTimerInterval(interval: number): void {
		this.data.timer.interval = interval
		if (this.hitTimer) {
			const clamped =
				interval >= 0 ? Math.max(interval, MAX_TIMER_MSEC_INTERVAL) : Math.max(TimerMode.OnGameSync, interval)
			this.player.getPhysics().reprogramTimer(this.hitTimer, clamped)
		}
	}
}

/** Dequantizes 0..100 → 0..1. */
export function dequantizeUnsignedPercent(i: number): number {
	return Math.min(i / 100, 1)
}

export function quantizeUnsignedPercent(x: number): number {
	return Math.min(Math.max(0, x) * 100, 100)
}

/** Dequantizes -100..100 → -1..1 (upstream dequantizeSignedPercent). */
export function dequantizeSignedPercent(i: number): number {
	return Math.max(-1, Math.min(1, i / 100))
}
