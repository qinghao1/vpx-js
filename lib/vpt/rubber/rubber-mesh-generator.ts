// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { HIT_SHAPE_DETAIL_LEVEL } from '../../math/dragpoint.js'
import { degToRad, f4 } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import { SplineVertex } from '../../math/spline-vertex.js'
import { Vertex3DNoTex2 } from '../../math/vertex.js'
import { Vertex3D } from '../../math/vertex3d.js'
import { FLT_MAX, FLT_MIN, Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { RubberData } from './rubber-data.js'

/** Rubber mesh generator. */
export class RubberMeshGenerator {
	public readonly middlePoint = new Vertex3D()
	private readonly data: RubberData

	constructor(data: RubberData) {
		this.data = data
	}

	public getMeshes(table: Table, acc = -1, createHitShape = false): Mesh {
		const mesh = new Mesh(`rubber-${this.data.getName()}`)
		let accuracy =
			acc !== -1
				? acc
				: table.getDetailLevel() < 5
					? 6
					: table.getDetailLevel() < 8
						? 8
						: Math.floor(table.getDetailLevel() * 1.3)
		if (acc === -1) accuracy = Math.floor(10 * 1.2)

		const sv = SplineVertex.getInstance(
			this.data.dragPoints,
			this.data.thickness,
			table.getDetailLevel(),
			acc !== -1 ? 4 * 10 ** ((10 - HIT_SHAPE_DETAIL_LEVEL) * (1 / 1.5)) : -1,
		)
		const numRings = sv.pcvertex - 1,
			numSegments = accuracy
		const numVertices = numRings * numSegments
		const height = this.data.hitHeight + table.getTableHeight()

		let prevB = new Vertex3D()
		const invR = f4(1 / numRings),
			invS = f4(1 / numSegments)
		let idx = 0
		for (let i = 0; i < numRings; i++) {
			const i2 = i === numRings - 1 ? 0 : i + 1
			const tangent = new Vertex3D(
				sv.pMiddlePoints[i2].x - sv.pMiddlePoints[i].x,
				sv.pMiddlePoints[i2].y - sv.pMiddlePoints[i].y,
				0,
			)
			let binorm: Vertex3D, normal: Vertex3D
			if (i === 0) {
				const up = new Vertex3D(
					sv.pMiddlePoints[i2].x + sv.pMiddlePoints[i].x,
					sv.pMiddlePoints[i2].y + sv.pMiddlePoints[i].y,
					f4(height * 2),
				)
				normal = new Vertex3D(tangent.y * up.z, -tangent.x * up.z, f4(tangent.x * up.y) - f4(tangent.y * up.x))
				binorm = new Vertex3D(
					tangent.y * normal.z,
					-tangent.x * normal.z,
					f4(tangent.x * normal.y) - f4(tangent.y * normal.x),
				)
			} else {
				normal = prevB.clone().cross(tangent)
				binorm = tangent.clone().cross(normal)
			}
			binorm.normalize()
			normal.normalize()
			prevB = binorm
			for (let j = 0; j < numSegments; j++) {
				const u = i * invR,
					v = f4(j + u) * invS
				const tmp = Vertex3D.getRotatedAxis(j * (360 * invS), tangent, normal).multiplyScalar(this.data.thickness * 0.5)
				const vtx = new Vertex3DNoTex2()
				vtx.x = f4(sv.pMiddlePoints[i].x + tmp.x)
				vtx.y = f4(sv.pMiddlePoints[i].y + tmp.y)
				if (createHitShape && (j === 0 || j === 3)) tmp.z *= 0.6
				vtx.z = height + tmp.z
				vtx.tu = u
				vtx.tv = v
				mesh.vertices[idx++] = vtx
			}
		}

		for (let i = 0; i < numRings; i++) {
			for (let j = 0; j < numSegments; j++) {
				const q0 = i * numSegments + j
				const q1 = j !== numSegments - 1 ? i * numSegments + j + 1 : i * numSegments
				const q2 =
					i !== numRings - 1
						? j !== numSegments - 1
							? (i + 1) * numSegments + j + 1
							: (i + 1) * numSegments
						: j !== numSegments - 1
							? j + 1
							: 0
				const q3 = i !== numRings - 1 ? (i + 1) * numSegments + j : j
				const off = (i * numSegments + j) * 6
				mesh.indices[off] = q0
				mesh.indices[off + 1] = q1
				mesh.indices[off + 2] = q3
				mesh.indices[off + 3] = q2
				mesh.indices[off + 4] = q3
				mesh.indices[off + 5] = q1
			}
		}
		Mesh.computeNormals(mesh.vertices, numVertices, mesh.indices, 6 * numVertices)

		let maxx = FLT_MIN,
			minx = FLT_MAX,
			maxy = FLT_MIN,
			miny = FLT_MAX,
			maxz = FLT_MIN,
			minz = FLT_MAX
		for (let i = 0; i < numVertices; i++) {
			const v = mesh.vertices[i]
			if (v.x > maxx) maxx = v.x
			if (v.x < minx) minx = v.x
			if (v.y > maxy) maxy = v.y
			if (v.y < miny) miny = v.y
			if (v.z > maxz) maxz = v.z
			if (v.z < minz) minz = v.z
		}
		this.middlePoint.x = f4(maxx + minx) * 0.5
		this.middlePoint.y = f4(maxy + miny) * 0.5
		this.middlePoint.z = f4(maxz + minz) * 0.5

		const [vertexMatrix, fullMatrix] = this.getMatrices(table)
		return mesh.transform(vertexMatrix, fullMatrix)
	}

	private getMatrices(table: Table): [Matrix3D, Matrix3D] {
		const full = new Matrix3D()
		const tmp = new Matrix3D()
		full.rotateZMatrix(degToRad(this.data.rotZ))
		tmp.rotateYMatrix(degToRad(this.data.rotY))
		full.multiply(tmp)
		tmp.rotateXMatrix(degToRad(this.data.rotX))
		full.multiply(tmp)

		const vert = new Matrix3D()
		tmp.setTranslation(-this.middlePoint.x, -this.middlePoint.y, -this.middlePoint.z)
		vert.multiply(tmp, full)
		tmp.setScaling(1, 1, table.getScaleZ())
		vert.multiply(tmp)
		if (this.data.height === this.data.hitHeight)
			tmp.setTranslation(this.middlePoint.x, this.middlePoint.y, this.data.height + table.getTableHeight())
		else
			tmp.setTranslation(
				this.middlePoint.x,
				this.middlePoint.y,
				f4(this.data.height * table.getScaleZ()) + table.getTableHeight(),
			)
		vert.multiply(tmp)
		return [vert, full]
	}
}
