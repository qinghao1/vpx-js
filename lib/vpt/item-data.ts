// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../io/biff-parser.js'
import type { Storage } from '../io/ole-doc.js'
import { ItemType } from './enums.js'
import type { Table } from './table/table.js'

const TYPE_NAMES: Record<number, string> = {
	[ItemType.Surface]: 'Surface',
	[ItemType.Flipper]: 'Flipper',
	[ItemType.Timer]: 'Timer',
	[ItemType.Plunger]: 'Plunger',
	[ItemType.Textbox]: 'Textbox',
	[ItemType.Bumper]: 'Bumper',
	[ItemType.Trigger]: 'Trigger',
	[ItemType.Light]: 'Light',
	[ItemType.Kicker]: 'Kicker',
	[ItemType.Decal]: 'Decal',
	[ItemType.Gate]: 'Gate',
	[ItemType.Spinner]: 'Spinner',
	[ItemType.Ramp]: 'Ramp',
	[ItemType.Table]: 'Table',
	[ItemType.LightCenter]: 'Light Center',
	[ItemType.DragPoint]: 'Drag Point',
	[ItemType.Collection]: 'Collection',
	[ItemType.DispReel]: 'Reel',
	[ItemType.LightSeq]: 'Light Sequence',
	[ItemType.Primitive]: 'Primitive',
	[ItemType.Flasher]: 'Flasher',
	[ItemType.Rubber]: 'Rubber',
	[ItemType.HitTarget]: 'Hit Target',
	[ItemType.Count]: 'Count',
	[ItemType.Invalid]: 'Invalid',
}

/** Base for VPX item data parsed from OLE storage. */
export abstract class ItemData extends BiffParser {
	public static getType(type: number): string {
		return TYPE_NAMES[type] ?? `Unknown type "${type}"`
	}

	public timer = new TimerDataRoot()
	public name!: string
	private pdata?: number
	private fLocked?: boolean
	private layerIndex?: number

	public constructor(public readonly itemName: string) {
		super()
	}

	public getName(): string {
		return this.name
	}

	protected async getData(storage: Storage, itemName: string, offset: number, len: number): Promise<Uint8Array> {
		return storage.read(itemName, offset, len)
	}

	protected getCommonBlock(buffer: Uint8Array, tag: string, _len: number): void {
		switch (tag) {
			case 'NAME':
				this.name = this.getWideString(buffer, _len)
				break
			case 'PIID':
				this.pdata = this.getInt(buffer)
				break
			case 'LOCK':
				this.fLocked = this.getBool(buffer)
				break
			case 'LAYR':
				this.layerIndex = this.getInt(buffer)
				break
			case 'TMON':
				this.timer.enabled = this.getBool(buffer)
				break
			case 'TMIN':
				this.timer.interval = this.getInt(buffer)
				break
			default:
				break
		}
	}
}

export interface IPhysicalData {
	elasticity: number
	elasticityFalloff?: number
	friction: number
	scatter: number
	overwritePhysics: boolean
	isCollidable: boolean
	szPhysicsMaterial?: string
}

export class TimerDataRoot {
	public interval = 100
	public enabled = true
}
