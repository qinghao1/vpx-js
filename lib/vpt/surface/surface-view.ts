// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix3D } from '../../math/matrix.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { CatmullCurve2D } from '../../util/catmull-curve.js'
import { RenderVertex, Vertex3DNoTex2 } from '../../util/vertex.js'
import { DragPoint } from '../dragpoint.js'
import { ItemUpdater } from '../item-updater.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { SurfaceData, SurfaceState } from './surface.js'

/** Generates surface top/side meshes. @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class SurfaceMeshGenerator {
	public generateMeshes(data: SurfaceData, table: Table): { top?: Mesh; side?: Mesh } {
		const topMesh = new Mesh(`surface.top-${data.getName()}`)
		const sideMesh = new Mesh(`surface.side-${data.getName()}`)
		const verts = DragPoint.getRgVertex(data.dragPoints, () => new RenderVertex(), CatmullCurve2D.fromVertex2D)
		const texCoords = DragPoint.getTextureCoords(data.dragPoints, verts)
		const n = verts.length
		if (!n) return {}
		const bottom = data.heightBottom * table.getScaleZ() + table.getTableHeight()
		const top = data.heightTop * table.getScaleZ() + table.getTableHeight()

		this.buildSide(sideMesh, verts, texCoords, bottom, top, !!data.szSideImage)
		this.buildTop(topMesh, verts, table, top)
		const meshes: { top?: Mesh; side?: Mesh } = {}
		if (topMesh.vertices.length) meshes.top = topMesh
		if (top !== bottom) meshes.side = sideMesh
		return meshes
	}

	private buildSide(
		mesh: Mesh,
		verts: RenderVertex[],
		texCoords: number[],
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
				const next = i < n - 1 ? i + 1 : 0
				mesh.vertices[off]!.tu = texCoords[i]!
				mesh.vertices[off]!.tv = 1
				mesh.vertices[off + 1]!.tu = texCoords[i]!
				mesh.vertices[off + 1]!.tv = 0
				mesh.vertices[off + 2]!.tu = texCoords[next] ?? texCoords[0]!
				mesh.vertices[off + 2]!.tv = 0
				mesh.vertices[off + 3]!.tu = texCoords[next] ?? texCoords[0]!
				mesh.vertices[off + 3]!.tv = 1
			}
			off += 4
		}
		for (let i = 0; i < n; i++) {
			const offset = i * 6,
				base = i * 4
			mesh.indices[offset] = base
			mesh.indices[offset + 1] = base + 1
			mesh.indices[offset + 2] = base + 2
			mesh.indices[offset + 3] = base
			mesh.indices[offset + 4] = base + 2
			mesh.indices[offset + 5] = base + 3
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
			const point = verts[i]!
			mesh.vertices[i] = Object.assign(new Vertex3DNoTex2(), {
				x: point.x,
				y: point.y,
				z: zTop,
				tu: point.x * invW,
				tv: point.y * invH,
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
		Object.assign(this.state, state)
		this.applySideState(obj, state, renderApi, table)
		this.applyTopState(obj, state, renderApi, table)
		this.applyDropState(obj, state, renderApi, table)
	}

	private applyDropState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: SurfaceState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		if (state.isDropped === undefined) return
		// Dropped walls smash to a pancake: sides hidden, top at heightBottom+0.1.
		// Flipbook walls render nothing at all when dropped.
		// @see https://github.com/vpinball/vpinball/blob/master/src/parts/surface.cpp (Render, RenderWallsAtHeight)
		const side = renderApi.findInGroup(obj, `surface.side-${this.state.getName()}`)
		const top = renderApi.findInGroup(obj, `surface.top-${this.state.getName()}`)
		const matrix = Matrix3D.claim()
		if (state.isDropped) {
			renderApi.applyVisibility(false, side)
			if (this.data.isFlipbook) {
				renderApi.applyVisibility(false, top)
			} else {
				matrix.setTranslation(0, 0, (this.data.heightTop - this.data.heightBottom - 0.1) * table.getScaleZ())
				renderApi.applyMatrixToNode(matrix, top)
			}
		} else {
			renderApi.applyVisibility(this.state.isSideVisible, side)
			renderApi.applyVisibility(this.state.isTopVisible, top)
			renderApi.applyMatrixToNode(matrix, top)
		}
		Matrix3D.release(matrix)
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
