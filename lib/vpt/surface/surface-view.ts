// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { CatmullCurve2D } from '../../util/catmull-curve.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex2D } from '../../util/vector.js'
import { RenderVertex, Vertex3DNoTex2 } from '../../util/vertex.js'
import { DragPoint } from '../dragpoint.js'
import { ItemUpdater } from '../item-updater.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { SurfaceData } from './surface-data.js'
import type { SurfaceState } from './surface-state.js'

/** Generates surface top/side meshes. @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class SurfaceMeshGenerator {
	public generateMeshes(data: SurfaceData, table: Table): { top?: Mesh; side?: Mesh } {
		const topMesh = new Mesh(`surface.top-${data.getName()}`)
		const sideMesh = new Mesh(`surface.side-${data.getName()}`)
		const verts = DragPoint.getRgVertex(data.dragPoints, () => new RenderVertex(), CatmullCurve2D.fromVertex2D)
		const texCoords = DragPoint.getTextureCoords(data.dragPoints, verts)
		const n = verts.length
		if (!n) return {}
		const normals = this.computeNormals(verts)
		const bottom = data.heightBottom * table.getScaleZ() + table.getTableHeight()
		const top = data.heightTop * table.getScaleZ() + table.getTableHeight()

		this.buildSide(sideMesh, verts, texCoords, normals, bottom, top, !!data.szSideImage)
		this.buildTop(topMesh, verts, table, top)
		const meshes: { top?: Mesh; side?: Mesh } = {}
		if (topMesh.vertices.length) meshes.top = topMesh
		if (top !== bottom) meshes.side = sideMesh
		return meshes
	}

	private computeNormals(verts: RenderVertex[]): Vertex2D[] {
		const n = verts.length
		const out: Vertex2D[] = []
		for (let i = 0; i < n; i++) {
			const a = verts[i]!
			const b = verts[i < n - 1 ? i + 1 : 0]!
			const dx = a.x - b.x
			const dy = a.y - b.y
			const inv = 1 / Math.hypot(dx, dy)
			out[i] = new Vertex2D(dy * inv, dx * inv)
		}
		return out
	}

	private buildSide(
		mesh: Mesh,
		verts: RenderVertex[],
		texCoords: number[],
		_normals: Vertex2D[],
		bottom: number,
		top: number,
		textured: boolean,
	): void {
		const n = verts.length
		let off = 0
		for (let i = 0; i < n; i++) {
			const p1 = verts[i]!
			const p2 = verts[i < n - 1 ? i + 1 : 0]!
			mesh.vertices[off] = Object.assign(new Vertex3DNoTex2(), { x: p1.x, y: p1.y, z: bottom })
			mesh.vertices[off + 1] = Object.assign(new Vertex3DNoTex2(), { x: p1.x, y: p1.y, z: top })
			mesh.vertices[off + 2] = Object.assign(new Vertex3DNoTex2(), { x: p2.x, y: p2.y, z: top })
			mesh.vertices[off + 3] = Object.assign(new Vertex3DNoTex2(), { x: p2.x, y: p2.y, z: bottom })
			if (textured) {
				const c = i < n - 1 ? i + 1 : 0
				mesh.vertices[off]!.tu = texCoords[i]!
				mesh.vertices[off]!.tv = 1
				mesh.vertices[off + 1]!.tu = texCoords[i]!
				mesh.vertices[off + 1]!.tv = 0
				mesh.vertices[off + 2]!.tu = texCoords[c] ?? texCoords[0]!
				mesh.vertices[off + 2]!.tv = 0
				mesh.vertices[off + 3]!.tu = texCoords[c] ?? texCoords[0]!
				mesh.vertices[off + 3]!.tv = 1
			}
			off += 4
		}
		for (let i = 0; i < n; i++) {
			const o = i * 6,
				b = i * 4
			mesh.indices[o] = b
			mesh.indices[o + 1] = b + 1
			mesh.indices[o + 2] = b + 2
			mesh.indices[o + 3] = b
			mesh.indices[o + 4] = b + 2
			mesh.indices[o + 5] = b + 3
		}
	}

	private buildTop(mesh: Mesh, verts: RenderVertex[], table: Table, zTop: number): void {
		const n = verts.length
		const indices = Mesh.polygonToTriangles(
			verts,
			verts.map((_, i) => i),
		)
		if (!indices.length) return
		mesh.indices = indices
		const dim = table.getDimensions()
		const invW = 1 / dim.width,
			invH = 1 / dim.height
		for (let i = 0; i < n; i++) {
			const p = verts[i]!
			mesh.vertices[i] = Object.assign(new Vertex3DNoTex2(), {
				x: p.x,
				y: p.y,
				z: zTop,
				tu: p.x * invW,
				tv: p.y * invH,
			})
		}
	}
}

/** Surface updater — drop, top and side. */
export class SurfaceUpdater extends ItemUpdater<SurfaceState> {
	constructor(
		state: SurfaceState,
		private readonly data: SurfaceData,
	) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: SurfaceState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		this.applyDropState(obj, state, renderApi)
		this.applySideState(obj, state, renderApi, table)
		this.applyTopState(obj, state, renderApi, table)
	}

	private applyDropState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: SurfaceState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		if (state.isDropped === undefined) return
		const m = Matrix3D.claim()
		if (state.isDropped) m.setTranslation(0, 0, this.data.heightTop - 0.01)
		renderApi.applyMatrixToNode(m, obj)
		Matrix3D.release(m)
	}

	private applyTopState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: SurfaceState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const top = renderApi.findInGroup(obj, `surface.top-${this.state.getName()}`)
		if (state.isTopVisible !== undefined) renderApi.applyVisibility(state.isTopVisible, top)
		this.applyMaterial(top, state.topMaterial, state.topTexture, renderApi, table)
	}

	private applySideState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: SurfaceState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const side = renderApi.findInGroup(obj, `surface.side-${this.state.getName()}`)
		if (state.isSideVisible !== undefined) renderApi.applyVisibility(state.isSideVisible, side)
		this.applyMaterial(side, state.sideMaterial, state.sideTexture, renderApi, table)
	}
}
