// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { DragPoint } from '../../math/dragpoint.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

/** Trigger data. */
export class TriggerData extends ItemData {
	public dragPoints: DragPoint[] = []
	public center!: Vertex2D
	public radius: number = 25
	public rotation: number = 0
	public scaleX: number = 1
	public scaleY: number = 1
	public szMaterial?: string
	public szSurface?: string
	public isVisible: boolean = true
	public isEnabled: boolean = true
	public hitHeight: number = 50
	public shape: number = Enums.TriggerShape.TriggerWireA
	public animSpeed: number = 1

	public wireThickness: number = 0
	public isReflectionEnabled: boolean = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<TriggerData> {
		const triggerData = new TriggerData(itemName)
		await storage.streamFiltered(itemName, 4, TriggerData.createStreamHandler(triggerData))
		return triggerData
	}

	private static createStreamHandler(triggerItem: TriggerData) {
		triggerItem.dragPoints = []
		return BiffParser.stream(triggerItem.fromTag.bind(triggerItem), {
			nestedTags: {
				DPNT: {
					onStart: () => new DragPoint(),
					onTag: (dragPoint) => dragPoint.fromTag.bind(dragPoint),
					onEnd: (dragPoint) => triggerItem.dragPoints.push(dragPoint),
				},
			},
		})
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'VCEN':
				this.center = Vertex2D.get(buffer)
				break
			case 'RADI':
				this.radius = this.getFloat(buffer)
				break
			case 'ROTA':
				this.rotation = this.getFloat(buffer)
				break
			case 'WITI':
				this.wireThickness = this.getFloat(buffer)
				break
			case 'SCAX':
				this.scaleX = this.getFloat(buffer)
				break
			case 'SCAY':
				this.scaleY = this.getFloat(buffer)
				break
			case 'MATR':
				this.szMaterial = this.getString(buffer, len)
				break
			case 'SURF':
				this.szSurface = this.getString(buffer, len)
				break
			case 'EBLD':
				this.isEnabled = this.getBool(buffer)
				break
			case 'THOT':
				this.hitHeight = this.getFloat(buffer)
				break
			case 'VSBL':
				this.isVisible = this.getBool(buffer)
				break
			case 'REEN':
				this.isReflectionEnabled = this.getBool(buffer)
				break
			case 'SHAP':
				this.shape = this.getInt(buffer)
				break
			case 'ANSP':
				this.animSpeed = this.getFloat(buffer)
				break
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
