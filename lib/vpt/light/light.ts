// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IAnimatable, IAnimation } from '../../game/ianimatable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex2D } from '../../util/vector.js'
import { handleBiffTag } from '../biff-helper.js'
import { DragPoint } from '../dragpoint.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import { Material } from '../material.js'
import type { Table } from '../table/table.js'
import { LightAnimation } from './light-physics.js'
import { LightMeshGenerator, LightUpdater } from './light-view.js'

const FLOAT_MAP: Record<string, string> = {
	HGHT: 'height',
	RADI: 'falloff',
	FAPO: 'falloffPower',
	BWTH: 'intensity',
	TRMS: 'transmissionScale',
	LIDB: 'depthBias',
	FASP: 'fadeSpeedUp',
	FASD: 'fadeSpeedDown',
	BMSC: 'meshRadius',
	BMVA: 'bulbModulateVsAdd',
	BHHI: 'bulbHaloHeight',
	STTF: 'state',
}
const INT_MAP: Record<string, string> = { STAT: 'state', BINT: 'blinkInterval', SHDW: 'shadows', FADE: 'fader' }
const BOOL_MAP: Record<string, string> = {
	SHAP: 'roundLight',
	BGLS: 'isBackglass',
	BULT: 'bulbLight',
	IMMO: 'imageMode',
	SHBM: 'showBulbMesh',
	STBM: 'staticBulbMesh',
	SHRB: 'showReflectionOnBall',
	VSBL: 'isVisible',
}
const STRING_MAP: Record<string, string> = { IMG1: 'szOffImage', BPAT: 'rgBlinkPattern', SURF: 'szSurface' }

