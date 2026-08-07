// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { HitObject } from '../physics/hit-object.js'
import type { EventProxy } from './event-proxy.js'
import type { IPlayable } from './iplayable.js'

/** Collidable table element. */
export interface IHittable extends IPlayable {
	isCollidable(): boolean
	getHitShapes(): HitObject[]
	getEventProxy(): EventProxy
}

export function isHittable(arg: unknown): arg is IHittable {
	return typeof arg === 'object' && arg !== null && 'getHitShapes' in arg
}
