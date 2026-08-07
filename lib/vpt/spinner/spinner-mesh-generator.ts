// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { degToRad, f4 } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import { Vertex3D } from '../../math/vertex3d.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { SpinnerData } from './spinner-data.js'

const require = createRequire(import.meta.url)

const spinnerBracketMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/spinner-bracket-mesh.json'), 'utf-8'),
)
const spinnerPlateMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/spinner-plate-mesh.json'), 'utf-8'),
)

const spinnerBracketMesh = Mesh.fromJson(spinnerBracketMeshJson)
const spinnerPlateMesh = Mesh.fromJson(spinnerPlateMeshJson)

export /** SpinnerMeshGenerator. */
class SpinnerMeshGenerator {
	private readonly data: SpinnerData

	constructor(data: SpinnerData) {
		this.data = data
	}

	public generateMeshes(table: Table): { plate: Mesh; bracket: Mesh } {
		const posZ = this.getZ(table)
		return {
			plate: this.getPlateMesh(table, posZ),
			bracket: this.getBracketMesh(table, posZ),
		}
	}

	public getZ(table: Table): number {
		const height =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		return f4(height + this.data.height)
	}

	private getPlateMesh(table: Table, posZ: number): Mesh {
		const mesh = spinnerPlateMesh.clone(`spinner.plate-${this.data.getName()}`)
		return this.updateVertices(table, posZ, mesh)
	}

	private getBracketMesh(table: Table, posZ: number): Mesh {
		const bracketMesh = spinnerBracketMesh.clone(`spinner.bracket-${this.data.getName()}`)
		return this.updateVertices(table, posZ, bracketMesh)
	}

	private updateVertices(table: Table, posZ: number, mesh: Mesh): Mesh {
		const matrix = new Matrix3D().rotateZMatrix(degToRad(this.data.rotation))
		for (const vertex of mesh.vertices) {
			const vert = Vertex3D.claim(vertex.x, vertex.y, vertex.z).multiplyMatrix(matrix)
			vertex.x = f4(vert.x * this.data.length) + this.data.center.x
			vertex.y = f4(vert.y * this.data.length) + this.data.center.y
			vertex.z = f4(f4(vert.z * this.data.length) * table.getScaleZ()) + posZ

			const normal = Vertex3D.claim(vertex.nx, vertex.ny, vertex.nz).multiplyMatrixNoTranslate(matrix)
			vertex.nx = normal.x
			vertex.ny = normal.y
			vertex.nz = normal.z

			Vertex3D.release(vert, normal)
		}
		return mesh
	}
}
