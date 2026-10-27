// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import {
	type BufferGeometry,
	Group,
	Matrix4,
	type MeshStandardMaterial,
	type Object3D,
	type PointLight,
	type Mesh as ThreeMesh,
} from 'three'
import type { IRenderable, RenderInfo } from '../../game/interfaces.js'
import type { Matrix3D } from '../../math/matrix.js'
import { type AnimationGate, animationGate } from '../../util/animation-gate.js'
import { progress } from '../../util/logger.js'
import type { ItemState } from '../../vpt/item-state.js'
import type { LightData, LightState } from '../../vpt/light/light.js'
import type { Material } from '../../vpt/material.js'
import type { Mesh } from '../../vpt/mesh.js'
import type { Table, TableGenerateOptions } from '../../vpt/table/table.js'
import type { Texture } from '../../vpt/texture.js'
import type { IRenderApi, MeshConvertOptions } from '../irender-api.js'
import type { IMaterialGenerator } from './imaterial-generator.js'
import { cloneMaterialForWrite } from './material-shared.js'
import { installBvh } from './three-bvh.js'
import { ThreeConverter } from './three-converter.js'
import { ThreeLightGenerator } from './three-light-generator.js'
import { ThreeLightMeshGenerator } from './three-light-mesh-generator.js'
import { ThreeMapGenerator } from './three-map-generator.js'
import { releaseGeometry, ThreeMeshGenerator } from './three-mesh-generator.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'
import { ThreePlayfieldMeshGenerator } from './three-playfield-mesh-generator.js'

/** Three.js render backend (retained scene-graph; upstream is immediate-mode).
 * @see https://github.com/vpinball/vpinball/blob/master/src/renderer/RenderDevice.cpp */
export class ThreeRenderApi implements IRenderApi<Object3D, BufferGeometry, PointLight> {
	/** VPX table units → world units, applied once at the scene root (see transformScene). */
	public static readonly SCALE = 0.05
	private static readonly _scratchM4 = new Matrix4()

	private readonly converter: ThreeConverter
	private readonly meshConvertOpts: MeshConvertOptions
	private readonly playfieldGenerator = new ThreePlayfieldMeshGenerator()
	private readonly lightMeshGenerator = new ThreeLightMeshGenerator()
	private readonly meshGenerator = new ThreeMeshGenerator()
	private readonly mapGenerator: ThreeMapGenerator
	private readonly nodeMaterialGenerator: ThreeNodeMaterialGenerator
	private readonly lightGenerator = new ThreeLightGenerator()

	constructor(opts?: MeshConvertOptions, gate: AnimationGate = animationGate) {
		installBvh()
		this.meshConvertOpts = opts ?? { applyMaterials: false }
		this.mapGenerator = new ThreeMapGenerator(this.meshConvertOpts.applyTextures, gate)
		this.nodeMaterialGenerator = new ThreeNodeMaterialGenerator(this.mapGenerator)
		this.converter = new ThreeConverter(this.meshGenerator, this.nodeMaterialGenerator, this.meshConvertOpts)
	}

	public async preloadTextures(
		textures: Texture[],
		table: Table,
		onTexture?: (tex: Texture, ok: boolean) => void,
	): Promise<void> {
		progress().show('Pre-loading textures')
		await this.mapGenerator.loadTextures(textures, table, onTexture)
	}

	public getMapGenerator(): ThreeMapGenerator {
		return this.mapGenerator
	}

	public getMaterialGenerator(): IMaterialGenerator {
		return this.nodeMaterialGenerator
	}

	public getNodeMaterialGenerator(): ThreeNodeMaterialGenerator {
		return this.nodeMaterialGenerator
	}

	// Lays the table flat (rotateX 90°: table +Y becomes world depth), centers it
	// about the origin, and scales VPX units to world units — all once, here,
	// so every generated mesh can keep raw table-unit vertices.
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

	public createPointLight(lightData: LightData, table?: Table): PointLight {
		return this.lightGenerator.createPointLight(lightData, table)
	}

