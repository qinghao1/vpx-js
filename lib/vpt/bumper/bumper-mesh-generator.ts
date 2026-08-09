// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad, f4 } from '../../util/float.js'
import { Vertex3D } from '../../util/vector.js'
import { Matrix3D } from '../../util/matrix.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { BumperData } from './bumper-data.js'

const bumperBaseMesh = loadMesh('bumper-base-mesh')
const bumperCapMesh = loadMesh('bumper-cap-mesh')
const bumperRingMesh = loadMesh('bumper-ring-mesh')
const bumperSocketMesh = loadMesh('bumper-socket-mesh')

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
		const m = new Matrix3D().rotateZMatrix(degToRad(this.data.orientation))
		const height =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		const z = (v: number) => f4(v * table.getScaleZ()) + height
		return {
			base: this.transform(`bumper-base-${this.data.getName()}`, this.scaledBaseMesh, m, z),
			ring: this.transform(`bumper-ring-${this.data.getName()}`, this.scaledRingMesh, m, z),
			skirt: this.transform(`bumper-socket-${this.data.getName()}`, this.scaledSocketMesh, m, v => z(v) + 5),
			cap: this.transform(
				`bumper-cap-${this.data.getName()}`,
				this.scaledCapMesh,
				m,
				v => f4(f4(v + this.data.heightScale) * table.getScaleZ()) + height,
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

export interface BumperMesh {
	base: Mesh
	ring: Mesh
	skirt: Mesh
	cap: Mesh
}
