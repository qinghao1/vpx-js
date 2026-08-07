// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad, f4 } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import { Vertex3D } from '../../math/vertex3d.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { BumperData } from './bumper-data.js'

const bumperBaseMesh = loadMesh('bumper-base-mesh')
const bumperCapMesh = loadMesh('bumper-cap-mesh')
const bumperRingMesh = loadMesh('bumper-ring-mesh')
const bumperSocketMesh = loadMesh('bumper-socket-mesh')

/** Bumper mesh generator. */
export class BumperMeshGenerator {
	private readonly data: BumperData

	private readonly scaledBashMesh: Mesh
	private readonly scaledCapMesh: Mesh
	private readonly scaledRingMesh: Mesh
	private readonly scaledSocketMesh: Mesh

	constructor(data: BumperData) {
		this.data = data
		this.scaledBashMesh = bumperBaseMesh.clone().makeScale(this.data.radius, this.data.radius, this.data.heightScale)
		this.scaledCapMesh = bumperCapMesh
			.clone()
			.makeScale(this.data.radius * 2, this.data.radius * 2, this.data.heightScale)
		this.scaledRingMesh = bumperRingMesh.clone().makeScale(this.data.radius, this.data.radius, this.data.heightScale)
		this.scaledSocketMesh = bumperSocketMesh
			.clone()
			.makeScale(this.data.radius, this.data.radius, this.data.heightScale)
	}

	public getMeshes(table: Table): BumperMesh {
		/* istanbul ignore if */
		if (!this.data.center) throw new Error(`Cannot export bumper ${this.data.getName()} without vCenter.`)
		const matrix = new Matrix3D().rotateZMatrix(degToRad(this.data.orientation))
		const height =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		return {
			base: this.generateMesh(
				`bumper-base-${this.data.getName()}`,
				this.scaledBashMesh,
				matrix,
				(z) => f4(z * table.getScaleZ()) + height,
			),
			ring: this.generateMesh(
				`bumper-ring-${this.data.getName()}`,
				this.scaledRingMesh,
				matrix,
				(z) => f4(z * table.getScaleZ()) + height,
			),
			skirt: this.generateMesh(
				`bumper-socket-${this.data.getName()}`,
				this.scaledSocketMesh,
				matrix,
				(z) => f4(z * table.getScaleZ()) + (height + 5),
			),
			cap: this.generateMesh(
				`bumper-cap-${this.data.getName()}`,
				this.scaledCapMesh,
				matrix,
				(z) => f4(f4(z + this.data.heightScale) * table.getScaleZ()) + height,
			),
		}
	}

	private generateMesh(name: string, mesh: Mesh, matrix: Matrix3D, zPos: (z: number) => number): Mesh {
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
