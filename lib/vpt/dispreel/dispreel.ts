// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { MAX_REELS } from '../../physics/constants.js'
import { Vertex2D } from '../../util/vector.js'
import { handleBiffTag } from '../biff-helper.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'

const FLOAT_MAP: Record<string, string> = { WDTH: 'width', HIGH: 'height', RSPC: 'reelSpacing' }
const INT_MAP: Record<string, string> = { GIPR: 'imagesPerGridRow', UPTM: 'updateInterval' }
const BOOL_MAP: Record<string, string> = { TRNS: 'isTransparent', VISI: 'isVisible', UGRD: 'useImageGrid' }
const STRING_MAP: Record<string, string> = { IMAG: 'szImage', SOUN: 'szSound' }

/** DispReel data.
 * @see https://github.com/vpinball/vpinball/blob/master/dispreel.cpp */
export class DispReelData extends ItemData {
	public v1!: Vertex2D
	public v2!: Vertex2D
	public width = 30
	public height = 40
	public backColor = 0x404040
	public isTransparent = false
	public isVisible = true
	public szImage?: string
	public reelCount = 5
	public reelSpacing = 4
	public motorSteps = 2
	public szSound?: string
	public useImageGrid = false
	public imagesPerGridRow = 1
	public digitRange = 9
	public updateInterval = 50

	public static async fromStorage(storage: Storage, itemName: string): Promise<DispReelData> {
		const d = new DispReelData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d), { streamedTags: ['FONT'] }))
		return d
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VER1') {
			this.v1 = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'VER2') {
			this.v2 = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'CLRB') {
			this.backColor = BiffParser.bgrToRgb(this.getInt(buffer))
			return 0
		}
		if (tag === 'RCNT') {
			this.reelCount = Math.floor(this.getFloat(buffer))
			return 0
		}
		if (tag === 'MSTP') {
			this.motorSteps = Math.floor(this.getFloat(buffer))
			return 0
		}
		if (tag === 'RANG') {
			this.digitRange = Math.floor(this.getFloat(buffer))
			return 0
		}
		if (tag === 'FONT') return 0
		if (
			handleBiffTag(this, tag, buffer, len, {
				float: FLOAT_MAP,
				int: INT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			return 0
		this.getCommonBlock(buffer, tag, len)
		return 0
	}

	public getBoxWidth(): number {
		return this.reelCount * this.width + this.reelCount * this.reelSpacing + this.reelSpacing
	}

	public getBoxHeight(): number {
		return this.height + this.reelSpacing * 2
	}
}

/** DispReel API — VBS surface for `Reel`. @see https://github.com/vpinball/vpinball/blob/master/dispreel.cpp */
export class DispReelApi extends ItemApi<DispReelData> {
	get BackColor() {
		return this.data.backColor
	}
	set BackColor(v) {
		this.data.backColor = v
	}
	get Reels() {
		return this.data.reelCount
	}
	set Reels(v) {
		this.data.reelCount = Math.min(Math.max(1, v), MAX_REELS)
		this.data.v2.x = this.data.v1.x + this.data.getBoxWidth()
		this.data.v2.y = this.data.v1.y + this.data.getBoxHeight()
	}
	get Width() {
		return this.data.width
	}
	set Width(v) {
		this.data.width = Math.max(0, v)
		this.data.v2.x = this.data.v1.x + this.data.getBoxWidth()
	}
	get Height() {
		return this.data.height
	}
	set Height(v) {
		this.data.height = Math.max(0, v)
		this.data.v2.y = this.data.v1.y + this.data.getBoxHeight()
	}
	get X() {
		return this.data.v1.x
	}
	set X(v) {
		const delta = v - this.data.v1.x
		this.data.v1.x += delta
		this.data.v2.x = this.data.v1.x + this.data.getBoxWidth()
	}
	get Y() {
		return this.data.v1.y
	}
	set Y(v) {
		const delta = v - this.data.v1.y
		this.data.v1.y += delta
		this.data.v2.y = this.data.v1.y + this.data.getBoxHeight()
	}
	get IsTransparent() {
		return this.data.isTransparent
	}
	set IsTransparent(v) {
		this.data.isTransparent = v
	}
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this.data.szImage = v
	}
	get Sound() {
		return this.data.szSound
	}
	set Sound(v) {
		this.data.szSound = v
	}
	get Steps() {
		return this.data.motorSteps
	}
	set Steps(v) {
		this.data.motorSteps = Math.max(1, v)
	}
	get Range() {
		return this.data.digitRange
	}
	set Range(v) {
		this.data.digitRange = Math.max(0, v)
		if (this.data.digitRange > 511) this.data.digitRange = 511
	}
	get Spacing() {
		return this.data.reelSpacing
	}
	set Spacing(v) {
		this.data.reelSpacing = Math.max(0, v)
		this.data.v2.x = this.data.v1.x + this.data.getBoxWidth()
		this.data.v2.y = this.data.v1.y + this.data.getBoxHeight()
	}
	get UseImageGrid() {
		return this.data.useImageGrid
	}
	set UseImageGrid(v) {
		this.data.useImageGrid = v
	}
	get ImagesPerGridRow() {
		return this.data.imagesPerGridRow
	}
	set ImagesPerGridRow(v) {
		this.data.imagesPerGridRow = v
	}
	get ImagesPerRow() {
		return this.data.imagesPerGridRow
	}
	set ImagesPerRow(v) {
		this.data.imagesPerGridRow = v
	}
	get UpdateInterval() {
		return this.data.updateInterval
	}
	set UpdateInterval(v) {
		this.data.updateInterval = Math.max(5, v)
	}
	public ResetToZero(): void {}
	public AddValue(_v: number): void {}
	public SetValue(_v: number): void {}
	public SpinReel(_reelNumber: number, _pulseCount: number): void {}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(DispReelApi.prototype)
	}
}

/** Runtime disp reel. */
export class DispReel extends Item<DispReelData> implements IScriptable<DispReelApi> {
	private api?: DispReelApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<DispReel> {
		const data = await DispReelData.fromStorage(storage, itemName)
		return new DispReel(data)
	}

	private constructor(data: DispReelData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new DispReelApi(this.data, this.events, player, table)
	}

	public getApi(): DispReelApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer']
	}
}
