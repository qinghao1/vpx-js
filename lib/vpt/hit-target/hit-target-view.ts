// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { MathUtils } from 'three'
import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex3D } from '../../util/vector.js'
import { Enums } from '../enums.js'
import { ItemUpdater } from '../item-updater.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { HitTargetData } from './hit-target-data.js'
import type { HitTargetState } from './hit-target-state.js'

const hitTargetT2Mesh = loadMesh('drop-target-t2-mesh')
const hitTargetT3Mesh = loadMesh('drop-target-t3-mesh')
const hitTargetT4Mesh = loadMesh('drop-target-t4-mesh')
const hitFatTargetRectangleMesh = loadMesh('hit-target-fat-rectangle-mesh')
const hitFatTargetSquareMesh = loadMesh('hit-target-fat-square-mesh')
const hitTargetRectangleMesh = loadMesh('hit-target-rectangle-mesh')
const hitTargetRoundMesh = loadMesh('hit-target-round-mesh')
const hitTargetT1SlimMesh = loadMesh('hit-target-t1-slim-mesh')
const hitTargetT2SlimMesh = loadMesh('hit-target-t2-slim-mesh')

/** Generates hit-target mesh. @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetMeshGenerator {
	constructor(private readonly data: HitTargetData) {}

	public getMesh(table: Table): Mesh {
		const drop = this.data.isDropTarget() && this.data.isDropped ? -(52 * table.getScaleZ()) : 0
		return this.generateMesh(table, drop)
	}

	public generateMesh(table: Table, dropOffset = 0): Mesh {
		const mesh = this.getBaseMesh()
		mesh.name = `hit.target-${this.data.getName()}`
		const m = new Matrix3D().rotateZMatrix(MathUtils.degToRad(this.data.rotZ))
		const sx = this.data.vSize.x,
			sy = this.data.vSize.y,
			sz = this.data.vSize.z
		const px = this.data.position.x,
			py = this.data.position.y,
			pz = this.data.position.z
		const scaleZ = table.getScaleZ(),
			tableH = table.getTableHeight()
		for (const v of mesh.vertices) {
			const vert = Vertex3D.claim(v.x * sx, v.y * sy, v.z * sz).multiplyMatrix(m)
			v.x = vert.x + px
			v.y = vert.y + py
			v.z = vert.z * scaleZ + pz + tableH + dropOffset
			const n = Vertex3D.claim(v.nx, v.ny, v.nz).multiplyMatrixNoTranslate(m)
			v.nx = n.x
			v.ny = n.y
			v.nz = n.z
			Vertex3D.release(vert, n)
		}
		return mesh
	}

	private getBaseMesh(): Mesh {
		switch (this.data.targetType) {
			case Enums.TargetType.DropTargetBeveled:
				return hitTargetT2Mesh.clone()
			case Enums.TargetType.DropTargetSimple:
				return hitTargetT3Mesh.clone()
			case Enums.TargetType.DropTargetFlatSimple:
				return hitTargetT4Mesh.clone()
			case Enums.TargetType.HitTargetRound:
				return hitTargetRoundMesh.clone()
			case Enums.TargetType.HitTargetRectangle:
				return hitTargetRectangleMesh.clone()
			case Enums.TargetType.HitFatTargetRectangle:
				return hitFatTargetRectangleMesh.clone()
			case Enums.TargetType.HitFatTargetSquare:
				return hitFatTargetSquareMesh.clone()
			case Enums.TargetType.HitTargetSlim:
				return hitTargetT1SlimMesh.clone()
			case Enums.TargetType.HitFatTargetSlim:
				return hitTargetT2SlimMesh.clone()
			default:
				return hitTargetT3Mesh.clone()
		}
	}
}

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