	public addChildToParent(group: Group, obj: Object3D | Group): void {
		group.add(obj)
	}

	public findInGroup(group: Group, name: string): Object3D | undefined {
		return group.children.find(c => c.name === name)
	}

	public removeFromParent(group: Group, obj: Object3D | Group): void {
		if (!obj) return
		group.remove(obj)
	}

	public removeChildren(node: Object3D | undefined): void {
		if (!node?.children) return
		node.remove(...node.children)
	}

	private forEachBatched(
		obj: Object3D,
		apply: (
			target: any,
			info: { batched: any; instanceId: number; isInstanced?: boolean; matrix?: Matrix4 },
		) => void,
	): void {
		const traverse = (current: any): void => {
			const info = current.userData?.__batched
			if (info?.batched && typeof info.instanceId === 'number') apply(current, info)
			if (current.children) for (const child of current.children) traverse(child)
		}
		traverse(obj)
	}

	private hideBatchedInstance(info: {
		batched: any
		instanceId: number
		isInstanced?: boolean
		matrix?: Matrix4
	}): void {
		try {
			if (info.isInstanced) {
				info.batched.setMatrixAt(info.instanceId, new Matrix4().makeScale(0, 0, 0))
				info.batched.instanceMatrix.needsUpdate = true
			} else {
				info.batched.setVisibleAt?.(info.instanceId, false)
			}
		} catch {}
	}

	private unbatch(obj: Object3D): void {
		if (!obj) return
		this.forEachBatched(obj, (current, info) => {
			this.hideBatchedInstance(info)
			current.visible = true
			let anc: any = current.parent
			while (anc && anc !== obj.parent) {
				if (!anc.visible) anc.visible = true
				if (anc === obj) break
				anc = anc.parent
			}
			delete current.userData.__batched
		})
	}

	private syncBatchedVisibility(obj: Object3D, isVisible: boolean): void {
		if (!obj) return
		this.forEachBatched(obj, (current, info) => {
			if (info.isInstanced) {
				if (!isVisible) {
					this.hideBatchedInstance(info)
					return
				}
				// InstancedMesh has no per-instance visibility flag: hide zero-scales
				// the slot, so show must restore the pre-batch matrix saved at batch
				// time. Without a saved matrix, unbatch the mesh so it can never
				// disappear (hidden instance + hidden original).
				try {
					if (info.matrix) {
						info.batched.setMatrixAt(info.instanceId, info.matrix)
						info.batched.instanceMatrix.needsUpdate = true
					} else {
						this.hideBatchedInstance(info)
						current.visible = true
						delete current.userData.__batched
					}
				} catch {}
				return
			}
			try {
				info.batched.setVisibleAt?.(info.instanceId, !!isVisible)
			} catch {}
		})
	}

	public applyMatrixToNode(matrix: Matrix3D, obj: Object3D): void {
		if (!obj) return
		this.unbatch(obj)
		// VPX Matrix3D is row-major (v·M) while THREE.Matrix4.set takes
		// row-major args into column-major storage, so the element shuffle
		// below is the transpose mapping VPX rows onto three.js columns.
		const e = matrix.elements
		ThreeRenderApi._scratchM4.set(
			e[0],
			e[4],
			e[8],
			e[12],
			e[1],
			e[5],
			e[9],
			e[13],
			e[2],
			e[6],
			e[10],
			e[14],
			e[3],
			e[7],
			e[11],
			e[15],
		)
		obj.matrix.copy(ThreeRenderApi._scratchM4)
		obj.matrix.decompose(obj.position, obj.quaternion, obj.scale)
		obj.updateMatrix()
		obj.updateMatrixWorld(true)
	}

