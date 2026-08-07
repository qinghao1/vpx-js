// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { HitTargetData } from './hit-target-data.js'
import type { HitTargetState } from './hit-target-state.js'

/** HitTargetUpdater. */
export class HitTargetUpdater extends ItemUpdater<HitTargetState> {
	private readonly data: HitTargetData

	constructor(data: HitTargetData, state: HitTargetState) {
		super(state)
		this.data = data
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: HitTargetState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		// update local state
		Object.assign(this.state, state)

		this.applyVisibility(obj, state, renderApi)
		this.applyMaterial(obj, state.material, state.texture, renderApi, table)

		// animation
		if (state.zOffset !== undefined || state.xRotation !== undefined) {
			this.applyAnimation(obj, state, renderApi)
		}
	}

	private applyAnimation<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: HitTargetState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		const matTransToOrigin = Matrix3D.claim().setTranslation(
			-this.data.position.x,
			-this.data.position.y,
			-this.data.position.z,
		)
		const matRotateToOrigin = Matrix3D.claim().rotateZMatrix(degToRad(-this.data.rotZ))
		const matTransFromOrigin = Matrix3D.claim().setTranslation(
			this.data.position.x,
			this.data.position.y,
			this.data.position.z,
		)
		const matRotateFromOrigin = Matrix3D.claim().rotateZMatrix(degToRad(this.data.rotZ))
		const matRotateX = Matrix3D.claim().rotateXMatrix(degToRad(state.xRotation))
		const matTranslateZ = Matrix3D.claim().setTranslation(0, 0, -state.zOffset)
		const matrix = matTransToOrigin
			.multiply(matRotateToOrigin)
			.multiply(matRotateX)
			.multiply(matTranslateZ)
			.multiply(matRotateFromOrigin)
			.multiply(matTransFromOrigin)

		renderApi.applyMatrixToNode(matrix, obj)
		Matrix3D.release(
			matTransToOrigin,
			matRotateToOrigin,
			matTransFromOrigin,
			matRotateFromOrigin,
			matRotateX,
			matTranslateZ,
		)
	}
}
