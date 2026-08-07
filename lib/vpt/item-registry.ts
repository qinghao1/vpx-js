// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Storage } from '../io/ole-doc.js'
import { Bumper } from './bumper/bumper.js'
import { Decal } from './decal/decal.js'
import { DispReel } from './dispreel/dispreel.js'
import { ItemType } from './enums.js'
import { Flasher } from './flasher/flasher.js'
import { Flipper } from './flipper/flipper.js'
import { Gate } from './gate/gate.js'
import { HitTarget } from './hit-target/hit-target.js'
import type { Item } from './item.js'
import type { ItemData } from './item-data.js'
import { Kicker } from './kicker/kicker.js'
import { Light } from './light/light.js'
import { LightSeq } from './lightseq/lightseq.js'
import { Plunger } from './plunger/plunger.js'
import { Primitive } from './primitive/primitive.js'
import { Ramp } from './ramp/ramp.js'
import { Rubber } from './rubber/rubber.js'
import { Spinner } from './spinner/spinner.js'
import { Surface } from './surface/surface.js'
import type { TableLoadOptions } from './table/table.js'
import { Textbox } from './textbox/textbox.js'
import { Timer } from './timer/timer.js'
import { Trigger } from './trigger/trigger.js'

export type ItemFactory = (storage: Storage, name: string, opts: TableLoadOptions) => Promise<Item<ItemData> | null>

type RegistryEntry = {
	key: string // LoadedTable key, e.g. 'bumpers'
	factory: ItemFactory
}

/**
 * Central registry for all game items.
 * Maps ItemType to its storage key and loader. Reduces duplication in TableLoader/Table.
 */
export const ITEM_REGISTRY: Record<number, RegistryEntry> = {
	[ItemType.Surface]: { key: 'surfaces', factory: (s, n) => Surface.fromStorage(s, n) },
	[ItemType.Primitive]: { key: 'primitives', factory: (s, n, o) => Primitive.fromStorage(s, n, o.skipMeshes === true) },
	[ItemType.Flasher]: { key: 'flashers', factory: (s, n) => Flasher.fromStorage(s, n) },
	[ItemType.Rubber]: { key: 'rubbers', factory: (s, n) => Rubber.fromStorage(s, n) },
	[ItemType.Flipper]: { key: 'flippers', factory: (s, n) => Flipper.fromStorage(s, n) },
	[ItemType.Bumper]: { key: 'bumpers', factory: (s, n) => Bumper.fromStorage(s, n) },
	[ItemType.Ramp]: { key: 'ramps', factory: (s, n) => Ramp.fromStorage(s, n) },
	[ItemType.Light]: { key: 'lights', factory: (s, n) => Light.fromStorage(s, n) },
	[ItemType.HitTarget]: { key: 'hitTargets', factory: (s, n) => HitTarget.fromStorage(s, n) },
	[ItemType.Gate]: { key: 'gates', factory: (s, n) => Gate.fromStorage(s, n) },
	[ItemType.Kicker]: { key: 'kickers', factory: (s, n) => Kicker.fromStorage(s, n) },
	[ItemType.Trigger]: { key: 'triggers', factory: (s, n) => Trigger.fromStorage(s, n) },
	[ItemType.Spinner]: { key: 'spinners', factory: (s, n) => Spinner.fromStorage(s, n) },
	[ItemType.Timer]: { key: 'timers', factory: (s, n) => Timer.fromStorage(s, n) },
	[ItemType.Plunger]: { key: 'plungers', factory: (s, n) => Plunger.fromStorage(s, n) },
	[ItemType.Textbox]: { key: 'textBoxes', factory: (s, n) => Textbox.fromStorage(s, n) },
	[ItemType.Decal]: { key: 'decals', factory: (s, n) => Decal.fromStorage(s, n) },
	[ItemType.LightSeq]: { key: 'lightSeqs', factory: (s, n) => LightSeq.fromStorage(s, n) },
	[ItemType.DispReel]: { key: 'dispReels', factory: (s, n) => DispReel.fromStorage(s, n) },
}

/** All keys used in LoadedTable for game items. */
export const ITEM_KEYS = Object.values(ITEM_REGISTRY).map((e) => e.key)

/**
 * Loads an item by ItemType using the registry.
 * Returns null for unknown types.
 */
export async function loadItemByType(
	storage: Storage,
	itemName: string,
	itemType: number,
	opts: TableLoadOptions,
): Promise<Item<ItemData> | null> {
	const entry = ITEM_REGISTRY[itemType]
	if (!entry) return null
	return entry.factory(storage, itemName, opts)
}

/** Returns the LoadedTable key for a given ItemType, if registered. */
export function getItemKey(itemType: number): string | undefined {
	return ITEM_REGISTRY[itemType]?.key
}
