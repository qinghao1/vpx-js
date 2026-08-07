// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { CatmullCurve2D } from '../../math/catmull-curve.js'
import { DragPoint } from '../../math/dragpoint.js'
import { Vertex3DNoTex2 } from '../../math/vertex.js'
import { RenderVertex, Vertex2D } from '../../math/vertex2d.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { SurfaceData } from './surface-data.js'

/** Surface mesh generator. */
export class SurfaceMeshGenerator {
	/** Returns mesh of surface. @see Surface::GenerateMesh */
	public generateMeshes(data: SurfaceData, table: Table): { top?: Mesh; side?: Mesh } {
		const topMesh = new Mesh(`surface.top-${data.getName()}`)
		const sideMesh = new Mesh(`surface.side-${data.getName()}`)

		const verts = DragPoint.getRgVertex(data.dragPoints, () => new RenderVertex(), CatmullCurve2D.fromVertex2D)
		const texCoords = DragPoint.getTextureCoords(data.dragPoints, verts)
		const n = verts.length
		const normals: Vertex2D[] = []
		for (let i = 0; i < n; i++) {
			const a = verts[i],
				b = verts[i < n - 1 ? i + 1 : 0]
			const dx = a.x - b.x,
				dy = a.y - b.y,
				inv = 1 / Math.sqrt(dx * dx + dy * dy)
			normals[i] = new Vertex2D(dy * inv, dx * inv)
		}

		const bottom = data.heightBottom * table.getScaleZ() + table.getTableHeight()
		const top = data.heightTop * table.getScaleZ() + table.getTableHeight()

		let offset = 0
		for (let i = 0; i < n; i++) {
			const p1 = verts[i],
				p2 = verts[i < n - 1 ? i + 1 : 0]
			const a = i === 0 ? n - 1 : i - 1,
				c = i < n - 1 ? i + 1 : 0
			const n0 = new Vertex2D(),
				n1 = new Vertex2D()
			if (p1.fSmooth) {
				n0.x = (normals[a].x + normals[i].x) * 0.5
				n0.y = (normals[a].y + normals[i].y) * 0.5
			} else {
				n0.x = normals[i].x
				n0.y = normals[i].y
			}
			if (p2.fSmooth) {
				n1.x = (normals[i].x + normals[c].x) * 0.5
				n1.y = (normals[i].y + normals[c].y) * 0.5
			} else {
				n1.x = normals[i].x
				n1.y = normals[i].y
			}
			n0.normalize()
			n1.normalize()

			sideMesh.vertices[offset] = Object.assign(new Vertex3DNoTex2(), { x: p1.x, y: p1.y, z: bottom })
			sideMesh.vertices[offset + 1] = Object.assign(new Vertex3DNoTex2(), { x: p1.x, y: p1.y, z: top })
			sideMesh.vertices[offset + 2] = Object.assign(new Vertex3DNoTex2(), { x: p2.x, y: p2.y, z: top })
			sideMesh.vertices[offset + 3] = Object.assign(new Vertex3DNoTex2(), { x: p2.x, y: p2.y, z: bottom })

			if (data.szSideImage) {
				sideMesh.vertices[offset].tu = texCoords[i]
				sideMesh.vertices[offset].tv = 1
				sideMesh.vertices[offset + 1].tu = texCoords[i]
				sideMesh.vertices[offset + 1].tv = 0
				sideMesh.vertices[offset + 2].tu = texCoords[c] ?? texCoords[0]
				sideMesh.vertices[offset + 2].tv = 0
				sideMesh.vertices[offset + 3].tu = texCoords[c] ?? texCoords[0]
				sideMesh.vertices[offset + 3].tv = 1
			}
			offset += 4
		}

		for (let i = 0; i < n; i++) {
			const off = i * 6
			const base = i * 4
			sideMesh.indices[off] = base
			sideMesh.indices[off + 1] = base + 1
			sideMesh.indices[off + 2] = base + 2
			sideMesh.indices[off + 3] = base
			sideMesh.indices[off + 4] = base + 2
			sideMesh.indices[off + 5] = base + 3
		}

		const indices = Mesh.polygonToTriangles(
			verts,
			verts.map((_, i) => i),
		)
		if (indices.length === 0) return {}
		topMesh.indices = indices

		const dim = table.getDimensions(),
			invW = 1 / dim.width,
			invH = 1 / dim.height
		const zTop = data.heightTop * table.getScaleZ() + table.getTableHeight()
		for (let i = 0; i < n; i++) {
			const p = verts[i]
			topMesh.vertices[i] = Object.assign(new Vertex3DNoTex2(), {
				x: p.x,
				y: p.y,
				z: zTop,
				tu: p.x * invW,
				tv: p.y * invH,
				nx: 0,
				ny: 0,
				nz: 1,
			})
		}

		const meshes: { top?: Mesh; side?: Mesh } = {}
		if (topMesh.vertices.length) meshes.top = topMesh
		if (top !== bottom) meshes.side = sideMesh
		return meshes
	}
}
