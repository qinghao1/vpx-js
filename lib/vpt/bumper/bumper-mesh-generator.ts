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
import type { BumperData } from './bumper-data.js'

const require = createRequire(import.meta.url)

const bumperBaseMeshJson = JSON.parse(readFileSync(resolve(process.cwd(), 'res/meshes/bumper-base-mesh.json'), 'utf-8'))
const bumperCapMeshJson = JSON.parse(readFileSync(resolve(process.cwd(), 'res/meshes/bumper-cap-mesh.json'), 'utf-8'))
const bumperRingMeshJson = JSON.parse(readFileSync(resolve(process.cwd(), 'res/meshes/bumper-ring-mesh.json'), 'utf-8'))
const bumperSocketMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/bumper-socket-mesh.json'), 'utf-8'),
)

const bumperBaseMesh = Mesh.fromJson(bumperBaseMeshJson)
const bumperCapMesh = Mesh.fromJson(bumperCapMeshJson)
const bumperRingMesh = Mesh.fromJson(bumperRingMeshJson)
const bumperSocketMesh = Mesh.fromJson(bumperSocketMeshJson)

export /** Bumper mesh generator. */
class BumperMeshGenerator {
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
		if (!this.data.center) {
			throw new Error(`Cannot export bumper ${this.data.getName()} without vCenter.`)
		}
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
				(z) => f4(z * table.getScaleZ()) + (height + 5.0),
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
		const generatedMesh = mesh.clone(name)
		for (const vertex of generatedMesh.vertices) {
			const vert = Vertex3D.claim(vertex.x, vertex.y, vertex.z).multiplyMatrix(matrix)
			vertex.x = vert.x + this.data.center.x
			vertex.y = vert.y + this.data.center.y
			vertex.z = zPos(vert.z)

			const normal = Vertex3D.claim(vertex.nx, vertex.ny, vertex.nz).multiplyMatrixNoTranslate(matrix)
			vertex.nx = normal.x
			vertex.ny = normal.y
			vertex.nz = normal.z

			Vertex3D.release(vert, normal)
		}
		return generatedMesh
	}
}

export interface BumperMesh {
	base: Mesh
	ring: Mesh
	skirt: Mesh
	cap: Mesh
}
