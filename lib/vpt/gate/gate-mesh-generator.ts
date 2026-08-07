// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { degToRad, f4 } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import { Vertex3D } from '../../math/vertex3d.js'
import { logger } from '../../util/logger.js'
import { Enums } from '../enums.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { GateData } from './gate-data.js'

const require = createRequire(import.meta.url)

const hitTargetT3MeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/drop-target-t3-mesh.json'), 'utf-8'),
)
const gateBracketMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/gate-bracket-mesh.json'), 'utf-8'),
)
const gateLongPlateMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/gate-long-plate-mesh.json'), 'utf-8'),
)
const gatePlateMeshJson = JSON.parse(readFileSync(resolve(process.cwd(), 'res/meshes/gate-plate-mesh.json'), 'utf-8'))
const gateWireMeshJson = JSON.parse(readFileSync(resolve(process.cwd(), 'res/meshes/gate-wire-mesh.json'), 'utf-8'))
const gateWireRectangleMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/gate-wire-rectangle-mesh.json'), 'utf-8'),
)

const hitTargetT3Mesh = Mesh.fromJson(hitTargetT3MeshJson)
const gateBracketMesh = Mesh.fromJson(gateBracketMeshJson)
const gateLongPlateMesh = Mesh.fromJson(gateLongPlateMeshJson)
const gatePlateMesh = Mesh.fromJson(gatePlateMeshJson)
const gateWireMesh = Mesh.fromJson(gateWireMeshJson)
const gateWireRectangleMesh = Mesh.fromJson(gateWireRectangleMeshJson)

export /** Gate mesh generator. */
class GateMeshGenerator {
	private readonly data: GateData

	constructor(data: GateData) {
		this.data = data
	}

	public getMeshes(table: Table): GateMesh {
		const baseHeight =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		return {
			wire: this.positionMesh(this.getBaseMesh(), table, baseHeight),
			bracket: this.positionMesh(gateBracketMesh.clone(`gate.bracket-${this.data.getName()}`), table, baseHeight),
		}
	}

	private getBaseMesh(): Mesh {
		switch (this.data.gateType) {
			case Enums.GateType.GateWireW:
				return gateWireMesh.clone(`gate.wire-${this.data.getName()}`)
			case Enums.GateType.GateWireRectangle:
				return gateWireRectangleMesh.clone(`gate.wire-${this.data.getName()}`)
			case Enums.GateType.GatePlate:
				return gatePlateMesh.clone(`gate.wire-${this.data.getName()}`)
			case Enums.GateType.GateLongPlate:
				return gateLongPlateMesh.clone(`gate.wire-${this.data.getName()}`)
			/* istanbul ignore next */
			default:
				logger().warn('[GateItem.getBaseMesh] Unknown gate type "%s".', this.data.gateType)
				return hitTargetT3Mesh.clone()
		}
	}

	private positionMesh(mesh: Mesh, table: Table, baseHeight: number): Mesh {
		const fullMatrix = new Matrix3D()
		fullMatrix.rotateZMatrix(degToRad(this.data.rotation))
		for (const vertex of mesh.vertices) {
			const vert = Vertex3D.claim(vertex.x, vertex.y, vertex.z).multiplyMatrix(fullMatrix)
			vertex.x = f4(vert.x * this.data.length) + this.data.center.x
			vertex.y = f4(vert.y * this.data.length) + this.data.center.y
			vertex.z =
				f4(f4(f4(vert.z * this.data.length) * table.getScaleZ()) + f4(this.data.height * table.getScaleZ())) +
				baseHeight

			const normal = Vertex3D.claim(vertex.nx, vertex.ny, vertex.nz).multiplyMatrixNoTranslate(fullMatrix)
			vertex.nx = normal.x
			vertex.ny = normal.y
			vertex.nz = normal.z

			Vertex3D.release(vert, normal)
		}
		return mesh
	}
}

export interface GateMesh {
	wire: Mesh
	bracket: Mesh
}
