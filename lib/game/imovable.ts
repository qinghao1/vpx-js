// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { MoverObject } from '../physics/mover-object.js'
import type { IPlayable } from './iplayable.js'

/** Physics mover (1000Hz update). */
export interface IMovable extends IPlayable {
	getMover(): MoverObject
}

export function isMovable(arg: any): arg is IMovable {
	return arg.getMover !== undefined
}
