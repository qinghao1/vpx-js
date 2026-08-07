// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderable, RenderInfo } from '../../game/irenderable.js'
import { type BufferGeometry, Group, type Object3D, type PointLight, Mesh as ThreeMesh } from '../../refs.node.js'
import type { ItemState } from '../../vpt/item-state.js'
import type { Table, TableGenerateOptions } from '../../vpt/table/table.js'
import type { IRenderApi, MeshConvertOptions } from '../irender-api.js'
import type { ThreeMapGenerator } from './three-map-generator.js'
import type { ThreeMaterialGenerator } from './three-material-generator.js'
import type { ThreeMeshGenerator } from './three-mesh-generator.js'
import { ThreeRenderApi } from './three-render-api.js'

/** Three.js converter helpers. */
export class ThreeConverter {
	private readonly meshGenerator: ThreeMeshGenerator
	private readonly mapGenerator: ThreeMapGenerator
	private readonly materialGenerator: ThreeMaterialGenerator
	private readonly meshConvertOpts: MeshConvertOptions

	constructor(
		meshGenerator: ThreeMeshGenerator,
		mapGenerator: ThreeMapGenerator,
		materialGenerator: ThreeMaterialGenerator,
		opts: MeshConvertOptions,
	) {
		this.meshGenerator = meshGenerator
		this.mapGenerator = mapGenerator
		this.materialGenerator = materialGenerator
		this.meshConvertOpts = opts
	}

	public createObject(
		renderable: IRenderable<ItemState>,
		table: Table,
		renderApi: IRenderApi<Object3D, BufferGeometry, PointLight>,
		opts: TableGenerateOptions,
	): Group {
		const objects = renderable.getMeshes(table, renderApi, opts)
		const itemGroup = new Group()
		itemGroup.matrixAutoUpdate = false
		itemGroup.name = renderable.getName()
		itemGroup.visible = renderable.getState().isVisible
		let obj: RenderInfo<BufferGeometry>
		for (obj of Object.values<RenderInfo<BufferGeometry>>(objects)) {
			const mesh = this.createMesh(obj)
			itemGroup.add(mesh)
		}
		return itemGroup
	}

	public createMesh(obj: RenderInfo<BufferGeometry>): ThreeMesh {
		/* istanbul ignore if */
		if (!obj.geometry && !obj.mesh) {
			throw new Error('Mesh export must either provide mesh or geometry.')
		}
		let geometry: BufferGeometry
		if (obj.geometry) {
			geometry = obj.geometry
		} else if (obj.mesh) {
			geometry = this.meshGenerator.convertToBufferGeometry(obj.mesh)

			/* istanbul ignore next: Should not happen. */
		} else {
			throw new Error('Either `geometry` or `mesh` must be defined!')
		}

		const material = this.materialGenerator.getInitialMaterial(obj, this.meshConvertOpts)
		const mesh = new ThreeMesh(geometry, material)
		mesh.name = (obj.geometry || obj.mesh!).name
		mesh.matrixAutoUpdate = false
		mesh.visible = obj.isVisible
		if (ThreeRenderApi.SHADOWS) {
			mesh.castShadow = true
			mesh.receiveShadow = true
		}
		return mesh
	}
}
