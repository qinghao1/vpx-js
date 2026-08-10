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

/** Converts renderables to Three.js groups/meshes. */
export class ThreeConverter {
	constructor(
		private readonly meshGenerator: ThreeMeshGenerator,
		readonly _mapGenerator: ThreeMapGenerator,
		private readonly materialGenerator: ThreeMaterialGenerator,
		private readonly meshConvertOpts: MeshConvertOptions,
	) {}

	public createObject(
		renderable: IRenderable<ItemState>,
		table: Table,
		renderApi: IRenderApi<Object3D, BufferGeometry, PointLight>,
		opts: TableGenerateOptions,
	): Group {
		const objects = renderable.getMeshes(table, renderApi, opts)
		const group = new Group()
		group.matrixAutoUpdate = false
		group.name = renderable.getName()
		group.visible = renderable.getState().isVisible
		for (const obj of Object.values<RenderInfo<BufferGeometry>>(objects)) {
			group.add(this.createMesh(obj))
		}
		return group
	}

	public createMesh(obj: RenderInfo<BufferGeometry>): ThreeMesh {
		if (!obj.geometry && !obj.mesh) throw new Error('Mesh export must either provide mesh or geometry.')
		const geometry = obj.geometry ?? this.meshGenerator.convertToBufferGeometry(obj.mesh!)
		const material = this.materialGenerator.getInitialMaterial(obj, this.meshConvertOpts)
		const mesh = new ThreeMesh(geometry, material)
		mesh.name = (obj.geometry ?? obj.mesh!)?.name
		mesh.matrixAutoUpdate = false
		mesh.visible = obj.isVisible
		if (obj.depthBias) {
			const scaled = obj.depthBias / 500
			const clamped = Math.max(-100, Math.min(100, scaled))
			mesh.renderOrder = Math.round(clamped)
		}
		return mesh
	}
}
