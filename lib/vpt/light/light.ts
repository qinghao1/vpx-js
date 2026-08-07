// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IAnimatable, IAnimation } from '../../game/ianimatable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix3d.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { Material } from '../material.js'
import type { Table } from '../table/table.js'
import { LightAnimation } from './light-animation.js'
import { LightApi } from './light-api.js'
import { LightData } from './light-data.js'
import { LightMeshGenerator } from './light-mesh-generator.js'
import { LightState } from './light-state.js'
import { LightUpdater } from './light-updater.js'

/** Light item. @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class Light extends Item<LightData> implements IRenderable<LightState>, IAnimatable, IScriptable<LightApi> {
	// public getters
	/** Get color. */
	get color() {
		return this.data.color
	}
	/** Get intensity. */
	get intensity() {
		return this.data.intensity
	}
	/** Get falloff. */
	get falloff() {
		return this.data.falloff
	}
	/** Get vCenter. */
	get vCenter() {
		return this.data.center
	}
	/** Get offImage. */
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

	private constructor(data: LightData) {
		super(data)
		this.state = LightState.claim(this.getName(), 0, data.color, data.color2)
		this.data = data
		this.meshGenerator = new LightMeshGenerator(data)
		this.updater = new LightUpdater(this.data, this.state)
	}

	public isVisible(table: Table): boolean {
		return this.data.isVisible // we filter by bulb/playfield light
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
		material.emissiveIntensity = 0
		material.emissiveColor = 0x0
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
