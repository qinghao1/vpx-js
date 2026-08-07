// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad, f4 } from '../../util/float.js'
import { logger } from '../../util/logger.js'
import { Matrix3D, Vertex3D } from '../../util/math.js'
import { Enums } from '../enums.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { GateData } from './gate-data.js'

const hitTargetT3Mesh = loadMesh('drop-target-t3-mesh')
const gateBracketMesh = loadMesh('gate-bracket-mesh')
const gateLongPlateMesh = loadMesh('gate-long-plate-mesh')
const gatePlateMesh = loadMesh('gate-plate-mesh')
const gateWireMesh = loadMesh('gate-wire-mesh')
const gateWireRectangleMesh = loadMesh('gate-wire-rectangle-mesh')

/** Gate mesh generator. */
export class GateMeshGenerator {
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
			default:
				logger().warn('[GateItem.getBaseMesh] Unknown gate type "%s".', this.data.gateType)
				return hitTargetT3Mesh.clone()
		}
	}

	private positionMesh(mesh: Mesh, table: Table, baseHeight: number): Mesh {
		const m = new Matrix3D().rotateZMatrix(degToRad(this.data.rotation))
		for (const v of mesh.vertices) {
			const vert = Vertex3D.claim(v.x, v.y, v.z).multiplyMatrix(m)
			v.x = f4(vert.x * this.data.length) + this.data.center.x
			v.y = f4(vert.y * this.data.length) + this.data.center.y
			v.z =
				f4(f4(f4(vert.z * this.data.length) * table.getScaleZ()) + f4(this.data.height * table.getScaleZ())) +
				baseHeight
			const n = Vertex3D.claim(v.nx, v.ny, v.nz).multiplyMatrixNoTranslate(m)
			v.nx = n.x
			v.ny = n.y
			v.nz = n.z
			Vertex3D.release(vert, n)
		}
		return mesh
	}
}

export interface GateMesh {
	wire: Mesh
	bracket: Mesh
}
