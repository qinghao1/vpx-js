// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { MathUtils } from 'three'
import { HIT_SHAPE_DETAIL_LEVEL } from '../../util/dragpoint.js'
import { Matrix3D } from '../../util/matrix.js'
import { SplineVertex } from '../../util/spline-vertex.js'
import { Vertex3D } from '../../util/vector.js'
import { Vertex3DNoTex2 } from '../../util/vertex.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { RubberData } from './rubber-data.js'

/** Generates rubber mesh and keeps its center. @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
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
		const numRings = sv.pcvertex - 1
		const numSegments = accuracy
		const numVertices = numRings * numSegments
		const height = this.data.hitHeight + table.getTableHeight()

		let prevB = new Vertex3D()
		const invR = 1 / numRings
		const invS = 1 / numSegments
		let idx = 0
		for (let i = 0; i < numRings; i++) {
			const i2 = i === numRings - 1 ? 0 : i + 1
			const tangent = new Vertex3D(
				sv.pMiddlePoints[i2].x - sv.pMiddlePoints[i].x,
				sv.pMiddlePoints[i2].y - sv.pMiddlePoints[i].y,
				0,
			)
			let binorm: Vertex3D
			let normal: Vertex3D
			if (i === 0) {
				const up = new Vertex3D(
					sv.pMiddlePoints[i2].x + sv.pMiddlePoints[i].x,
					sv.pMiddlePoints[i2].y + sv.pMiddlePoints[i].y,
					height * 2,
				)
				normal = new Vertex3D(tangent.y * up.z, -tangent.x * up.z, tangent.x * up.y - tangent.y * up.x)
				binorm = new Vertex3D(
					tangent.y * normal.z,
					-tangent.x * normal.z,
					tangent.x * normal.y - tangent.y * normal.x,
				)
			} else {
				normal = prevB.clone().cross(tangent)
				binorm = tangent.clone().cross(normal)
			}
			binorm.normalize()
			normal.normalize()
			prevB = binorm
			for (let j = 0; j < numSegments; j++) {
				const u = i * invR
				const v = (j + u) * invS
				const tmp = Vertex3D.getRotatedAxis(j * (360 * invS), tangent, normal).multiplyScalar(
					this.data.thickness * 0.5,
				)
				const vtx = new Vertex3DNoTex2()
				vtx.x = sv.pMiddlePoints[i].x + tmp.x
				vtx.y = sv.pMiddlePoints[i].y + tmp.y
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

		let maxx = -Infinity,
			minx = Infinity,
			maxy = -Infinity,
			miny = Infinity,
			maxz = -Infinity,
			minz = Infinity
		for (let i = 0; i < numVertices; i++) {
			const v = mesh.vertices[i]!
			if (v.x > maxx) maxx = v.x
			if (v.x < minx) minx = v.x
			if (v.y > maxy) maxy = v.y
			if (v.y < miny) miny = v.y
			if (v.z > maxz) maxz = v.z
			if (v.z < minz) minz = v.z
		}
		this.middlePoint.x = (maxx + minx) * 0.5
		this.middlePoint.y = (maxy + miny) * 0.5
		this.middlePoint.z = (maxz + minz) * 0.5

		const [vertexMatrix, fullMatrix] = this.getMatrices(table)
		return mesh.transform(vertexMatrix, fullMatrix)
	}

	private getMatrices(table: Table): [Matrix3D, Matrix3D] {
		const full = new Matrix3D()
		const tmp = new Matrix3D()
		full.rotateXMatrix(MathUtils.degToRad(this.data.rotX))
		tmp.rotateYMatrix(MathUtils.degToRad(this.data.rotY))
		full.multiply(tmp)
		tmp.rotateZMatrix(MathUtils.degToRad(this.data.rotZ))
		full.multiply(tmp)
		const vert = new Matrix3D()
		if (this.data.height === this.data.hitHeight)
			tmp.setTranslation(this.middlePoint.x, this.middlePoint.y, this.data.height + table.getTableHeight())
		else
			tmp.setTranslation(
				this.middlePoint.x,
				this.middlePoint.y,
				this.data.height * table.getScaleZ() + table.getTableHeight(),
			)
		vert.multiply(tmp)
		tmp.setScaling(1, 1, table.getScaleZ())
		vert.multiply(tmp)
		tmp.setTranslation(-this.middlePoint.x, -this.middlePoint.y, -this.middlePoint.z)
		const tmp2 = new Matrix3D()
		tmp2.multiplyMatrices(full, tmp)
		vert.multiply(tmp2)
		return [vert, full]
	}
}
