// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad, f4 } from '../../util/float.js'
import { Matrix3D, Vertex3D } from '../../util/math.js'
import { Enums } from '../enums.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import { HitTarget } from './hit-target.js'
import type { HitTargetData } from './hit-target-data.js'

const hitTargetT2Mesh = loadMesh('drop-target-t2-mesh')
const hitTargetT3Mesh = loadMesh('drop-target-t3-mesh')
const hitTargetT4Mesh = loadMesh('drop-target-t4-mesh')
const hitFatTargetRectangleMesh = loadMesh('hit-target-fat-rectangle-mesh')
const hitFatTargetSquareMesh = loadMesh('hit-target-fat-square-mesh')
const hitTargetRectangleMesh = loadMesh('hit-target-rectangle-mesh')
const hitTargetRoundMesh = loadMesh('hit-target-round-mesh')
const hitTargetT1SlimMesh = loadMesh('hit-target-t1-slim-mesh')
const hitTargetT2SlimMesh = loadMesh('hit-target-t2-slim-mesh')

/** Generates hit-target mesh. @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetMeshGenerator {
	constructor(private readonly data: HitTargetData) {}
	public getMesh(table: Table): Mesh {
		const drop =
			this.data.isDropTarget() && this.data.isDropped ? -f4(HitTarget.DROP_TARGET_LIMIT * table.getScaleZ()) : 0
		return this.generateMesh(table, drop)
	}
	public generateMesh(table: Table, dropOffset = 0): Mesh {
		const mesh = this.getBaseMesh()
		mesh.name = `hit.target-${this.data.getName()}`
		const m = new Matrix3D().rotateZMatrix(degToRad(this.data.rotZ))
		const sx = this.data.vSize.x,
			sy = this.data.vSize.y,
			sz = this.data.vSize.z
		const px = this.data.position.x,
			py = this.data.position.y,
			pz = this.data.position.z
		const scaleZ = table.getScaleZ(),
			tableH = table.getTableHeight()
		for (const v of mesh.vertices) {
			const vert = Vertex3D.claim(v.x * sx, v.y * sy, v.z * sz).multiplyMatrix(m)
			v.x = f4(vert.x + px)
			v.y = f4(vert.y + py)
			v.z = f4(vert.z * scaleZ + pz + tableH) + dropOffset
			const n = Vertex3D.claim(v.nx, v.ny, v.nz).multiplyMatrixNoTranslate(m)
			v.nx = n.x
			v.ny = n.y
			v.nz = n.z
			Vertex3D.release(vert, n)
		}
		return mesh
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
			default:
				return hitTargetT3Mesh.clone()
		}
	}
}
