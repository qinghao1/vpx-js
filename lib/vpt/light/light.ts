// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix.js'
import { Vertex2D } from '../../math/vector.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { type BiffFieldMap, handleBiffTag } from '../biff-helper.js'
import { DragPoint } from '../dragpoint.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import { Material } from '../material.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { Texture } from '../texture.js'
import { LightMeshGenerator, LightUpdater } from './light-view.js'

const FLOAT_MAP: BiffFieldMap<LightData, number> = {
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
}
const INT_MAP: BiffFieldMap<LightData, number> = { BINT: 'blinkInterval', SHDW: 'shadows', FADE: 'fader' }
const BOOL_MAP: BiffFieldMap<LightData, boolean> = {
	SHAP: 'roundLight',
	BGLS: 'isBackglass',
	BULT: 'bulbLight',
	IMMO: 'imageMode',
	SHBM: 'showBulbMesh',
	STBM: 'staticBulbMesh',
	SHRB: 'showReflectionOnBall',
	VSBL: 'isVisible',
}
const STRING_MAP: BiffFieldMap<LightData, string> = {
	IMG1: 'szOffImage',
	BPAT: 'rgBlinkPattern',
	SURF: 'szSurface',
	LINK: 'stateSrcLink',
}

/** Additive glow parameters for a bulb light polygon.
 *
 * Mirrors the native lightmap pass: any light with drag-point vertices renders
 * an additive glow polygon (`Light::RenderSetup` builds `m_lightmapMeshBuffer`
 * from `GetRgVertex`, `light.cpp` renders it with ONE/ONE blending driven by
 * the live intensity). This is the generic insert-glow mechanism, not a
 * per-table effect.
 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/light.cpp */
export interface BulbGlowParams {
	color: number
	color2: number
	centerX: number
	centerY: number
	falloff: number
	falloffPower: number
	intensity: number
	modulateVsAdd: number
}

/** Clamps light state according to VPinball rules (0..1, 2 for blinking, -1/255 -> 1). */
export function clampLightState(state: number): number {
	if (state < 0) return 1
	if (state === 2) return 2
	if (state > 1) return 1
	return state
}

/**
 * Bake-time intensity: base intensity × resolved state.
 *
 * Mirrors the bake in upstream `Light::RenderSetup`
 * (`m_currentIntensity = m_d.m_intensity * m_d.m_intensity_scale * state`,
 * `src/parts/light.cpp`): fractional states scale linearly and blinking
 * resolves on the first pattern frame. The transient intensity scale is 1
 * here (worker-side animation default, matching upstream `SetDefaults`),
 * so only the resolved state applies.
 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/light.cpp
 */
export function bakedIntensity(data: Pick<LightData, 'intensity' | 'state' | 'rgBlinkPattern'>): number {
	const clamped = clampLightState(data.state)
	const level =
		clamped === Enums.LightStatus.LightStateBlinking ? (data.rgBlinkPattern?.[0] === '1' ? 1 : 0) : clamped
	return data.intensity * level
}

