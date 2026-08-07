// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { ItemApi } from '../vpt/item-api.js'
import type { ItemData } from '../vpt/item-data.js'
import type { IPlayable } from './iplayable.js'

/** Script-exposed table element. */
export interface IScriptable<T extends ItemApi<ItemData>> extends IPlayable {
	getApi(): T
	getEventNames(): string[]
}

export function isScriptable<T extends ItemApi<ItemData>>(arg: any): arg is IScriptable<T> {
	return arg.getApi !== undefined
}
