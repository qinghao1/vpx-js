// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../util/vector.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'

const FLOAT_MAP: Record<string, string> = { WDTH: 'width', HIGH: 'height', ROTA: 'rotation' }
const INT_MAP: Record<string, string> = { TYPE: 'decalType', SIZE: 'sizingType' }
const BOOL_MAP: Record<string, string> = { VERT: 'verticalText', BGLS: 'backglass' }
const STRING_MAP: Record<string, string> = { IMAG: 'szImage', SURF: 'szSurface', TEXT: 'text', MATR: 'szMaterial' }

/** Decal data.
 * @see https://github.com/vpinball/vpinball/blob/master/decal.cpp */
export class DecalData extends ItemData {
	public center!: Vertex2D
	public width = 100
	public height = 100
	public rotation = 0
	public szImage?: string
	public szSurface?: string
	public text?: string
	public decalType: number = Enums.DecalType.DecalImage
	public sizingType: number = Enums.SizingType.ManualSize
	public color = 0x000000
	public szMaterial?: string
	public verticalText = false
	public font = ''

	public static async fromStorage(storage: Storage, itemName: string): Promise<DecalData> {
		const d = new DecalData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d), { streamedTags: ['FONT'] }))
		return d
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'COLR') {
			this.color = BiffParser.bgrToRgb(this.getInt(buffer))
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
}

/** Decal API — VBS surface for `Decal`. @see https://github.com/vpinball/vpinball/blob/master/decal.cpp */
export class DecalApi extends ItemApi<DecalData> {
	get Rotation() {
		return this.data.rotation
	}
	set Rotation(v) {
		this.data.rotation = v
	}
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this.data.szImage = v
	}
	get Width() {
		return this.data.width
	}
	set Width(v) {
		this.data.width = v
	}
	get Height() {
		return this.data.height
	}
	set Height(v) {
		this.data.height = v
	}
	get X() {
		return this.data.center.x
	}
	set X(v) {
		this.data.center.x = v
	}
	get Y() {
		return this.data.center.y
	}
	set Y(v) {
		this.data.center.y = v
	}
	get Surface() {
		return this.data.szSurface
	}
	set Surface(v) {
		this.data.szSurface = v
	}
	get Type() {
		return this.data.decalType
	}
	set Type(v) {
		this.data.decalType = v
	}
	get Text() {
		return this.data.text
	}
	set Text(v) {
		this.data.text = v
	}
	get SizingType() {
		return this.data.sizingType
	}
	set SizingType(v) {
		this.data.sizingType = v
	}
	get FontColor() {
		return this.data.color
	}
	set FontColor(v) {
		this.data.color = v
	}
	get HasVerticalText() {
		return this.data.verticalText
	}
	set HasVerticalText(v) {
		this.data.verticalText = v
	}
	get Material() {
		return this.data.szMaterial
	}
	set Material(v) {
		this.data.szMaterial = v
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(DecalApi.prototype)
	}
}

/** Decal item. */
export class Decal extends Item<DecalData> implements IScriptable<DecalApi> {
	private api?: DecalApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Decal> {
		const data = await DecalData.fromStorage(storage, itemName)
		return new Decal(data)
	}

	private constructor(data: DecalData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new DecalApi(this.data, this.events, player, table)
	}

	public getApi(): DecalApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return []
	}
}
