// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { type BufferGeometry, Group, type Object3D, type PointLight, Mesh as ThreeMesh } from 'three'
import type { ItemState } from '../../vpt/item-state.js'
import type { Table, TableGenerateOptions } from '../../vpt/table/table.js'
import type { IRenderApi, IRenderable, MeshConvertOptions, RenderInfo } from '../irender-api.js'
import { setAuthoredVisible } from './authored-visible.js'
import type { ThreeMeshGenerator } from './three-mesh-generator.js'
import type { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'

/**
 * Converts renderables to Three.js groups/meshes.
 *
 * Generated nodes set matrixAutoUpdate = false: updater code pushes matrices
 * explicitly via applyMatrixToNode, so three.js must not recompute (and
 * thereby clobber) them from position/quaternion/scale each frame.
 */
export class ThreeConverter {
	constructor(
		private readonly meshGenerator: ThreeMeshGenerator,
		private readonly materialGenerator: ThreeNodeMaterialGenerator,
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
		if (obj.bulbGlow) {
			mesh.renderOrder = 10
			// Snapshot of the authored visibility: the lamp updater toggles
			// this quad with the live state, but a light authored invisible
			// (cabinet/backbox) must stay hidden — see applyLightToTarget.
			// Other meshes stay unstamped (read as visible): stamping them
			// would make batch visibility ignore later script-driven shows
			// of initially-hidden meshes (slingshots, option overlays).
			setAuthoredVisible(mesh, obj.isVisible)
		} else if (obj.depthBias) {
			// depthBias is a transparent sort key: clamp it into the DMD-safe band.
			mesh.renderOrder = Math.round(Math.max(-10000, Math.min(15, -obj.depthBias)))
		}
		if (obj.depthWrite !== undefined) {
			;(mesh.material as any).depthWrite = obj.depthWrite
		}
		if (obj.material?.name === 'ball') {
			mesh.renderOrder = 1
		}
		return mesh
	}
}