	public applyVisibility(isVisible: boolean | number, obj: Object3D): void {
		if (!obj) return
		const visible = !!isVisible
		this.syncBatchedVisibility(obj, visible)
		// A batched original stays hidden while its batch slot carries the pixels:
		// unhiding it on the show path would double-render (original + instance
		// with identical transforms, z-fighting at 2x cost).
		// A child stamped __authoredVisible: false (e.g. a cabinet/backbox bulb
		// glow quad, see ThreeConverter.createMesh) must survive the show path:
		// the lamp updater gates it on authored visibility, so a blanket show
		// here would unhide what the author hid.
		// The flags run to every depth, not just the direct children: nested
		// item groups (light groups, ramp assemblies) keep meshes below the
		// first level, and a shallow show/hide left those flags stale — the
		// subtree then renders (or stays dark) against the author's intent
		// once an ancestor toggles.
		const authoredVisible = (o: Object3D) =>
			(o as { userData?: { __authoredVisible?: boolean } }).userData?.__authoredVisible ?? true
		const batched = (o: Object3D) => (o as { userData?: { __batched?: unknown } }).userData?.__batched
		const apply = (node: Object3D): void => {
			node.visible = visible && authoredVisible(node) && !batched(node)
			for (const child of node.children ?? []) apply(child)
		}
		apply(obj)
	}

	public applyMeshToNode(mesh: Mesh, obj: Object3D): void {
		if (!obj) return
		this.unbatch(obj)
		const destGeo = (obj as ThreeMesh).geometry as BufferGeometry
		const srcGeo = this.meshGenerator.convertToBufferGeometry(mesh)
		if (srcGeo.attributes.position.array.length !== destGeo.attributes.position.array.length)
			throw new Error(
				`Trying to apply geometry of ${srcGeo.attributes.position.array.length} positions to ${destGeo.attributes.position.array.length} positions.`,
			)
		const destPos = destGeo.attributes.position
		const srcPos = srcGeo.attributes.position
		if (destPos && srcPos) {
			;(destPos.array as Float32Array).set(srcPos.array as Float32Array)
			destPos.needsUpdate = true
		}
		const destNorm = destGeo.attributes.normal as unknown as
			| { array: Float32Array; needsUpdate: boolean }
			| undefined
		const srcNorm = srcGeo.attributes.normal as unknown as { array: Float32Array } | undefined
		if (destNorm && srcNorm && destNorm.array.length === srcNorm.array.length) {
			destNorm.array.set(srcNorm.array)
			destNorm.needsUpdate = true
		} else if (srcNorm && !destNorm) {
			destGeo.setAttribute('normal', srcGeo.attributes.normal.clone())
		} else if (destNorm && srcNorm) {
			destGeo.computeVertexNormals()
		}
		destGeo.computeBoundingBox()
		destGeo.computeBoundingSphere()
		const bvhGeo = destGeo as unknown as {
			boundsTree?: unknown
			disposeBoundsTree?: () => void
			computeBoundsTree?: (o: unknown) => void
		}
		if (bvhGeo.boundsTree) {
			bvhGeo.disposeBoundsTree?.()
			bvhGeo.boundsTree = undefined
			bvhGeo.computeBoundsTree?.({})
		}
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
		this.unbatch(obj)
		const targets = obj.children?.length ? (obj.children as Object3D[]) : [obj]
		for (const child of targets) {
			const mat = (child as ThreeMesh).material as MeshStandardMaterial
			const gen = this.nodeMaterialGenerator
			if (material) gen.applyMaterial(mat, material)
			gen.applyMap(mat, map)
			gen.applyNormalMap(mat, normalMap)
			gen.applyEnvMap(mat, envMap)
			gen.applyEmissiveMap(mat, material, emissiveMap)
		}
	}

	public cloneMaterialForWrite<MATERIAL>(mat: MATERIAL): MATERIAL {
		return cloneMaterialForWrite(mat)
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
	public createBulbGlowGeometry(lightData: LightData, table: Table): BufferGeometry {
		return this.lightMeshGenerator.createBulbGlowGeometry(lightData, table)
	}
	public createPlayfieldGeometry(table: Table, opts: TableGenerateOptions): BufferGeometry {
		return this.playfieldGenerator.createPlayfieldGeometry(table, opts)
	}
}
