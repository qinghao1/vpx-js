// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { MathUtils } from 'three'
import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex3D } from '../../util/vector.js'
import { ItemUpdater } from '../item-updater.js'
import type { Material } from '../material.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { BumperData } from './bumper-data.js'
import type { BumperState } from './bumper-state.js'

const bumperBaseMesh = loadMesh('bumper-base-mesh')
const bumperCapMesh = loadMesh('bumper-cap-mesh')
const bumperRingMesh = loadMesh('bumper-ring-mesh')
const bumperSocketMesh = loadMesh('bumper-socket-mesh')

export interface BumperMesh {
	base: Mesh
	ring: Mesh
	skirt: Mesh
	cap: Mesh
}

/** Generates bumper meshes. @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperMeshGenerator {
	private readonly scaledBaseMesh: Mesh
	private readonly scaledCapMesh: Mesh
	private readonly scaledRingMesh: Mesh
	private readonly scaledSocketMesh: Mesh

	constructor(private readonly data: BumperData) {
		const r = data.radius
		const h = data.heightScale
		this.scaledBaseMesh = bumperBaseMesh.clone().makeScale(r, r, h)
		this.scaledCapMesh = bumperCapMesh.clone().makeScale(r * 2, r * 2, h)
		this.scaledRingMesh = bumperRingMesh.clone().makeScale(r, r, h)
		this.scaledSocketMesh = bumperSocketMesh.clone().makeScale(r, r, h)
	}

	public getMeshes(table: Table): BumperMesh {
		if (!this.data.center) throw new Error(`Cannot export bumper ${this.data.getName()} without center.`)
		const m = new Matrix3D().rotateZMatrix(MathUtils.degToRad(this.data.orientation))
		const height =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		const z = (v: number) => v * table.getScaleZ() + height
		return {
			base: this.transform(`bumper-base-${this.data.getName()}`, this.scaledBaseMesh, m, z),
			ring: this.transform(`bumper-ring-${this.data.getName()}`, this.scaledRingMesh, m, z),
			skirt: this.transform(`bumper-socket-${this.data.getName()}`, this.scaledSocketMesh, m, v => z(v) + 5),
			cap: this.transform(
				`bumper-cap-${this.data.getName()}`,
				this.scaledCapMesh,
				m,
				v => (v + this.data.heightScale) * table.getScaleZ() + height,
			),
		}
	}

	private transform(name: string, mesh: Mesh, matrix: Matrix3D, zPos: (z: number) => number): Mesh {
		const out = mesh.clone(name)
		for (const v of out.vertices) {
			const vert = Vertex3D.claim(v.x, v.y, v.z).multiplyMatrix(matrix)
			v.x = vert.x + this.data.center.x
			v.y = vert.y + this.data.center.y
			v.z = zPos(vert.z)
			const n = Vertex3D.claim(v.nx, v.ny, v.nz).multiplyMatrixNoTranslate(matrix)
			v.nx = n.x
			v.ny = n.y
			v.nz = n.z
			Vertex3D.release(vert, n)
		}
		return out
	}
}

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
		state: BumperState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	) {
		const skirtObj = renderApi.findInGroup(obj, `bumper-socket-${this.state.getName()}`)
		if (skirtObj) {
			const height =
				table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
			const m1 = Matrix3D.claim().setTranslation(-this.data.center.x, -this.data.center.y, -height - 5)
			const mRotY = Matrix3D.claim().rotateYMatrix(state.skirtRotY)
			const mRotX = Matrix3D.claim().rotateXMatrix(state.skirtRotX)
			const m2 = Matrix3D.claim().setTranslation(this.data.center.x, this.data.center.y, height + 5)
			const matrix = Matrix3D.claim().multiplyMatrices(m1, mRotY).multiply(mRotX).multiply(m2)
			renderApi.applyMatrixToNode(matrix, skirtObj)
			Matrix3D.release(m1, mRotY, mRotX, m2, matrix)
		}
	}

	private applyChildren<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: BumperState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	) {
		if (state.isCapVisible !== undefined) {
			renderApi.applyVisibility(
				state.isCapVisible,
				renderApi.findInGroup(obj, `bumper-cap-${this.state.getName()}`),
			)
		}
		if (state.isBaseVisible !== undefined) {
			renderApi.applyVisibility(
				state.isBaseVisible,
				renderApi.findInGroup(obj, `bumper-base-${this.state.getName()}`),
			)
		}
		if (state.isRingVisible !== undefined) {
			renderApi.applyVisibility(
				state.isRingVisible,
				renderApi.findInGroup(obj, `bumper-ring-${this.state.getName()}`),
			)
		}
		if (state.isSkirtVisible !== undefined) {
			renderApi.applyVisibility(
				state.isSkirtVisible,
				renderApi.findInGroup(obj, `bumper-socket-${this.state.getName()}`),
			)
		}
		if (state.capMaterial !== undefined) {
			this.applyBumperMaterial(obj, 'cap', state.capMaterial, table, renderApi)
		}
		if (state.baseMaterial !== undefined) {
			this.applyBumperMaterial(obj, 'base', state.baseMaterial, table, renderApi)
		}
		if (state.ringMaterial !== undefined) {
			this.applyBumperMaterial(obj, 'ring', state.ringMaterial, table, renderApi)
		}
		if (state.skirtMaterial !== undefined) {
			this.applyBumperMaterial(obj, 'socket', state.skirtMaterial, table, renderApi)
		}
	}

	private applyBumperMaterial<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		name: string,
		materialName: string,
		table: Table,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	) {
		const node = renderApi.findInGroup(obj, `bumper-${name}-${this.state.getName()}`)
		if (!node) return
		const material = table.getMaterial(materialName)
		if (material) renderApi.applyMaterial(node, material)
	}
}
