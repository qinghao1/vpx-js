// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../io/biff-parser.js'
import type { Storage } from '../io/ole-doc.js'
import { ItemType } from './enums.js'
import type { Table } from './table/table.js'

/**
 * Parent class for game items parsed from the VPX file.
 *
 * It contains helper functions for parsing the data.
 */
export abstract class ItemData extends BiffParser {
	/* istanbul ignore next: this is mainly for debugging stuff. */
	public static getType(type: number): string {
		switch (type) {
			case ItemType.Surface:
				return 'Surface'
			case ItemType.Flipper:
				return 'Flipper'
			case ItemType.Timer:
				return 'Timer'
			case ItemType.Plunger:
				return 'Plunger'
			case ItemType.Textbox:
				return 'Textbox'
			case ItemType.Bumper:
				return 'Bumper'
			case ItemType.Trigger:
				return 'Trigger'
			case ItemType.Light:
				return 'Light'
			case ItemType.Kicker:
				return 'Kicker'
			case ItemType.Decal:
				return 'Decal'
			case ItemType.Gate:
				return 'Gate'
			case ItemType.Spinner:
				return 'Spinner'
			case ItemType.Ramp:
				return 'Ramp'
			case ItemType.Table:
				return 'Table'
			case ItemType.LightCenter:
				return 'Light Center'
			case ItemType.DragPoint:
				return 'Drag Point'
			case ItemType.Collection:
				return 'Collection'
			case ItemType.DispReel:
				return 'Reel'
			case ItemType.LightSeq:
				return 'Light Sequence'
			case ItemType.Primitive:
				return 'Primitive'
			case ItemType.Flasher:
				return 'Flasher'
			case ItemType.Rubber:
				return 'Rubber'
			case ItemType.HitTarget:
				return 'Hit Target'
			case ItemType.Count:
				return 'Count'
			case ItemType.Invalid:
				return 'Invalid'
		}
		return `Unknown type "${type}"`
	}

	public timer = new TimerDataRoot()
	public name!: string
	public readonly itemName: string
	private pdata?: number
	private fLocked?: boolean
	private layerIndex?: number

	public constructor(itemName: string) {
		super()
		this.itemName = itemName
	}

	public getName(): string {
		return this.name
	}

	protected async getData(storage: Storage, itemName: string, offset: number, len: number): Promise<Uint8Array> {
		return storage.read(itemName, offset, len)
	}

	protected getCommonBlock(buffer: Uint8Array, tag: string, len: number) {
		switch (tag) {
			case 'NAME':
				this.name = this.getWideString(buffer, len)
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
				//logger().warn('[GameItem.parseUnknownBlock]: Unknown block "%s".', tag);
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

export /** TimerDataRoot. */
class TimerDataRoot {
	public interval: number = 100
	public enabled: boolean = true
}
