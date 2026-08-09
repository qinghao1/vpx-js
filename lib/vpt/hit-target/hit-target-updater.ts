// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'

import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/matrix.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { HitTargetData } from './hit-target-data.js'
import type { HitTargetState } from './hit-target-state.js'

/** Hit target updater — drop and rotation. */
export class HitTargetUpdater extends ItemUpdater<HitTargetState> {
	constructor(
		private readonly data: HitTargetData,
		state: HitTargetState,
	) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: HitTargetState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		Object.assign(this.state, state)
		this.applyVisibility(obj, state, renderApi)
		this.applyMaterial(obj, state.material, state.texture, renderApi, table)
		if (state.zOffset !== undefined || state.xRotation !== undefined) this.applyAnimation(obj, state, renderApi)
	}

	private applyAnimation<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: HitTargetState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		const p = this.data.position
		const toOrigin = Matrix3D.claim().setTranslation(-p.x, -p.y, -p.z)
		const rotToOrigin = Matrix3D.claim().rotateZMatrix(MathUtils.degToRad(-this.data.rotZ))
		const fromOrigin = Matrix3D.claim().setTranslation(p.x, p.y, p.z)
		const rotFromOrigin = Matrix3D.claim().rotateZMatrix(MathUtils.degToRad(this.data.rotZ))
		const rotX = Matrix3D.claim().rotateXMatrix(MathUtils.degToRad(state.xRotation))
		const transZ = Matrix3D.claim().setTranslation(0, 0, -state.zOffset)
		const m = toOrigin
			.clone()
			.multiply(rotToOrigin)
			.multiply(rotX)
			.multiply(transZ)
			.multiply(rotFromOrigin)
			.multiply(fromOrigin)
		renderApi.applyMatrixToNode(m, obj)
		Matrix3D.release(toOrigin, rotToOrigin, fromOrigin, rotFromOrigin, rotX, transZ, m)
	}
}
