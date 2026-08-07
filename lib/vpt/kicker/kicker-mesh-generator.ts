// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad, f4 } from '../../util/float.js'
import { Matrix3D, Vertex3D } from '../../util/math.js'
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
		const m = new Matrix3D().rotateZMatrix(degToRad(zRot))
		const mesh = this.getBaseMesh()
		const r = this.data.radius
		const cx = this.data.center.x
		const cy = this.data.center.y
		const scaleZ = table.getScaleZ()
		for (const v of mesh.vertices) {
			const vert = Vertex3D.claim(v.x, v.y, v.z + zOffset).multiplyMatrix(m)
			v.x = f4(vert.x * r) + cx
			v.y = f4(vert.y * r) + cy
			v.z = f4(vert.z * r * scaleZ) + baseHeight
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
				return { zOffset: f4(-0.18), zRot: this.data.orientation }
			case Enums.KickerType.KickerWilliams:
				return { zOffset: 0, zRot: f4(this.data.orientation + 90) }
			case Enums.KickerType.KickerHole:
			case Enums.KickerType.KickerHoleSimple:
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
			case Enums.KickerType.KickerHoleSimple:
			default:
				return kickerSimpleHoleMesh.clone(n)
		}
	}
}
