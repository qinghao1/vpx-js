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
import type { KickerData } from './kicker-data.js'
import type { KickerState } from './kicker-state.js'

const kickerCupMesh = loadMesh('kicker-cup-mesh')
const kickerGottliebMesh = loadMesh('kicker-gottlieb-mesh')
const kickerHoleMesh = loadMesh('kicker-hole-mesh')
const kickerSimpleHoleMesh = loadMesh('kicker-simple-hole-mesh')
const kickerT1Mesh = loadMesh('kicker-t1-mesh')
const kickerWilliamsMesh = loadMesh('kicker-williams-mesh')

/** Generates kicker mesh. @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
export class KickerMeshGenerator {
	constructor(private readonly data: KickerData) {}

	public getMesh(table: Table): Mesh {
		const baseHeight =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		return this.generateMesh(table, baseHeight)
	}

	private generateMesh(table: Table, baseHeight: number): Mesh {
		const { zOffset, zRot } = this.getOffsets()
		const m = new Matrix3D().rotateZMatrix(MathUtils.degToRad(zRot))
		const mesh = this.getBaseMesh()
		const r = this.data.radius
		const cx = this.data.center.x
		const cy = this.data.center.y
		const scaleZ = table.getScaleZ()
		for (const v of mesh.vertices) {
			const vert = Vertex3D.claim(v.x, v.y, v.z + zOffset).multiplyMatrix(m)
			v.x = vert.x * r + cx
			v.y = vert.y * r + cy
			v.z = vert.z * r * scaleZ + baseHeight
			const n = Vertex3D.claim(v.nx, v.ny, v.nz).multiplyMatrixNoTranslate(m)
			v.nx = n.x
			v.ny = n.y
			v.nz = n.z
			Vertex3D.release(vert, n)
		}
		return mesh
	}

	private getOffsets(): { zOffset: number; zRot: number } {
		switch (this.data.kickerType) {
			case Enums.KickerType.KickerCup:
				return { zOffset: -0.18, zRot: this.data.orientation }
			case Enums.KickerType.KickerWilliams:
				return { zOffset: 0, zRot: this.data.orientation + 90 }
			default:
				return { zOffset: 0, zRot: 0 }
		}
	}

	private getBaseMesh(): Mesh {
		const n = `kicker-${this.data.getName()}`
		switch (this.data.kickerType) {
			case Enums.KickerType.KickerCup:
				return kickerCupMesh.clone(n)
			case Enums.KickerType.KickerWilliams:
				return kickerWilliamsMesh.clone(n)
			case Enums.KickerType.KickerGottlieb:
				return kickerGottliebMesh.clone(n)
			case Enums.KickerType.KickerCup2:
				return kickerT1Mesh.clone(n)
			case Enums.KickerType.KickerHole:
				return kickerHoleMesh.clone(n)
			default:
				return kickerSimpleHoleMesh.clone(n)
		}
	}
}

/** Kicker updater — visibility and material. */
export class KickerUpdater extends ItemUpdater<KickerState> {
	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: KickerState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		Object.assign(this.state, state)
		if (state.type !== undefined) renderApi.applyVisibility(this.state.isVisible, obj)
		this.applyMaterial(obj, state.material, undefined, renderApi, table)
	}
}
