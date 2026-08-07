// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { PlungerMeshGenerator } from './plunger-mesh-generator.js'
import type { PlungerState } from './plunger-state.js'

/** Plunger updater — rod & spring meshes. */
export class PlungerUpdater extends ItemUpdater<PlungerState> {
	constructor(
		state: PlungerState,
		private readonly meshGenerator: PlungerMeshGenerator,
	) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: PlungerState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const mesh = this.meshGenerator.generateMeshes(state.frame, table)
		const rod = renderApi.findInGroup(obj, 'rod')
		if (rod) renderApi.applyMeshToNode(mesh.rod!, rod)
		const spring = renderApi.findInGroup(obj, 'spring')
		if (spring) renderApi.applyMeshToNode(mesh.spring!, spring)
	}
}
