// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad, f4 } from '../../util/float.js'
import { Matrix3D, Vertex3D } from '../../util/math.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { SpinnerData } from './spinner-data.js'

const spinnerBracketMesh = loadMesh('spinner-bracket-mesh')
const spinnerPlateMesh = loadMesh('spinner-plate-mesh')

/** Spinner mesh generator. */
export class SpinnerMeshGenerator {
	private readonly data: SpinnerData

	constructor(data: SpinnerData) {
		this.data = data
	}

	public generateMeshes(table: Table): { plate: Mesh; bracket: Mesh } {
		const posZ = this.getZ(table)
		return { plate: this.getPlateMesh(table, posZ), bracket: this.getBracketMesh(table, posZ) }
	}

	public getZ(table: Table): number {
		const h = table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		return f4(h + this.data.height)
	}

	private getPlateMesh(table: Table, posZ: number): Mesh {
		return this.updateVertices(table, posZ, spinnerPlateMesh.clone(`spinner.plate-${this.data.getName()}`))
	}

	private getBracketMesh(table: Table, posZ: number): Mesh {
		return this.updateVertices(table, posZ, spinnerBracketMesh.clone(`spinner.bracket-${this.data.getName()}`))
	}

	private updateVertices(table: Table, posZ: number, mesh: Mesh): Mesh {
		const m = new Matrix3D().rotateZMatrix(degToRad(this.data.rotation))
		for (const v of mesh.vertices) {
			const vert = Vertex3D.claim(v.x, v.y, v.z).multiplyMatrix(m)
			v.x = f4(vert.x * this.data.length) + this.data.center.x
			v.y = f4(vert.y * this.data.length) + this.data.center.y
			v.z = f4(f4(vert.z * this.data.length) * table.getScaleZ()) + posZ
			const n = Vertex3D.claim(v.nx, v.ny, v.nz).multiplyMatrixNoTranslate(m)
			v.nx = n.x
			v.ny = n.y
			v.nz = n.z
			Vertex3D.release(vert, n)
		}
		return mesh
	}
}
