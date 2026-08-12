// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'

import type { IRenderApi } from '../render/irender-api.js'
import { Matrix3D } from '../util/matrix.js'
import type { Vertex2D } from '../util/vector.js'
import type { ItemState } from './item-state.js'
import type { Table } from './table/table.js'

/** Base for item updaters (applies state to render node). */
export abstract class ItemUpdater<STATE extends ItemState> {
	protected readonly state: STATE

	public abstract applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: STATE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void

	constructor(state: STATE) {
		this.state = state
	}

	protected applyVisibility<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: STATE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	) {
		if (state.isVisible !== undefined) {
			renderApi.applyVisibility(this.state.isVisible, obj)
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
		const matTransToOrigin = Matrix3D.claim().setTranslation(-center.x, -center.y, -posZ)
		const matRotateToOrigin = Matrix3D.claim().rotateZMatrix(MathUtils.degToRad(-rotationZ))
		const matTransFromOrigin = Matrix3D.claim().setTranslation(center.x, center.y, posZ)
		const matRotateFromOrigin = Matrix3D.claim().rotateZMatrix(MathUtils.degToRad(rotationZ))
		const matRotateX = Matrix3D.claim().rotateXMatrix(angle)

		const matrix = matTransToOrigin
			.clone()
			.multiply(matRotateToOrigin)
			.multiply(matRotateX)
			.multiply(matRotateFromOrigin)
			.multiply(matTransFromOrigin)

		const plateObj = renderApi.findInGroup(obj, name)
		renderApi.applyMatrixToNode(matrix, plateObj!)

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
