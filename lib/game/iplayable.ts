// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Table } from '../vpt/table/table.js'
import type { IItem } from './iitem.js'
import type { Player } from './player.js'

/** Table element that participates in gameplay (≈ IEditable in VPinball). */
export interface IPlayable extends IItem {
	setupPlayer(player: Player, table: Table): void
}

export function isPlayable(arg: any): arg is IPlayable {
	return arg.setupPlayer !== undefined
}
