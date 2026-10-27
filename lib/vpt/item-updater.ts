// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'
import { Matrix3D } from '../math/matrix.js'
import type { Vertex2D } from '../math/vector.js'
import type { IRenderApi } from '../render/irender-api.js'
import type { ItemState } from './item-state.js'
import type { Table } from './table/table.js'

/** Base for item updaters (applies state to render node). */
export abstract class ItemUpdater<STATE extends ItemState> {
	protected readonly state: STATE

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		_obj: NODE,
		_state: STATE,
		_renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		_table: Table,
	): void {
		// Items without visual state keep the default no-op.
	}

	constructor(state: STATE) {
		this.state = state
	}

	protected applyVisibility<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: STATE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	) {
		if (state.isVisible !== undefined) {
			renderApi.applyVisibility(state.isVisible, obj)
		}
	}

	protected applyMaterial<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		material: string | undefined,
		texture: string | undefined,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	) {
		if (material || texture) {
			renderApi.applyMaterial(obj, table.getMaterial(material), texture)
		}
	}

	protected applyXRotation<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		center: Vertex2D,
		posZ: number,
		rotationZ: number,
		angle: number,
		name: string,
	) {
		// Row-major v'=v*M: left-to-right T(-c)*Rz(-)*Rx*Rz(+)*T(+c). Static geometry is
		// Rz*Scale*Trans then mapped to Three via RIGHT_HANDED (1,1,-1) and transpose in
		// applyMatrixToNode. To cancel T*RH*T residual, updater uses opposite Z signs
		// (+posZ / -posZ) so callers pass positive world height generically.
		// @see https://github.com/vpinball/vpinball/blob/master/src/parts/spinner.cpp (Spinner::Render vertMatrix)
		// @see https://github.com/vpinball/vpinball/blob/master/src/parts/gate.cpp (Gate::Render fullMatrix)
		const matTransToOrigin = Matrix3D.claim().setTranslation(-center.x, -center.y, posZ)
		const matRotateToOrigin = Matrix3D.claim().rotateZMatrix(MathUtils.degToRad(-rotationZ))
		const matTransFromOrigin = Matrix3D.claim().setTranslation(center.x, center.y, -posZ)
		const matRotateFromOrigin = Matrix3D.claim().rotateZMatrix(MathUtils.degToRad(rotationZ))
		const matRotateX = Matrix3D.claim().rotateXMatrix(angle)

		const matrix = matTransToOrigin
			.clone()
			.multiply(matRotateToOrigin)
			.multiply(matRotateX)
			.multiply(matRotateFromOrigin)
			.multiply(matTransFromOrigin)

		const plateObj = renderApi.findInGroup(obj, name)
		if (plateObj === undefined) throw new Error(`Child "${name}" not found in group`)
		renderApi.applyMatrixToNode(matrix, plateObj)

		Matrix3D.release(
			matTransToOrigin,
			matRotateToOrigin,
			matTransFromOrigin,
			matRotateFromOrigin,
			matRotateX,
			matrix,
		)
	}
}
