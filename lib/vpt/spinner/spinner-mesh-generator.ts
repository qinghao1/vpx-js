// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad, f4 } from '../../util/float.js'
import { Vertex3D } from '../../util/vector.js'
import { Matrix3D } from '../../util/matrix.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { SpinnerData } from './spinner-data.js'

const spinnerBracketMesh = loadMesh('spinner-bracket-mesh')
const spinnerPlateMesh = loadMesh('spinner-plate-mesh')

/** Generates spinner meshes. @see https://github.com/vpinball/vpinball/blob/master/spinner.cpp */
export class SpinnerMeshGenerator {
	constructor(private readonly data: SpinnerData) {}
	public generateMeshes(table: Table): { plate: Mesh; bracket: Mesh } {
		const z = this.getZ(table)
		return {
			plate: this.getMesh(table, z, spinnerPlateMesh, 'plate'),
			bracket: this.getMesh(table, z, spinnerBracketMesh, 'bracket'),
		}
	}
	public getZ(table: Table): number {
		const h =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		return f4(h + this.data.height)
	}
	private getMesh(table: Table, posZ: number, src: Mesh, name: string): Mesh {
		return this.transform(table, posZ, src.clone(`spinner.${name}-${this.data.getName()}`))
	}
	private transform(table: Table, posZ: number, mesh: Mesh): Mesh {
		const m = new Matrix3D().rotateZMatrix(degToRad(this.data.rotation))
		const len = this.data.length,
			cx = this.data.center.x,
			cy = this.data.center.y,
			zs = table.getScaleZ()
		for (const v of mesh.vertices) {
			const vert = Vertex3D.claim(v.x, v.y, v.z).multiplyMatrix(m)
			v.x = f4(vert.x * len) + cx
			v.y = f4(vert.y * len) + cy
			v.z = f4(vert.z * len * zs) + posZ
			const n = Vertex3D.claim(v.nx, v.ny, v.nz).multiplyMatrixNoTranslate(m)
			v.nx = n.x
			v.ny = n.y
			v.nz = n.z
			Vertex3D.release(vert, n)
		}
		return mesh
	}
}