/** @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class LightData extends ItemData {
	public center: Vertex2D = new Vertex2D()
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
	/** Optional controller state source (resuri) driving the in-play state. @see Light::m_stateSrcLink in src/parts/light.h */
	public stateSrcLink = ''
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
		const lightData = new LightData(itemName)
		await storage.streamFiltered(itemName, 4, LightData.createStreamHandler(lightData))
		return lightData
	}

	private static createStreamHandler(lightData: LightData) {
		lightData.dragPoints = []
		return BiffParser.stream(lightData.fromTag.bind(lightData), {
			nestedTags: {
				DPNT: {
					onStart: () => new DragPoint(),
					onTag: dp => dp.fromTag.bind(dp),
					onEnd: dp => lightData.dragPoints.push(dp),
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

	public hasBulbGlow(): boolean {
		// Glow needs a polygon: 3+ drag points (>2); 2 points is just a line with no area to shade.
		return this.bulbLight && this.dragPoints.length > 2
	}

	public isPlayfieldLight(table: Table): boolean {
		return this.isSurfaceLight() && !this.isOnSurface(table)
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
	public isSurfaceLight(): boolean {
		if (this.isBackglass) return false
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
		if (tag === 'STAT') {
			// Pre-10.8 tables only had 0 (off), 1 (on), 2 (blinking).
			this.state = clampLightState(this.getInt(buffer))
			return 0
		}
		if (tag === 'STTF') {
			this.state = clampLightState(this.getFloat(buffer))
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

/** @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class LightState extends ItemState {
	public intensity = 0
	public color: number = 0
	public colorFull: number = 0
	/** Live BulbModulateVsAdd; absent keeps the baked value. */
	public modulate?: number = undefined
	/** Engine base intensity (`LightData::m_intensity`); the WASM bridge feeds it. */
	public baseIntensity = 0
	/** Engine intensity scale (`LightData::m_intensity_scale`); the WASM bridge feeds it. */
	public intensityScale = 1
	/** Engine play state (`Light::m_inPlayState`); the WASM bridge feeds it. */
	public inPlayState = true

	public static claim(name: string, intensity: number, color: number, colorFull: number): LightState {
		const state = new LightState()
		state.name = name
		state.intensity = intensity
		state.color = color
		state.colorFull = colorFull
		return state
	}
}

/** Static render entry for a light mesh (WASM-side scene generation). */
export interface LightMeshEntry<GEOMETRY> {
	isVisible: boolean
	mesh?: Mesh
	geometry?: GEOMETRY
	map?: Texture
	material?: Material
	depthBias?: number
	bulbGlow?: BulbGlowParams
}

/** @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class Light extends Item<LightData> {
	declare public readonly data: LightData
	private readonly state: LightState
	private readonly meshGenerator: LightMeshGenerator
	private readonly updater: LightUpdater

	public static async fromStorage(storage: Storage, itemName: string): Promise<Light> {
		const data = await LightData.fromStorage(storage, itemName)
		return new Light(data)
	}

	public constructor(data: LightData) {
		super(data)
		this.state = LightState.claim(this.getName(), bakedIntensity(data), data.color, data.color2)
		this.data = data
		this.meshGenerator = new LightMeshGenerator(data)
		this.updater = new LightUpdater(this.state)
	}

	public isVisible(_table: Table): boolean {
		return this.data.isVisible
	}

	public getState(): LightState {
		return this.state!
	}

	public getUpdater(): LightUpdater {
		return this.updater
	}

	public getMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		table: Table,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): Record<string, LightMeshEntry<GEOMETRY>> {
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
		const meshes: Record<string, LightMeshEntry<GEOMETRY>> = {}
		// >2: glow quad needs a 3+ point polygon (see hasBulbGlow); fewer points fall back to a point light.
		if (this.data.bulbLight && this.data.dragPoints.length > 2) {
			const glowMaterial = new Material()
			glowMaterial.name = `bulb.glow:${this.getName()}`
			meshes.glow = {
				isVisible: this.data.isVisible,
				geometry: renderApi.createBulbGlowGeometry(this.data, table),
				material: glowMaterial,
				bulbGlow: {
					color: this.data.color,
					color2: this.data.color2,
					centerX: this.data.center ? this.data.center.x : 0,
					centerY: this.data.center ? this.data.center.y : 0,
					falloff: this.data.falloff,
					falloffPower: this.data.falloffPower,
					intensity: bakedIntensity(this.data),
					modulateVsAdd: this.data.bulbModulateVsAdd,
				},
			}
		}
		if (light.light) {
			// Only the fields the material factory reads; the remaining
			// classic slots (wrap/gloss/clearcoat/edge/lerp/thickness) have
			// no three.js consumer.
			const lightMaterial = new Material()
			lightMaterial.name = `bulb.light:${this.getName()}`
			lightMaterial.baseColor = 0
			lightMaterial.isOpacityActive = true
			lightMaterial.opacity = 0.2
			lightMaterial.isMetal = false
			lightMaterial.roughness = 0.9
			lightMaterial.emissiveColor = this.data.color
			lightMaterial.emissiveIntensity = this.data.isOn() ? 1 : 0.1
			meshes.light = {
				isVisible: this.data.isVisible,
				mesh: light.light.transform(Matrix3D.RIGHT_HANDED),
				material: lightMaterial,
			}
		}
		if (light.socket) {
			// Same as above: only factory-read fields are set.
			const socketMaterial = new Material()
			socketMaterial.baseColor = 0x181818
			socketMaterial.isOpacityActive = false
			socketMaterial.opacity = 1.0
			socketMaterial.isMetal = false
			socketMaterial.roughness = 0.9
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

	public hasBulbGlow() {
		return this.data.hasBulbGlow()
	}

	public isSurfaceLight() {
		return this.data.isSurfaceLight()
	}

	public isPlayfieldLight(table: Table) {
		return this.data.isPlayfieldLight(table)
	}
}
