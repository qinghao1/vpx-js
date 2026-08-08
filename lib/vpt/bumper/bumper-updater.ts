// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { degToRad } from '../../util/float.js'
import { Matrix3D } from '../../util/math.js'
import { ItemUpdater } from '../item-updater.js'
import type { Material } from '../material.js'
import type { Table } from '../table/table.js'
import type { BumperData } from './bumper-data.js'
import type { BumperState } from './bumper-state.js'

/** Bumper updater — ring, skirt and material. */
export class BumperUpdater extends ItemUpdater<BumperState> {
	constructor(
		state: BumperState,
		private readonly data: BumperData,
	) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: BumperState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		Object.assign(this.state, state)

		this.applyAnimationState(obj, state, renderApi, table)
		this.applyChildren(obj, state, renderApi, table)
	}

	private applyAnimationState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: BumperState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	) {
		if (state.ringOffset !== undefined) {
			this.applyRingState(obj, state, renderApi)
		}
		if (state.skirtRotX !== undefined || state.skirtRotY !== undefined) {
			this.applySkirtState(obj, state, renderApi, table)
		}
	}

	private applyRingState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: BumperState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	) {
		const ringObj = renderApi.findInGroup(obj, `bumper-ring-${this.state.getName()}`)
		if (ringObj) {
			const matrix = Matrix3D.claim().setTranslation(0, 0, -state.ringOffset)
			renderApi.applyMatrixToNode(matrix, ringObj)
			Matrix3D.release(matrix)
		}
	}

	private applySkirtState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		_state: BumperState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	) {
		const skirtObj = renderApi.findInGroup(obj, `bumper-socket-${this.state.getName()}`)
		if (skirtObj) {
			const height =
				table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
			const matToOrigin = Matrix3D.claim().setTranslation(-this.data.center.x, -this.data.center.y, height)
			const matFromOrigin = Matrix3D.claim().setTranslation(this.data.center.x, this.data.center.y, -height)
			const matRotX = Matrix3D.claim().rotateXMatrix(degToRad(this.state.skirtRotX))
			const matRotY = Matrix3D.claim().rotateYMatrix(degToRad(this.state.skirtRotY))

			const matrix = matFromOrigin.clone().multiply(matRotX).multiply(matRotY).multiply(matToOrigin)

			renderApi.applyMatrixToNode(matrix, skirtObj)
			Matrix3D.release(matToOrigin, matFromOrigin, matRotX, matRotY, matrix)
		}
	}

	private applyChildren<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: BumperState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		if (state.baseMaterial || state.isBaseVisible !== undefined) {
			const child = renderApi.findInGroup(obj, `bumper-base-${state.name}`)!
			this.applyChild(child, state.isBaseVisible, table.getMaterial(this.state.baseMaterial), renderApi)
		}
		if (state.capMaterial || state.isCapVisible !== undefined) {
			const child = renderApi.findInGroup(obj, `bumper-cap-${state.name}`)!
			this.applyChild(child, state.isCapVisible, table.getMaterial(this.state.capMaterial), renderApi)
		}
		if (state.ringMaterial || state.isRingVisible !== undefined) {
			const child = renderApi.findInGroup(obj, `bumper-ring-${state.name}`)!
			this.applyChild(child, state.isRingVisible, table.getMaterial(this.state.ringMaterial), renderApi)
		}
		if (state.skirtMaterial || state.isSkirtVisible !== undefined) {
			const child = renderApi.findInGroup(obj, `bumper-socket-${state.name}`)!
			this.applyChild(child, state.isSkirtVisible, table.getMaterial(this.state.skirtMaterial), renderApi)
		}
	}

	private applyChild<NODE, GEOMETRY, POINT_LIGHT>(
		child: NODE,
		isVisible: boolean | undefined,
		material: Material | undefined,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		if (isVisible !== undefined) {
			renderApi.applyVisibility(isVisible, child)
		}

		renderApi.applyMaterial(child, material)
	}
}
