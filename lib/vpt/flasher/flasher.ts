// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { Vertex2D } from '../../util/vector.js'
import { handleBiffTag } from '../biff-helper.js'
import { DragPoint } from '../dragpoint.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { ItemData } from '../item-data.js'
import type { Table, TableGenerateOptions } from '../table/table.js'
import { FlasherMeshGenerator } from './flasher-mesh-generator.js'
import { FlasherState } from './flasher-state.js'
import { FlasherUpdater } from './flasher-updater.js'

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
	public dragPoints: DragPoint[] = []
	public intensityScale = 1

	public static async fromStorage(storage: Storage, itemName: string): Promise<FlasherData> {
		const flasherData = new FlasherData(itemName)
		await storage.streamFiltered(itemName, 4, FlasherData.createStreamHandler(flasherData))
		return flasherData
	}

	private static createStreamHandler(flasherData: FlasherData) {
		return BiffParser.stream(flasherData.fromTag.bind(flasherData), {
			nestedTags: {
				DPNT: {
					onStart: () => new DragPoint(),
					onTag: dp => dp.fromTag.bind(dp),
					onEnd: dp => flasherData.dragPoints.push(dp),
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
	constructor(
		data: FlasherData,
		events: EventProxy,
		player: Player,
		table: Table,
		private readonly _state?: FlasherState,
	) {
		super(data, events, player, table)
	}

	get X() {
		return this.data.center.x
	}
	set X(value) {
		this.data.center.x = value
	}
	get Y() {
		return this.data.center.y
	}
	set Y(value) {
		this.data.center.y = value
	}
	get RotX() {
		return this._state?.rotX ?? this.data.rotX
	}
	set RotX(value) {
		this.data.rotX = value
		if (this._state) this._state.rotX = value
	}
	get RotY() {
		return this._state?.rotY ?? this.data.rotY
	}
	set RotY(value) {
		this.data.rotY = value
		if (this._state) this._state.rotY = value
	}
	get RotZ() {
		return this._state?.rotZ ?? this.data.rotZ
	}
	set RotZ(value) {
		this.data.rotZ = value
		if (this._state) this._state.rotZ = value
	}
	get Height() {
		return this._state?.height ?? this.data.height
	}
	set Height(value) {
		this.data.height = value
		if (this._state) this._state.height = value
	}
	get Color() {
		return this._state?.color ?? this.data.color
	}
	set Color(value) {
		this.data.color = value
		if (this._state) this._state.color = value
	}
	get ImageA() {
		return this.data.szImageA
	}
	set ImageA(value) {
		this.data.szImageA = value
	}
	get ImageB() {
		return this.data.szImageB
	}
	set ImageB(value) {
		this.data.szImageB = value
	}
	get Alpha() {
		return this._state?.alpha ?? this.data.alpha
	}
	set Alpha(value) {
		const val = Math.max(0, Math.min(100, value))
		this.data.alpha = val
		if (this._state) this._state.alpha = val
	}
	get ModulateVsAdd() {
		return this.data.modulateVsAdd
	}
	set ModulateVsAdd(value) {
		this.data.modulateVsAdd = Math.max(0, Math.min(1, value))
	}
	get Visible() {
		return this._state?.isVisible ?? this.data.isVisible
	}
	set Visible(value) {
		const val = !!value
		this.data.isVisible = val
		if (this._state) this._state.isVisible = val
	}
	get AddBlend() {
		return this.data.addBlend
	}
	set AddBlend(value) {
		this.data.addBlend = value
	}
	get DMD() {
		return this.data.isDMD
	}
	set DMD(value) {
		this.data.isDMD = value
	}
	get DisplayTexture() {
		return this.data.displayTexture
	}
	set DisplayTexture(value) {
		this.data.displayTexture = value
	}
	get DepthBias() {
		return this.data.depthBias
	}
	set DepthBias(value) {
		this.data.depthBias = value
	}
	get ImageAlignment() {
		return this.data.imageAlignment
	}
	set ImageAlignment(value) {
		this.data.imageAlignment = value
	}
	get Filter() {
		return filterToName(this.data.filter)
	}
	set Filter(value) {
		this.data.filter = nameToFilter(value)
	}
	get Opacity() {
		return this._state?.alpha ?? this.data.alpha
	}
	set Opacity(value) {
		const val = Math.max(0, value)
		this.data.alpha = val
		if (this._state) this._state.alpha = val
	}
	get Amount() {
		return this.data.filterAmount
	}
	set Amount(value) {
		this.data.filterAmount = Math.max(0, value)
	}
	get FilterAmount() {
		return this.data.filterAmount
	}
	set FilterAmount(value) {
		this.data.filterAmount = value
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
export class Flasher extends Item<FlasherData> implements IScriptable<FlasherApi>, IRenderable<FlasherState> {
	private api?: FlasherApi
	private readonly state: FlasherState
	private readonly updater: FlasherUpdater
	private readonly meshGenerator = new FlasherMeshGenerator()

	public static async fromStorage(storage: Storage, itemName: string): Promise<Flasher> {
		const data = await FlasherData.fromStorage(storage, itemName)
		return new Flasher(data)
	}

	private constructor(data: FlasherData) {
		super(data)
		this.state = FlasherState.claim(
			data.getName(),
			data.isVisible,
			data.color,
			data.alpha,
			data.rotX,
			data.rotY,
			data.rotZ,
			data.height,
		)
		this.updater = new FlasherUpdater(this.state, this.data)
	}

	public getState(): FlasherState {
		return this.state
	}

	public getUpdater(): FlasherUpdater {
		return this.updater
	}

	public getMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		table: Table,
		_renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		_opts: TableGenerateOptions,
	): Meshes<GEOMETRY> {
		const mesh = this.meshGenerator.generateMesh(this.data, table)
		if (!mesh) return {}
		const meshes: Meshes<GEOMETRY> = {}
		meshes.flasher = {
			isVisible: this.data.isVisible,
			mesh,
			map: this.data.szImageA ? table.getTexture(this.data.szImageA) : undefined,
			addBlend: this.data.addBlend,
			depthBias: this.data.depthBias,
			isTransparent: true,
			depthWrite: false,
		}
		return meshes
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new FlasherApi(this.data, this.events, player, table, this.state)
	}

	public getApi(): FlasherApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer']
	}
}
