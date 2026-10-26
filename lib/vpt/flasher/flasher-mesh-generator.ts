// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { MathUtils } from 'three'
import { Matrix3D } from '../../math/matrix.js'
import { CatmullCurve2D } from '../../util/catmull-curve.js'
import { RenderVertex, Vertex3DNoTex2 } from '../../util/vertex.js'
import { DragPoint } from '../dragpoint.js'
import { Enums } from '../enums.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { FlasherData } from './flasher-data.js'

export class FlasherMeshGenerator {
	public generateMesh(data: FlasherData, table: Table): Mesh | undefined {
		let verts: RenderVertex[] = []
		if (data.dragPoints.length > 2 && !data.isDMD) {
			verts = DragPoint.getRgVertex(data.dragPoints, () => new RenderVertex(), CatmullCurve2D.fromVertex2D)
		}
		if (verts.length < 3) {
			if (data.dragPoints.length === 4) {
				verts = data.dragPoints.map(dp => {
					const rv = new RenderVertex()
					rv.set(dp.vertex.x, dp.vertex.y)
					return rv
				})
			} else {
				return undefined
			}
		}

		let minx = Infinity
		let miny = Infinity
		let maxx = -Infinity
		let maxy = -Infinity
		for (const vert of verts) {
			if (vert.x < minx) minx = vert.x
			if (vert.x > maxx) maxx = vert.x
			if (vert.y < miny) miny = vert.y
			if (vert.y > maxy) maxy = vert.y
		}
		const centerX = (minx + maxx) * 0.5
		const centerY = (miny + maxy) * 0.5

		const dim = table.getDimensions()
		const invW = 1 / (maxx - minx || 1)
		const invH = 1 / (maxy - miny || 1)
		const tableLeft = Number.isFinite(table.data?.left) ? table.data.left : 0
		const tableTop = Number.isFinite(table.data?.top) ? table.data.top : 0
		const tableWidth = Number.isFinite(dim.width) && dim.width !== 0 ? dim.width : 1
		const tableHeight = Number.isFinite(dim.height) && dim.height !== 0 ? dim.height : 1
		const invTableW = 1 / tableWidth
		const invTableH = 1 / tableHeight

		let indices = Mesh.polygonToTriangles(
			verts,
			verts.map((_, i) => i),
		)
		if (!indices.length) {
			if (verts.length === 4) {
				indices = [0, 1, 2, 0, 2, 3]
			} else {
				return undefined
			}
		}

		const mesh = new Mesh(`flasher-${data.getName()}`)
		mesh.indices = indices

		for (let i = 0; i < verts.length; i++) {
			const vert = verts[i]!
			let tu = 0
			let tv = 0
			if (data.imageAlignment === Enums.RampImageAlignment.ImageModeWrap) {
				tu = (vert.x - minx) * invW
				tv = (vert.y - miny) * invH
			} else {
				tu = (vert.x - tableLeft) * invTableW
				tv = (vert.y - tableTop) * invTableH
			}
			const vertex = Object.assign(new Vertex3DNoTex2(), {
				x: vert.x,
				y: vert.y,
				z: 0,
				nx: 0,
				ny: 0,
				nz: 1,
				tu,
				tv,
			})
			mesh.vertices.push(vertex)
		}

		const m1 = Matrix3D.claim().setTranslation(-centerX, -centerY, 0)
		const rz = Matrix3D.claim().rotateZMatrix(MathUtils.degToRad(data.rotZ))
		const ry = Matrix3D.claim().rotateYMatrix(MathUtils.degToRad(data.rotY))
		const rx = Matrix3D.claim().rotateXMatrix(MathUtils.degToRad(data.rotX))
		const m2 = Matrix3D.claim().setTranslation(
			centerX,
			centerY,
			data.height * table.getScaleZ() + table.getTableHeight(),
		)
		const full = m1.clone().multiply(rz).multiply(ry).multiply(rx).multiply(m2)
		Matrix3D.release(m1, rz, ry, rx, m2)

		mesh.transform(full)
		Matrix3D.release(full)
		mesh.transform(Matrix3D.RIGHT_HANDED)
		return mesh
	}
}
