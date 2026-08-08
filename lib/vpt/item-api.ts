// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventEmitter } from 'events'
import type { Event } from '../game/event.js'
import type { EventProxy } from '../game/event-proxy.js'
import type { Player } from '../game/player.js'
import type { Collection } from './collection/collection.js'
import type { ItemData } from './item-data.js'
import type { Table } from './table/table.js'
import { MAX_TIMER_MSEC_INTERVAL } from './timer/timer-const.js'
import { TimerHit } from './timer/timer-hit.js'
import { TimerOnOff } from './timer/timer-on-off.js'

const INTERNAL: Record<string, boolean> = {
	data: true,
	events: true,
	player: true,
	table: true,
	collections: true,
	collectionsItemPos: true,
	propertyMap: true,
	hitTimer: true,
	UserValue: true,
	state: true,
	animation: true,
	constructor: true,
	prototype: true,
	__proto__: true,
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
	public UserValue: unknown

	protected abstract _getPropertyNames(): string[]

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
				if (typeof prop === 'string' && !INTERNAL[prop]) {
					const mapped = (target as ItemApi<DATA>)._getPropertyName(prop)
					if (mapped) {
						const v = Reflect.get(target as object, mapped, receiver)
						if (v !== undefined || mapped in (target as object))
							return typeof v === 'function' ? (v as Function).bind(target) : v
					}
				}
				const v = Reflect.get(target as object, prop, receiver)
				return typeof v === 'function' && typeof prop === 'string' && !INTERNAL[prop] ? v.bind(target) : v
			},
			set(target: unknown, prop: string | symbol, value: unknown, receiver: unknown) {
				if (typeof prop === 'string' && !INTERNAL[prop]) {
					const mapped = (target as ItemApi<DATA>)._getPropertyName(prop)
					if (mapped) return Reflect.set(target as object, mapped, value, receiver)
				}
				return Reflect.set(target as object, prop as string, value, receiver)
			},
			has(target: unknown, prop: string | symbol) {
				if (typeof prop === 'string' && !INTERNAL[prop]) {
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
		const interval = this.data.timer.interval >= 0 ? Math.max(this.data.timer.interval, MAX_TIMER_MSEC_INTERVAL) : -1
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
		}
		return this.propertyMap[lc(vbScriptName)]
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
		const tex = this.table.getTexture(imageName)
		if (!tex) throw new Error(`Texture "${imageName}" not found.`)
		if (tex.isHdr()) throw new Error('Cannot use a HDR image (.exr/.hdr) here')
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
			let found = false
			for (const c of this.player.getPhysics().changedHitTimers) {
				if (c.timer === this.hitTimer) {
					c.enabled = isEnabled
					found = true
					break
				}
			}
			if (!found) this.player.getPhysics().changedHitTimers.push(new TimerOnOff(isEnabled, this.hitTimer))
			this.hitTimer.nextFire = isEnabled ? this.player.getPhysics().timeMsec + this.hitTimer.interval : 0xffffffff
		}
		this.data.timer.enabled = isEnabled
	}

	protected _setTimerInterval(interval: number): void {
		this.data.timer.interval = interval
		if (this.hitTimer) {
			this.hitTimer.interval = interval >= 0 ? Math.max(interval, MAX_TIMER_MSEC_INTERVAL) : -1
			this.hitTimer.nextFire = this.player.getPhysics().timeMsec + this.hitTimer.interval
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
