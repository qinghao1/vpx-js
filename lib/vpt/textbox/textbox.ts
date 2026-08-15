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

const FLOAT_MAP: Record<string, string> = { INSC: 'intensityScale' }
const INT_MAP: Record<string, string> = { ALGN: 'align' }
const BOOL_MAP: Record<string, string> = { TRNS: 'isTransparent', IDMD: 'isDMD' }
const STRING_MAP: Record<string, string> = { TEXT: 'text' }

/** Textbox data. @see https://github.com/vpinball/vpinball/blob/master/textbox.cpp */
export class TextboxData extends ItemData {
	public v1!: Vertex2D
	public v2!: Vertex2D
	public backColor = 0x000000
	public fontColor = 0xffffff
	public intensityScale = 1
	public text = '0'
	public align: number = Enums.TextAlignment.TextAlignRight
	public isTransparent = false
	public isDMD = false
	public isVisible = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<TextboxData> {
		const d = new TextboxData(itemName)
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
		if (tag === 'CLRF') {
			this.fontColor = BiffParser.bgrToRgb(this.getInt(buffer))
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

/** Textbox API — VBS surface for `Textbox`. @see https://github.com/vpinball/vpinball/blob/master/textbox.cpp */
export class TextboxApi extends ItemApi<TextboxData> {
	get BackColor() {
		return this.data.backColor
	}
	set BackColor(v) {
		this.data.backColor = v
	}
	get FontColor() {
		return this.data.fontColor
	}
	set FontColor(v) {
		this.data.fontColor = v
	}
	get Text() {
		return this.data.text
	}
	set Text(v) {
		this.data.text = v
	}
	get Width() {
		return this.data.v2.x - this.data.v1.x
	}
	set Width(v) {
		this.data.v2.x = this.data.v1.x + v
	}
	get Height() {
		return this.data.v2.y - this.data.v1.y
	}
	set Height(v) {
		this.data.v2.y = this.data.v1.y + v
	}
	get X() {
		return this.data.v1.x
	}
	set X(v) {
		const delta = v - this.data.v1.x
		this.data.v1.x += delta
		this.data.v2.x += delta
	}
	get Y() {
		return this.data.v1.y
	}
	set Y(v) {
		const delta = v - this.data.v1.y
		this.data.v1.y += delta
		this.data.v2.y += delta
	}
	get IntensityScale() {
		return this.data.intensityScale
	}
	set IntensityScale(v) {
		this.data.intensityScale = v
	}
	get Visible() {
		return this.data.isVisible
	}
	set Visible(v) {
		this.data.isVisible = v
	}
	get Alignment() {
		return this.data.align
	}
	set Alignment(v) {
		this.data.align = v
	}
	get IsTransparent() {
		return this.data.isTransparent
	}
	set IsTransparent(v) {
		this.data.isTransparent = v
	}
	get DMD() {
		return this.data.isDMD
	}
	set DMD(v) {
		this.data.isDMD = v
	}

	public InterfaceSupportsErrorInfo(_riid: unknown): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(TextboxApi.prototype)
	}
}

/** Runtime textbox. */
export class Textbox extends Item<TextboxData> implements IScriptable<TextboxApi> {
	private api?: TextboxApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Textbox> {
		const data = await TextboxData.fromStorage(storage, itemName)
		return new Textbox(data)
	}

	private constructor(data: TextboxData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new TextboxApi(this.data, this.events, player, table)
	}

	public getApi(): TextboxApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer']
	}
}
