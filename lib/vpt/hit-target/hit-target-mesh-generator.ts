// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { degToRad, f4 } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import { Vertex3D } from '../../math/vertex3d.js'
import { Enums } from '../enums.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import { HitTarget } from './hit-target.js'
import type { HitTargetData } from './hit-target-data.js'

const require = createRequire(import.meta.url)

const hitTargetT2MeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/drop-target-t2-mesh.json'), 'utf-8'),
)
const hitTargetT3MeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/drop-target-t3-mesh.json'), 'utf-8'),
)
const hitTargetT4MeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/drop-target-t4-mesh.json'), 'utf-8'),
)
const hitFatTargetRectangleMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/hit-target-fat-rectangle-mesh.json'), 'utf-8'),
)
const hitFatTargetSquareMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/hit-target-fat-square-mesh.json'), 'utf-8'),
)
const hitTargetRectangleMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/hit-target-rectangle-mesh.json'), 'utf-8'),
)
const hitTargetRoundMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/hit-target-round-mesh.json'), 'utf-8'),
)
const hitTargetT1SlimMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/hit-target-t1-slim-mesh.json'), 'utf-8'),
)
const hitTargetT2SlimMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/hit-target-t2-slim-mesh.json'), 'utf-8'),
)

const hitTargetT2Mesh = Mesh.fromJson(hitTargetT2MeshJson)
const hitTargetT3Mesh = Mesh.fromJson(hitTargetT3MeshJson)
const hitTargetT4Mesh = Mesh.fromJson(hitTargetT4MeshJson)
const hitFatTargetRectangleMesh = Mesh.fromJson(hitFatTargetRectangleMeshJson)
const hitFatTargetSquareMesh = Mesh.fromJson(hitFatTargetSquareMeshJson)
const hitTargetRectangleMesh = Mesh.fromJson(hitTargetRectangleMeshJson)
const hitTargetRoundMesh = Mesh.fromJson(hitTargetRoundMeshJson)
const hitTargetT1SlimMesh = Mesh.fromJson(hitTargetT1SlimMeshJson)
const hitTargetT2SlimMesh = Mesh.fromJson(hitTargetT2SlimMeshJson)

export class HitTargetMeshGenerator {
	private readonly data: HitTargetData

	constructor(data: HitTargetData) {
		this.data = data
	}

	public getMesh(table: Table): Mesh {
		let dropOffset = 0
		if (this.data.isDropTarget() && this.data.isDropped) {
			dropOffset = -f4(HitTarget.DROP_TARGET_LIMIT * table.getScaleZ())
		}
		return this.generateMesh(table, dropOffset)
	}

	public generateMesh(table: Table, dropOffset: number = 0): Mesh {
		const hitTargetMesh = this.getBaseMesh()
		hitTargetMesh.name = `hit.target-${this.data.getName()}`

		const fullMatrix = new Matrix3D()
		const tempMatrix = new Matrix3D()
		tempMatrix.rotateZMatrix(degToRad(this.data.rotZ))
		fullMatrix.multiply(tempMatrix)

		for (const vertex of hitTargetMesh.vertices) {
			const vert = Vertex3D.claim(vertex.x, vertex.y, vertex.z)
			vert.x *= this.data.vSize.x
			vert.y *= this.data.vSize.y
			vert.z *= this.data.vSize.z
			vert.multiplyMatrix(fullMatrix)

			vertex.x = f4(vert.x + this.data.position.x)
			vertex.y = f4(vert.y + this.data.position.y)
			vertex.z = f4(f4(f4(vert.z * table.getScaleZ()) + this.data.position.z) + table.getTableHeight()) + dropOffset

			const normal = Vertex3D.claim(vertex.nx, vertex.ny, vertex.nz).multiplyMatrixNoTranslate(fullMatrix)
			vertex.nx = normal.x
			vertex.ny = normal.y
			vertex.nz = normal.z

			Vertex3D.release(vert, normal)
		}

		return hitTargetMesh
	}

	private getBaseMesh(): Mesh {
		switch (this.data.targetType) {
			case Enums.TargetType.DropTargetBeveled:
				return hitTargetT2Mesh.clone()
			case Enums.TargetType.DropTargetSimple:
				return hitTargetT3Mesh.clone()
			case Enums.TargetType.DropTargetFlatSimple:
				return hitTargetT4Mesh.clone()
			case Enums.TargetType.HitTargetRound:
				return hitTargetRoundMesh.clone()
			case Enums.TargetType.HitTargetRectangle:
				return hitTargetRectangleMesh.clone()
			case Enums.TargetType.HitFatTargetRectangle:
				return hitFatTargetRectangleMesh.clone()
			case Enums.TargetType.HitFatTargetSquare:
				return hitFatTargetSquareMesh.clone()
			case Enums.TargetType.HitTargetSlim:
				return hitTargetT1SlimMesh.clone()
			case Enums.TargetType.HitFatTargetSlim:
				return hitTargetT2SlimMesh.clone()
			/* istanbul ignore next: currently all implemented */
			default:
				return hitTargetT3Mesh.clone()
		}
	}
}
