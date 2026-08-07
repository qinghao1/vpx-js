// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Table } from '../vpt/table/table.js'
import type { IPlayable } from './iplayable.js'
import { PlayerPhysics } from './player-physics.js'

/**
 * Animatables are like movables but their position is only updated
 * once per frame, whereas movables get updated every tick (usually
 * at 1000fps).
 *
 * Classes that implement this interface usually take their code from
 * Visual Pinball's `RenderDynamic()` method.
 */
export interface IAnimatable extends IPlayable {
	getAnimation(): IAnimation
}

export interface IAnimation {
	init(timeMsec: number): void

	updateAnimation(timeMsec: number, table: Table): void
}

export function isAnimatable(arg: any): arg is IAnimatable {
	return arg.getAnimation !== undefined
}