/** Light data.
 * @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class LightData extends ItemData {
	public center!: Vertex2D
	public falloff = 50
	public falloffPower = 2
	public state: number = Enums.LightStatus.LightStateOff
	public color = 0xffa957
	public color2 = 0xffffff
	public szOffImage?: string
	public roundLight = false
	public rgBlinkPattern = '10'
	public blinkInterval = 125
	public intensity = 10
	public transmissionScale = 0
	public szSurface?: string
	public isBackglass = false
	public depthBias?: number
	public fadeSpeedUp = 0.05
	public fadeSpeedDown = 0.02
	public bulbLight = false
	public imageMode = false
	public showBulbMesh = false
	public staticBulbMesh = true
	public showReflectionOnBall = true
	public meshRadius = 20
	public bulbModulateVsAdd = 0.9
	public bulbHaloHeight = 28
	public height = 0
	public shadows = 0 // ShadowMode::NONE
	public fader = 1 // Fader::LINEAR
	public dragPoints: DragPoint[] = []
	public isVisible = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<LightData> {
		const d = new LightData(itemName)
		await storage.streamFiltered(itemName, 4, LightData.createStreamHandler(d))
		return d
	}

	private static createStreamHandler(d: LightData) {
		d.dragPoints = []
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

	public constructor(itemName: string) {
		super(itemName)
	}

	public isOn(): boolean {
		if (this.state === Enums.LightStatus.LightStateOff) return false
		if (this.state === Enums.LightStatus.LightStateBlinking) return this.rgBlinkPattern?.[0] === '1'
		return this.state === Enums.LightStatus.LightStateOn
	}

	public isBulbLight(): boolean {
		return this.showBulbMesh && this.meshRadius > 0
	}

	public isPlayfieldLight(table: Table): boolean {
		return this.isSurfaceLight(table) && !this.isOnSurface(table)
	}

	private isOnSurface(table: Table): boolean {
		return !!this.szSurface && !!table.surfaces[this.szSurface]
	}

	/**
	 * Playfield insert: polygon light directly on the playfield.
	 * Mirrors vpinball `Light::RenderSetup` which builds `m_lightmapMeshBuffer`
	 * from `GetRgVertex` for *any* light with vertices — the only generic
	 * discriminator is shape vs bulb/surface placement.
	 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/light.cpp#L433
	 */
	public isSurfaceLight(_table: Table): boolean {
		if (this.bulbLight || this.isBulbLight()) return false
		return this.dragPoints.length > 2
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
		if (tag === 'COL2') {
			this.color2 = BiffParser.bgrToRgb(this.getInt(buffer))
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

/** Light state. @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class LightState extends ItemState {
	public intensity = 0
	public color: number = 0
	public colorFull: number = 0

	public static claim(name: string, intensity: number, color: number, colorFull: number): LightState {
		const state = new LightState()
		state.name = name
		state.intensity = intensity
		state.color = color
		state.colorFull = colorFull
		return state
	}
}

/** Light API — VBS surface for `Light`. @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class LightApi extends ItemApi<LightData> {
	constructor(
		private readonly _state: LightState,
		private readonly animation: LightAnimation,
		data: LightData,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
	}

	get Falloff() {
		return this.data.falloff
	}
	set Falloff(v) {
		if (v > 0) this.data.falloff = v
	}
	get FalloffPower() {
		return this.data.falloffPower
	}
	set FalloffPower(v) {
		this.data.falloffPower = v
	}
	get State() {
		return this.animation.lockedByLS ? this.data.state : this.animation.realState
	}
	set State(v) {
		/* istanbul ignore next: No light sequences yet */
		if (!this.animation.lockedByLS) this.animation.setState(v, this.player.getPhysics())
		this.data.state = v
	}
	get Color() {
		return this._state.color
	}
	set Color(v) {
		this._state.color = v
		this.data.color = v
	}
	get ColorFull() {
		return this._state.colorFull
	}
	set ColorFull(v) {
		this._state.colorFull = v
		this.data.color2 = v
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
	get BlinkPattern() {
		return this.data.rgBlinkPattern
	}
	set BlinkPattern(v) {
		this.data.rgBlinkPattern = v || '0'
		this.animation.restartBlinker(this.player.getPhysics().timeMsec)
	}
	get BlinkInterval() {
		return this.data.blinkInterval
	}
	set BlinkInterval(v) {
		this.data.blinkInterval = v
		this.animation.timeNextBlink = this.player.getPhysics().timeMsec + this.data.blinkInterval
	}
	get Intensity() {
		return this.data.intensity
	}
	set Intensity(v) {
		this.data.intensity = Math.max(0, v)
		this.animation.updateIntensity()
	}
	get TransmissionScale() {
		return this.data.transmissionScale
	}
	set TransmissionScale(v) {
		this.data.transmissionScale = Math.max(0, v)
	}
	get IntensityScale() {
		return this.animation.intensityScale
	}
	set IntensityScale(v) {
		this.animation.intensityScale = v
		this.animation.updateIntensity()
	}
	get Surface() {
		return this.data.szSurface
	}
	set Surface(v) {
		this.data.szSurface = v
	}
	get Image() {
		return this.data.szOffImage
	}
	set Image(v) {
		this.data.szOffImage = v
	}
	get DepthBias() {
		return this.data.depthBias
	}
	set DepthBias(v) {
		this.data.depthBias = v
	}
	get FadeSpeedUp() {
		return this.data.fadeSpeedUp
	}
	set FadeSpeedUp(v) {
		this.data.fadeSpeedUp = v
	}
	get FadeSpeedDown() {
		return this.data.fadeSpeedDown
	}
	set FadeSpeedDown(v) {
		this.data.fadeSpeedDown = v
	}
	get Bulb() {
		return this.data.bulbLight
	}
	set Bulb(v) {
		this.data.bulbLight = v
	}
	get ImageMode() {
		return this.data.imageMode
	}
	set ImageMode(v) {
		this.data.imageMode = v
	}
	get ShowBulbMesh() {
		return this.data.showBulbMesh
	}
	set ShowBulbMesh(v) {
		this.data.showBulbMesh = v
	}
	get StaticBulbMesh() {
		return this.data.staticBulbMesh
	}
	set StaticBulbMesh(v) {
		this.data.staticBulbMesh = v
	}
	get ShowReflectionOnBall() {
		return this.data.showReflectionOnBall
	}
	set ShowReflectionOnBall(v) {
		this.data.showReflectionOnBall = v
	}
	get ScaleBulbMesh() {
		return this.data.meshRadius
	}
	set ScaleBulbMesh(v) {
		this.data.meshRadius = v
	}
	get BulbModulateVsAdd() {
		return this.data.bulbModulateVsAdd
	}
	set BulbModulateVsAdd(v) {
		this.data.bulbModulateVsAdd = v
	}
	get BulbHaloHeight() {
		return this.data.bulbHaloHeight
	}
	set BulbHaloHeight(v) {
		this.data.bulbHaloHeight = v
	}
	get Visible() {
		return this.data.isVisible
	}
	set Visible(v) {
		this.data.isVisible = v
	}

	get Fader() {
		return this.data.fader
	}
	set Fader(v) {
		this.data.fader = v
	}

	public Duration(startState: number, duration: number, endState: number): void {
		this.animation.setDuration(startState, duration, endState, this.player.getPhysics().timeMsec)
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(LightApi.prototype)
	}
}

/** Light item. @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class Light extends Item<LightData> implements IRenderable<LightState>, IAnimatable, IScriptable<LightApi> {
	get color() {
		return this.data.color
	}
	get intensity() {
		return this.data.intensity
	}
	get falloff() {
		return this.data.falloff
	}
	get vCenter() {
		return this.data.center
	}
	get offImage() {
		return this.data.szOffImage
	}

	public declare readonly data: LightData
	private readonly state: LightState
	private readonly meshGenerator: LightMeshGenerator
	private readonly updater: LightUpdater
	private api?: LightApi
	private animation?: LightAnimation

	public static async fromStorage(storage: Storage, itemName: string): Promise<Light> {
		const data = await LightData.fromStorage(storage, itemName)
		return new Light(data)
	}

	public constructor(data: LightData) {
		super(data)
		const initialIntensity = (() => {
			const st = data.state
			if (st === 0) return 0
			if (st === 2) {
				const pat = data.rgBlinkPattern
				return pat && pat[0] === '1' ? data.intensity : 0
			}
			const clamped = Math.max(0, Math.min(1, st as number))
			return data.intensity * clamped
		})()
		this.state = LightState.claim(this.getName(), initialIntensity, data.color, data.color2)
		this.data = data
		this.meshGenerator = new LightMeshGenerator(data)
		this.updater = new LightUpdater(this.data, this.state)
	}

	public isVisible(_table: Table): boolean {
		return this.data.isVisible
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.animation = new LightAnimation(this.data, this.state)
		this.api = new LightApi(this.state, this.animation, this.data, this.events, player, table)
	}

	public getApi(): LightApi {
		return this.api!
	}

	public getAnimation(): IAnimation {
		return this.animation!
	}

	public getState(): LightState {
		return this.state!
	}

	public getUpdater(): LightUpdater {
		return this.updater
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer']
	}

	public getMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		table: Table,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): Meshes<GEOMETRY> {
		const light = this.meshGenerator.getMeshes(table, renderApi)
		if (light.surfaceLight) {
			return {
				surfaceLight: {
					isVisible: this.data.isVisible,
					geometry: light.surfaceLight,
					map: table.getTexture(this.data.szOffImage),
					material: this.getSurfaceMaterial(table),
					depthBias: this.data.depthBias ?? -1,
				},
			}
		}
		const meshes: Meshes<GEOMETRY> = {}
		if (light.light) {
			const lightMaterial = new Material()
			lightMaterial.name = `bulb.light:${this.getName()}`
			lightMaterial.baseColor = 0
			lightMaterial.wrapLighting = 0.5
			lightMaterial.isOpacityActive = true
			lightMaterial.opacity = 0.2
			lightMaterial.glossiness = 0xffffff
			lightMaterial.isMetal = false
			lightMaterial.edge = 1.0
			lightMaterial.edgeAlpha = 1.0
			lightMaterial.roughness = 0.9
			lightMaterial.glossyImageLerp = 1.0
			lightMaterial.thickness = 0.05
			lightMaterial.clearCoat = 0xffffff
			lightMaterial.emissiveColor = this.data.color
			lightMaterial.emissiveIntensity = this.data.isOn() ? 1 : 0.1
			meshes.light = {
				isVisible: this.data.isVisible,
				mesh: light.light.transform(Matrix3D.RIGHT_HANDED),
				material: lightMaterial,
			}
		}
		if (light.socket) {
			const socketMaterial = new Material()
			socketMaterial.baseColor = 0x181818
			socketMaterial.wrapLighting = 0.5
			socketMaterial.isOpacityActive = false
			socketMaterial.opacity = 1.0
			socketMaterial.glossiness = 0xb4b4b4
			socketMaterial.isMetal = false
			socketMaterial.edge = 1.0
			socketMaterial.edgeAlpha = 1.0
			socketMaterial.roughness = 0.9
			socketMaterial.glossyImageLerp = 1.0
			socketMaterial.thickness = 0.05
			socketMaterial.clearCoat = 0
			meshes.socket = {
				isVisible: this.data.isVisible,
				mesh: light.socket.transform(Matrix3D.RIGHT_HANDED),
				material: socketMaterial,
			}
		}
		return meshes
	}

	public getSurfaceMaterial(table: Table): Material {
		const material = new Material()
		material.name = `surface-${this.getName()}`
		material.emissiveMap = table.getTexture(this.data.szOffImage)
		material.emissiveIntensity = this.data.isOn() ? 1 : 0
		material.emissiveColor = this.data.color
		material.opacity = 1
		return material
	}

	public isBulbLight() {
		return this.data.isBulbLight()
	}

	public isSurfaceLight(table: Table) {
		return this.data.isSurfaceLight(table)
	}

	public isPlayfieldLight(table: Table) {
		return this.data.isPlayfieldLight(table)
	}
}
