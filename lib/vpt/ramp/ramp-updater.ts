// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { RenderInfo } from '../../game/irenderable.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/math.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { RampMeshGenerator } from './ramp-mesh-generator.js'
import type { RampState } from './ramp-state.js'

/** Ramp updater — visibility, material and wire/floor meshes. */
export class RampUpdater extends ItemUpdater<RampState> {
	constructor(
		state: RampState,
		private readonly meshGenerator: RampMeshGenerator,
	) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: RampState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		Object.assign(this.state, state)
		this.applyVisibility(obj, state, renderApi)
		this.applyMaterial(obj, state.material, state.texture, renderApi, table)
		if (this.mustUpdateGeometry(state)) {
			if (state.type === undefined) this.updateMeshes(obj, renderApi, table)
			else this.replaceMeshes(obj, renderApi, table)
		}
	}

	private updateMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const r = this.meshGenerator.generateMeshes(table)
		for (const k of ['wire1', 'wire2', 'wire3', 'wire4', 'floor', 'left', 'right'] as const) {
			const mesh = r[k]
			if (!mesh) continue
			const node = renderApi.findInGroup(obj, `ramp.${k}-${this.state.getName()}`)
			renderApi.applyMeshToNode(mesh.transform(Matrix3D.RIGHT_HANDED), node)
		}
	}

	private replaceMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		group: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const mat = table.getMaterial(this.state.material)
		const meshes = this.meshGenerator.getMeshes<GEOMETRY>(!mat || mat.isOpacityActive, table)
		renderApi.removeChildren(group)
		for (const info of Object.values<RenderInfo<GEOMETRY>>(meshes)) {
			renderApi.addChildToParent(group, renderApi.createMesh(info))
		}
	}

	private mustUpdateGeometry(s: RampState): boolean {
		return (
			s.type !== undefined ||
			s.leftWallHeightVisible !== undefined ||
			s.rightWallHeightVisible !== undefined ||
			s.heightBottom !== undefined ||
			s.heightTop !== undefined ||
			s.widthTop !== undefined ||
			s.widthBottom !== undefined ||
			s.leftWallHeight !== undefined ||
			s.rightWallHeight !== undefined ||
			s.textureAlignment !== undefined
		)
	}
}
