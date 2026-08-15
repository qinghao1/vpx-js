// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../util/vector.js'
import { handleBiffTag } from '../biff-helper.js'
import { DragPoint } from '../dragpoint.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'

const FLOAT_MAP: Record<string, string> = {
	FHEI: 'height',
	FROX: 'rotX',
	FROY: 'rotY',
	FROZ: 'rotZ',
	MOVA: 'modulateVsAdd',
	FLDB: 'depthBias',
}
const INT_MAP: Record<string, string> = {
	ALGN: 'imageAlignment',
	FILT: 'filter',
	FIAM: 'filterAmount',
	COLR: 'color',
	FALP: 'alpha',
}
const BOOL_MAP: Record<string, string> = { FVIS: 'isVisible', ADDB: 'addBlend', IDMD: 'isDMD', DSPT: 'displayTexture' }
const STRING_MAP: Record<string, string> = { IMAG: 'szImageA', IMAB: 'szImageB' }

/** Flasher data.
 * @see https://github.com/vpinball/vpinball/blob/master/flasher.cpp */
export class FlasherData extends ItemData {
	public height = 50
	public center: Vertex2D = new Vertex2D()
	public rotX = 0
	public rotY = 0
	public rotZ = 0
	public color = 0x32c832
	public szImageA?: string
	public szImageB?: string
	public alpha = 100
	public modulateVsAdd = 0.9
	public isVisible = true
	public addBlend = false
	public isDMD = false
	public displayTexture = false
	public depthBias = 0
	public imageAlignment: number = Enums.ImageAlignment.ImageAlignTopLeft
	public filter: number = Enums.Filters.Filter_Overlay
	public filterAmount = 100
	private dragPoints: DragPoint[] = []
	public intensityScale = 1

	public static async fromStorage(storage: Storage, itemName: string): Promise<FlasherData> {
		const d = new FlasherData(itemName)
		await storage.streamFiltered(itemName, 4, FlasherData.createStreamHandler(d))
		return d
	}

	private static createStreamHandler(d: FlasherData) {
		return BiffParser.stream(d.fromTag.bind(d), {
			nestedTags: {
				DPNT: {
					onStart: () => new DragPoint(),
					onTag: dp => dp.fromTag.bind(dp),
					onEnd: dp => d.dragPoints.push(dp),
				},
			},
		})
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'FLAX') {
			this.center.x = this.getFloat(buffer)
			return 0
		}
		if (tag === 'FLAY') {
			this.center.y = this.getFloat(buffer)
			return 0
		}
		if (tag === 'FALP') {
			this.alpha = Math.max(0, this.getInt(buffer))
			return 0
		}
		if (tag === 'RDMD') {
			this.isDMD = this.getInt(buffer) === 1
			return 0
		}
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

/** Flasher API — VBS surface for `Flasher`. @see https://github.com/vpinball/vpinball/blob/master/flasher.cpp */
export class FlasherApi extends ItemApi<FlasherData> {
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
	get RotX() {
		return this.data.rotX
	}
	set RotX(v) {
		this.data.rotX = v
	}
	get RotY() {
		return this.data.rotY
	}
	set RotY(v) {
		this.data.rotY = v
	}
	get RotZ() {
		return this.data.rotZ
	}
	set RotZ(v) {
		this.data.rotZ = v
	}
	get Height() {
		return this.data.height
	}
	set Height(v) {
		this.data.height = v
	}
	get Color() {
		return this.data.color
	}
	set Color(v) {
		this.data.color = v
	}
	get ImageA() {
		return this.data.szImageA
	}
	set ImageA(v) {
		this.data.szImageA = v
	}
	get ImageB() {
		return this.data.szImageB
	}
	set ImageB(v) {
		this.data.szImageB = v
	}
	get Alpha() {
		return this.data.alpha
	}
	set Alpha(v) {
		this.data.alpha = Math.max(0, Math.min(100, v))
	}
	get ModulateVsAdd() {
		return this.data.modulateVsAdd
	}
	set ModulateVsAdd(v) {
		this.data.modulateVsAdd = Math.max(0, Math.min(1, v))
	}
	get Visible() {
		return this.data.isVisible
	}
	set Visible(v) {
		this.data.isVisible = v
	}
	get AddBlend() {
		return this.data.addBlend
	}
	set AddBlend(v) {
		this.data.addBlend = v
	}
	get DMD() {
		return this.data.isDMD
	}
	set DMD(v) {
		this.data.isDMD = v
	}
	get DisplayTexture() {
		return this.data.displayTexture
	}
	set DisplayTexture(v) {
		this.data.displayTexture = v
	}
	get DepthBias() {
		return this.data.depthBias
	}
	set DepthBias(v) {
		this.data.depthBias = v
	}
	get ImageAlignment() {
		return this.data.imageAlignment
	}
	set ImageAlignment(v) {
		this.data.imageAlignment = v
	}
	get Filter() {
		return filterToName(this.data.filter)
	}
	set Filter(v) {
		this.data.filter = nameToFilter(v)
	}
	get Opacity() {
		return this.data.alpha
	}
	set Opacity(v) {
		this.data.alpha = Math.max(0, v)
	}
	get Amount() {
		return this.data.filterAmount
	}
	set Amount(v) {
		this.data.filterAmount = Math.max(0, v)
	}
	get FilterAmount() {
		return this.data.filterAmount
	}
	set FilterAmount(v) {
		this.data.filterAmount = v
	}
	get IntensityScale() {
		return this.data.intensityScale
	}
	set IntensityScale(v) {
		this.data.intensityScale = v
	}

	public InterfaceSupportsErrorInfo(_riid: unknown): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(FlasherApi.prototype)
	}
}

function filterToName(filter: number): string {
	switch (filter) {
		case Enums.Filters.Filter_Additive:
			return 'Additive'
		case Enums.Filters.Filter_Multiply:
			return 'Multiply'
		case Enums.Filters.Filter_Screen:
			return 'Screen'
		case Enums.Filters.Filter_None:
			return 'None'
	}
	return 'None'
}

function nameToFilter(name?: string): number {
	switch ((name || '').toLowerCase()) {
		case 'additive':
			return Enums.Filters.Filter_Additive
		case 'multiply':
			return Enums.Filters.Filter_Multiply
		case 'screen':
			return Enums.Filters.Filter_Screen
		case 'none':
			return Enums.Filters.Filter_None
	}
	return Enums.Filters.Filter_None
}

/** Runtime flasher. */
export class Flasher extends Item<FlasherData> implements IScriptable<FlasherApi> {
	private api?: FlasherApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Flasher> {
		const data = await FlasherData.fromStorage(storage, itemName)
		return new Flasher(data)
	}

	private constructor(data: FlasherData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new FlasherApi(this.data, this.events, player, table)
	}

	public getApi(): FlasherApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer']
	}
}
