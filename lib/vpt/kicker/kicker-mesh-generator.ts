// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad, f4 } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import { Vertex3D } from '../../math/vertex3d.js'
import { Enums } from '../enums.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { KickerData } from './kicker-data.js'

const kickerCupMesh = loadMesh('kicker-cup-mesh')
const kickerGottliebMesh = loadMesh('kicker-gottlieb-mesh')
const kickerHoleMesh = loadMesh('kicker-hole-mesh')
const kickerSimpleHoleMesh = loadMesh('kicker-simple-hole-mesh')
const kickerT1Mesh = loadMesh('kicker-t1-mesh')
const kickerWilliamsMesh = loadMesh('kicker-williams-mesh')

/** Kicke mesh generator. */
export class KickerMeshGenerator {
	private readonly data: KickerData

	constructor(data: KickerData) {
		this.data = data
	}

	public getMesh(table: Table): Mesh {
		const baseHeight =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		return this.generateMesh(table, baseHeight)
	}

	private generateMesh(table: Table, baseHeight: number): Mesh {
		let zOffset = 0.0
		let zRot = this.data.orientation
		switch (this.data.kickerType) {
			case Enums.KickerType.KickerCup:
				zOffset = f4(-0.18)
				break
			case Enums.KickerType.KickerWilliams:
				zRot = f4(this.data.orientation + 90.0)
				break
			case Enums.KickerType.KickerHole:
				zRot = 0.0
				break
			case Enums.KickerType.KickerHoleSimple:
			default:
				zRot = 0.0
				break
		}
		const fullMatrix = new Matrix3D()
		fullMatrix.rotateZMatrix(degToRad(zRot))

		const mesh = this.getBaseMesh()
		for (const vertex of mesh.vertices) {
			const vert = Vertex3D.claim(vertex.x, vertex.y, vertex.z + zOffset).multiplyMatrix(fullMatrix)
			vertex.x = f4(vert.x * this.data.radius) + this.data.center.x
			vertex.y = f4(vert.y * this.data.radius) + this.data.center.y
			vertex.z = f4(f4(vert.z * this.data.radius) * table.getScaleZ()) + baseHeight

			const normal = Vertex3D.claim(vertex.nx, vertex.ny, vertex.nz).multiplyMatrixNoTranslate(fullMatrix)
			vertex.nx = normal.x
			vertex.ny = normal.y
			vertex.nz = normal.z

			Vertex3D.release(vert, normal)
		}
		return mesh
	}

	private getBaseMesh(): Mesh {
		const name = `kicker-${this.data.getName()}`
		switch (this.data.kickerType) {
			case Enums.KickerType.KickerCup:
				return kickerCupMesh.clone(name)
			case Enums.KickerType.KickerWilliams:
				return kickerWilliamsMesh.clone(name)
			case Enums.KickerType.KickerGottlieb:
				return kickerGottliebMesh.clone(name)
			case Enums.KickerType.KickerCup2:
				return kickerT1Mesh.clone(name)
			case Enums.KickerType.KickerHole:
				return kickerHoleMesh.clone(name)
			case Enums.KickerType.KickerHoleSimple:
			default:
				return kickerSimpleHoleMesh.clone(name)
		}
	}
}
