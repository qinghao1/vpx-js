// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { ItemData } from '../item-data.js'

export class SpinnerData extends ItemData {
	public center!: Vertex2D
	public rotation: number = 0
	public szMaterial?: string
	public showBracket: boolean = true
	public height: number = 60
	public length: number = 80
	public damping!: number
	public angleMax: number = 0
	public angleMin: number = 0
	public elasticity!: number
	public isVisible: boolean = true
	public szImage?: string
	public szSurface?: string

	// not persisted but settable via API
	public isReflectionEnabled: boolean = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<SpinnerData> {
		const spinnerData = new SpinnerData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(spinnerData.fromTag.bind(spinnerData), {}))
		return spinnerData.correctAngles()
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private correctAngles(): this {
		// correct angle inversions
		const angleMin = Math.min(this.angleMin, this.angleMax)
		const angleMax = Math.max(this.angleMin, this.angleMax)
		this.angleMin = angleMin
		this.angleMax = angleMax
		return this
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'VCEN':
				this.center = Vertex2D.get(buffer)
				break
			case 'ROTA':
				this.rotation = this.getFloat(buffer)
				break
			case 'MATR':
				this.szMaterial = this.getString(buffer, len)
				break
			case 'SSUP':
				this.showBracket = this.getBool(buffer)
				break
			case 'HIGH':
				this.height = this.getFloat(buffer)
				break
			case 'LGTH':
				this.length = this.getFloat(buffer)
				break
			case 'AFRC':
				this.damping = this.getFloat(buffer)
				break
			case 'SMAX':
				this.angleMax = this.getFloat(buffer)
				break
			case 'SMIN':
				this.angleMin = this.getFloat(buffer)
				break
			case 'SELA':
				this.elasticity = this.getFloat(buffer)
				break
			case 'SVIS':
				this.isVisible = this.getBool(buffer)
				break
			case 'IMGF':
				this.szImage = this.getString(buffer, len)
				break
			case 'SURF':
				this.szSurface = this.getString(buffer, len)
				break
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
