// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderable, RenderInfo } from '../../game/irenderable.js'
import type { Matrix3D } from '../../math/matrix3d.js'
import {
	BufferGeometry,
	Group,
	Matrix4,
	type MeshStandardMaterial,
	type Object3D,
	type PointLight,
} from '../../refs.node.js'
import { progress } from '../../util/logger.js'
import { Pool } from '../../util/object-pool.js'
import type { ItemState } from '../../vpt/item-state.js'
import type { LightData } from '../../vpt/light/light-data.js'
import type { LightState } from '../../vpt/light/light-state.js'
import type { Material } from '../../vpt/material.js'
import type { Mesh } from '../../vpt/mesh.js'
import type { Table, TableGenerateOptions } from '../../vpt/table/table.js'
import type { Texture } from '../../vpt/texture.js'
import type { IRenderApi, MeshConvertOptions } from '../irender-api.js'
import { ThreeConverter } from './three-converter.js'
import { ThreeLightGenerator } from './three-light-generator.js'
import { ThreeLightMeshGenerator } from './three-light-mesh-generator.js'
import { ThreeMapGenerator } from './three-map-generator.js'
import { ThreeMaterialGenerator } from './three-material-generator.js'
import { releaseGeometry, ThreeMeshGenerator } from './three-mesh-generator.js'
import { ThreePlayfieldMeshGenerator } from './three-playfield-mesh-generator.js'

/** Three.js render backend.
 * @see https://github.com/vpinball/vpinball/blob/master/RenderDevice.cpp */
export class ThreeRenderApi implements IRenderApi<Object3D, BufferGeometry, PointLight> {
	public static readonly SCALE = 0.05
	public static readonly SHADOWS = true
	public static POOL = { Matrix4: new Pool(Matrix4), BufferGeometry: new Pool(BufferGeometry) }

	private readonly converter: ThreeConverter
	private readonly meshConvertOpts: MeshConvertOptions
	private readonly playfieldGenerator = new ThreePlayfieldMeshGenerator()
	private readonly lightMeshGenerator = new ThreeLightMeshGenerator()
	private readonly meshGenerator = new ThreeMeshGenerator()
	private readonly mapGenerator: ThreeMapGenerator
	private readonly materialGenerator: ThreeMaterialGenerator
	private readonly lightGenerator = new ThreeLightGenerator()

	constructor(opts?: MeshConvertOptions) {
		this.meshConvertOpts = opts ?? { applyMaterials: false, optimizeTextures: false }
		this.mapGenerator = new ThreeMapGenerator(this.meshConvertOpts.applyTextures)
		this.materialGenerator = new ThreeMaterialGenerator(this.mapGenerator)
		this.converter = new ThreeConverter(
			this.meshGenerator,
			this.mapGenerator,
			this.materialGenerator,
			this.meshConvertOpts,
		)
	}

	public async preloadTextures(textures: Texture[], table: Table): Promise<void> {
		progress().show('Pre-loading textures')
		await this.mapGenerator.loadTextures(textures, table)
	}

	public getMapGenerator(): ThreeMapGenerator {
		return this.mapGenerator
	}

	public transformScene(scene: Group, table: Table): void {
		const dim = table.getDimensions()
		scene.rotateX(Math.PI / 2)
		scene.translateY((-dim.height * ThreeRenderApi.SCALE) / 2)
		scene.translateX((-dim.width * ThreeRenderApi.SCALE) / 2)
		scene.scale.set(ThreeRenderApi.SCALE, ThreeRenderApi.SCALE, ThreeRenderApi.SCALE)
	}

	public createParentNode(name: string): Group {
		const g = new Group()
		g.name = name
		return g
	}

	public createPointLight(lightData: LightData): PointLight {
		return this.lightGenerator.createPointLight(lightData)
	}

	public addChildToParent(group: Group, obj: Object3D | Group): void {
		group.add(obj)
	}

	public findInGroup(group: Group, name: string): Object3D | undefined {
		return group.children.find((c) => c.name === name)
	}

	public removeFromParent(group: Group, obj: Object3D | Group): void {
		if (!obj) return
		group.remove(obj)
	}

	public removeChildren(node: Object3D | undefined): void {
		if (!node?.children) return
		node.remove(...node.children)
	}

	public applyMatrixToNode(matrix: Matrix3D, obj: Object3D): void {
		if (!obj) return
		const m4 = ThreeRenderApi.POOL.Matrix4.get()
		m4.set(
			matrix._11,
			matrix._21,
			matrix._31,
			matrix._41,
			matrix._12,
			matrix._22,
			matrix._32,
			matrix._42,
			matrix._13,
			matrix._23,
			matrix._33,
			matrix._43,
			matrix._14,
			matrix._24,
			matrix._34,
			matrix._44,
		)
		obj.matrix.copy(m4)
		obj.matrix.decompose(obj.position, obj.quaternion, obj.scale)
		obj.updateMatrix()
		obj.updateMatrixWorld(true)
		ThreeRenderApi.POOL.Matrix4.release(m4)
	}

	public applyVisibility(isVisible: boolean | number, obj: Object3D): void {
		if (!obj) return
		obj.visible = !!isVisible
		for (const child of obj.children ?? []) child.visible = !!isVisible
	}

	public applyMeshToNode(mesh: Mesh, obj: Object3D): void {
		if (!obj) return
		const destGeo = (obj as any).geometry
		const srcGeo = this.meshGenerator.convertToBufferGeometry(mesh)
		if (srcGeo.attributes.position.array.length !== destGeo.attributes.position.array.length)
			throw new Error(
				`Trying to apply geometry of ${srcGeo.attributes.position.array.length} positions to ${destGeo.attributes.position.array.length} positions.`,
			)
		for (let i = 0; i < destGeo.attributes.position.array.length; i++)
			destGeo.attributes.position.array[i] = srcGeo.attributes.position.array[i]
		destGeo.attributes.position.needsUpdate = true
		releaseGeometry(srcGeo)
	}

	public applyLighting(state: LightState, initialIntensity: number, obj: Object3D | undefined): void {
		this.lightGenerator.applyLighting(state, initialIntensity, obj)
	}

	public applyMaterial(
		obj?: Object3D,
		material?: Material,
		map?: string,
		normalMap?: string,
		envMap?: string,
		emissiveMap?: string,
	): void {
		if (!obj) return
		const targets = obj.children?.length ? (obj.children as Object3D[]) : [obj]
		for (const child of targets) {
			const mat = (child as any).material as MeshStandardMaterial
			this.materialGenerator.applyMaterial(mat, material)
			this.materialGenerator.applyMap(mat, map)
			this.materialGenerator.applyNormalMap(mat, normalMap)
			this.materialGenerator.applyEnvMap(mat, envMap)
			this.materialGenerator.applyEmissiveMap(mat, material, emissiveMap)
		}
	}

	public createObjectFromRenderable(
		renderable: IRenderable<ItemState>,
		table: Table,
		opts: TableGenerateOptions,
	): Group {
		return this.converter.createObject(renderable, table, this, opts)
	}
	public createMesh(obj: RenderInfo<BufferGeometry>): Object3D {
		return this.converter.createMesh(obj)
	}
	public createLightGeometry(lightData: LightData, table: Table): BufferGeometry {
		return this.lightMeshGenerator.createLight(lightData, table)
	}
	public createPlayfieldGeometry(table: Table, opts: TableGenerateOptions): BufferGeometry {
		return this.playfieldGenerator.createPlayfieldGeometry(table, opts)
	}
}
