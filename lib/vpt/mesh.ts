// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Matrix3D } from '../math/matrix.js'
import { Vertex2D, Vertex3D } from '../math/vector.js'
import { type RenderVertex, type RenderVertex3D, Vertex3DNoTex2 } from '../util/vertex.js'
import type { FrameData } from './animation.js'

/** Mutable position + normal shared by mesh and animation vertices. */
interface MutableVertex {
	x: number
	y: number
	z: number
	nx: number
	ny: number
	nz: number
}

/** VPinball mesh. @see https://github.com/vpinball/vpinball/blob/master/src/math/Mesh.h */
export class Mesh {
	private static exportPrecision = 6

	public name = ''
	public vertices: Vertex3DNoTex2[] = []
	public animationFrames: FrameData[] = []
	public indices: number[] = []
	public faceIndexOffset = 0

	constructor(vertices: Vertex3DNoTex2[] | string = [], indices: number[] = []) {
		if (typeof vertices === 'string') this.name = vertices
		else this.vertices = vertices
		this.indices = indices
	}

	/** Creates mesh from raw arrays. */
	public static fromArray(vertices: number[][], indices: number[]): Mesh {
		const mesh = new Mesh()
		for (const v of vertices) mesh.vertices.push(Vertex3DNoTex2.fromArray(v))
		mesh.indices = indices
		return mesh
	}

	/** Creates mesh from JSON. */
	public static fromJson(data: { vertices: number[][]; indices: number[] }): Mesh {
		return Mesh.fromArray(data.vertices, data.indices)
	}

	/** Serializes mesh to OBJ. */
	public serializeToObj(description?: string): string {
		const lines: string[] = []
		this._writeObjectName(lines, description || this.name || '<name not set>')
		this._writeVertexInfo(lines)
		this._writeFaceInfoLong(lines)
		return lines.join('\n')
	}

	/** Transforms vertices and normals. */
	public transform(matrix: Matrix3D, normalMatrix?: Matrix3D, getZ?: (x: number) => number): this {
		const elements = matrix.elements
		const normalElements = (normalMatrix || matrix).elements
		for (const vert of this.vertices) {
			Mesh.transformPoint(vert, elements, getZ)
			Mesh.transformNormal(vert, normalElements)
		}
		for (const frame of this.animationFrames) {
			for (const frameVert of frame.frameVerts) {
				const vert = frameVert as unknown as MutableVertex
				Mesh.transformPoint(vert, elements, getZ)
				Mesh.transformNormal(vert, normalElements)
			}
		}
		return this
	}

	/** Applies a 4x4 transform to a vertex position (same arithmetic as Vector3.applyMatrix4). */
	private static transformPoint(vert: MutableVertex, elements: number[], getZ?: (x: number) => number): void {
		const { x, y, z } = vert
		const invW = 1 / (elements[3] * x + elements[7] * y + elements[11] * z + elements[15])
		vert.x = (elements[0] * x + elements[4] * y + elements[8] * z + elements[12]) * invW
		vert.y = (elements[1] * x + elements[5] * y + elements[9] * z + elements[13]) * invW
		const transformedZ = (elements[2] * x + elements[6] * y + elements[10] * z + elements[14]) * invW
		vert.z = getZ ? getZ(transformedZ) : transformedZ
	}

	/** Applies the 3x3 rotation part of a matrix to a vertex normal (no translation). */
	private static transformNormal(vert: MutableVertex, elements: number[]): void {
		const { nx, ny, nz } = vert
		vert.nx = elements[0] * nx + elements[4] * ny + elements[8] * nz
		vert.ny = elements[1] * nx + elements[5] * ny + elements[9] * nz
		vert.nz = elements[2] * nx + elements[6] * ny + elements[10] * nz
	}

	/** Translates mesh. */
	public makeTranslation(x: number, y: number, z: number): this {
		for (const v of this.vertices) {
			v.x += x
			v.y += y
			v.z += z
		}
		return this
	}

	/** Scales mesh. */
	public makeScale(x: number, y: number, z: number): this {
		for (const v of this.vertices) {
			v.x *= x
			v.y *= y
			v.z *= z
		}
		return this
	}

	/** Clones mesh. */
	public clone(name?: string): Mesh {
		const m = new Mesh()
		m.name = name || this.name
		m.vertices = this.vertices.map(v => v.clone())
		m.animationFrames = this.animationFrames.map(a => a.clone())
		m.indices = this.indices.slice()
		m.faceIndexOffset = this.faceIndexOffset
		return m
	}

	/** Computes vertex normals. */
	public static computeNormals(
		vertices: Vertex3DNoTex2[],
		numVertices: number,
		indices: number[],
		numIndices: number,
	): void {
		for (let i = 0; i < numVertices; i++) {
			const v = vertices[i]
			v.nx = v.ny = v.nz = 0
		}
		for (let i = 0; i < numIndices; i += 3) {
			const A = vertices[indices[i]],
				B = vertices[indices[i + 1]],
				C = vertices[indices[i + 2]]
			const e0 = Vertex3D.claim(B.x - A.x, B.y - A.y, B.z - A.z)
			const e1 = Vertex3D.claim(C.x - A.x, C.y - A.y, C.z - A.z)
			const n = Vertex3D.crossProduct(e0, e1, true).normalize()
			A.nx += n.x
			A.ny += n.y
			A.nz += n.z
			B.nx += n.x
			B.ny += n.y
			B.nz += n.z
			C.nx += n.x
			C.ny += n.y
			C.nz += n.z
			Vertex3D.release(e0, e1, n)
		}
		for (let i = 0; i < numVertices; i++) {
			const v = vertices[i]
			const l = v.nx * v.nx + v.ny * v.ny + v.nz * v.nz
			const inv = l ? 1 / Math.sqrt(l) : 0
			v.nx *= inv
			v.ny *= inv
			v.nz *= inv
		}
	}

	/** Sets flat normal for polygon. */
	public static setNormal(rgv: Vertex3DNoTex2[], rgi: number[], count: number, applyCount = 0): void {
		if (applyCount === 0) applyCount = count
		const n = new Vertex3D()
		for (let i = 0; i < count; i++) {
			const l = rgi[i],
				m = rgi[i < count - 1 ? i + 1 : 0]
			n.x += (rgv[l].y - rgv[m].y) * (rgv[l].z + rgv[m].z)
			n.y += (rgv[l].z - rgv[m].z) * (rgv[l].x + rgv[m].x)
			n.z += (rgv[l].x - rgv[m].x) * (rgv[l].y + rgv[m].y)
		}
		n.normalize()
		for (let i = 0; i < applyCount; i++) {
			const v = rgv[rgi[i]]
			v.nx = n.x
			v.ny = n.y
			v.nz = n.z
		}
	}

	/** Finds closest point on polygon to pvin. */
	public static closestPointOnPolygon(rgv: RenderVertex3D[], pvin: Vertex2D, fClosed: boolean): [Vertex2D, number] {
		const count = rgv.length
		let mindist = Infinity
		let piSeg = -1 // in case we are not next to the line
		const pvOut = new Vertex2D()
		let cloop = count
		if (!fClosed) {
			--cloop // Don't check segment running from the end point to the beginning point
		}

		for (let i = 0; i < cloop; ++i) {
			const p2 = i < count - 1 ? i + 1 : 0

			const start = rgv[i]
			const end = rgv[p2]
			const lineA = start.y - end.y
			const lineB = end.x - start.x
			const lineC = -(lineA * start.x + lineB * start.y)

			const dist = Math.abs(lineA * pvin.x + lineB * pvin.y + lineC) / Math.sqrt(lineA * lineA + lineB * lineB)

			if (dist < mindist) {
				const perpA = -lineB
				const perpC = -(perpA * pvin.x + lineA * pvin.y)

				const det = lineA * lineA - lineB * perpA
				const invDet = det !== 0.0 ? 1.0 / det : 0.0
				const intersectX = (lineB * perpC - lineA * lineC) * invDet
				const intersectY = (lineC * perpA - lineA * perpC) * invDet

				if (
					intersectX >= Math.min(start.x, end.x) - 0.1 &&
					intersectX <= Math.max(start.x, end.x) + 0.1 &&
					intersectY >= Math.min(start.y, end.y) - 0.1 &&
					intersectY <= Math.max(start.y, end.y) + 0.1
				) {
					mindist = dist
					pvOut.x = intersectX
					pvOut.y = intersectY
					piSeg = i
				}
			}
		}
		return [pvOut, piSeg]
	}

	private static findCornerVertex(vertices: Vertex2D[]): number {
		let minVertex = -1
		let minY = Infinity
		let minXAtMinY = Infinity
		for (let i = 0; i < vertices.length; i++) {
			const v = vertices[i]!
			if (v.y > minY) continue
			if (v.y === minY && v.x >= minXAtMinY) continue
			minVertex = i
			minY = v.y
			minXAtMinY = v.x
		}
		return minVertex
	}

	private static wrapAt(i: number, n: number): number {
		return (i + n) % n
	}

	private static determineWindingOrder(vertices: Vertex2D[]): 'Clockwise' | 'CounterClockwise' {
		let nVerts = vertices.length
		if (nVerts > 1) {
			const last = vertices[nVerts - 1]!
			const first = vertices[0]!
			if (last.x === first.x && last.y === first.y) nVerts--
		}
		if (nVerts < 3) return 'CounterClockwise'
		const iMin = Mesh.findCornerVertex(vertices.slice(0, nVerts))
		const a = vertices[Mesh.wrapAt(iMin - 1, nVerts)]!
		const b = vertices[iMin]!
		const c = vertices[Mesh.wrapAt(iMin + 1, nVerts)]!
		const det = b.x * c.y + a.x * b.y + a.y * c.x - (a.y * b.x + b.y * c.x + a.x * c.y)
		return det > 0 ? 'Clockwise' : 'CounterClockwise'
	}

	/** Triangulates polygon via ear clipping. */
	public static polygonToTriangles(rgv: RenderVertex[], pvpoly: number[]): number[] {
		const pvtri: number[] = []
		if (pvpoly.length < 3) return pvtri
		const poly = pvpoly.slice()
		if (poly.length > 3) {
			const polyVerts: Vertex2D[] = poly.map(i => rgv[i]! as unknown as Vertex2D)
			if (Mesh.determineWindingOrder(polyVerts) === 'Clockwise') poly.reverse()
		}
		while (poly.length > 3) {
			let found = false
			for (let i = 0; i < poly.length; i++) {
				const s = poly.length
				const a = poly[i]!,
					b = poly[(i + 1) % s]!,
					c = poly[(i + 2) % s]!
				const pre = poly[(i - 1 + s) % s]!,
					post = poly[(i + 3) % s]!
				if (Mesh.advancePoint(rgv, poly, a, b, c, pre, post)) {
					pvtri.push(a, c, b)
					poly.splice((i + 1) % s, 1)
					found = true
					break
				}
			}
			if (!found) break
		}
		if (poly.length === 3) pvtri.push(poly[0], poly[2], poly[1])
		return pvtri
	}

	private static advancePoint(
		rgv: RenderVertex[],
		pvpoly: number[],
		a: number,
		b: number,
		c: number,
		pre: number,
		post: number,
	): boolean {
		const pv1 = rgv[a],
			pv2 = rgv[b],
			pv3 = rgv[c],
			pvPre = rgv[pre],
			pvPost = rgv[post]
		if (Mesh.getDot(pv1, pv2, pv3) < 0) return false
		if (Mesh.getDot(pvPre, pv1, pv2) > 0 && Mesh.getDot(pvPre, pv1, pv3) < 0) return false
		if (Mesh.getDot(pv2, pv3, pvPost) > 0 && Mesh.getDot(pv1, pv3, pvPost) < 0) return false
		const minx = Math.min(pv1.x, pv3.x),
			maxx = Math.max(pv1.x, pv3.x)
		const miny = Math.min(pv1.y, pv3.y),
			maxy = Math.max(pv1.y, pv3.y)
		for (let i = 0; i < pvpoly.length; i++) {
			const c1 = rgv[pvpoly[i]],
				c2 = rgv[pvpoly[i < pvpoly.length - 1 ? i + 1 : 0]]
			// Deliberate divergence: upstream tests pvCross2->y <= maxx (MeshUtils.h AdvancePoint),
			// a copy-paste typo mixing y against the x bound; port tests c2.x (strictly more correct).
			if (
				c1 !== pv1 &&
				c2 !== pv1 &&
				c1 !== pv3 &&
				c2 !== pv3 &&
				(c1.y >= miny || c2.y >= miny) &&
				(c1.y <= maxy || c2.y <= maxy) &&
				(c1.x >= minx || c2.x >= minx) &&
				(c1.x <= maxx || c2.x <= maxx) &&
				Mesh.fLinesIntersect(pv1, pv3, c1, c2)
			)
				return false
		}
		return true
	}

	private static getDot(a: Vertex2D, j: Vertex2D, b: Vertex2D): number {
		return (j.x - a.x) * (j.y - b.y) - (j.y - a.y) * (j.x - b.x)
	}

	private static fLinesIntersect(a1: Vertex2D, a2: Vertex2D, b1: Vertex2D, b2: Vertex2D): boolean {
		const x1 = a1.x,
			y1 = a1.y,
			x2 = a2.x,
			y2 = a2.y,
			x3 = b1.x,
			y3 = b1.y,
			x4 = b2.x,
			y4 = b2.y
		const d123 = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)
		if (d123 === 0) return x3 >= Math.min(x1, x2) && x3 <= Math.max(x2, x1)
		const d124 = (x2 - x1) * (y4 - y1) - (x4 - x1) * (y2 - y1)
		if (d124 === 0) return x4 >= Math.min(x1, x2) && x4 <= Math.max(x2, x1)
		if (d123 * d124 >= 0) return false
		const d341 = (x3 - x1) * (y4 - y1) - (x4 - x1) * (y3 - y1)
		if (d341 === 0) return x1 >= Math.min(x3, x4) && x1 <= Math.max(x3, x4)
		const d342 = d123 - d124 + d341
		if (d342 === 0) return x2 >= Math.min(x3, x4) && x2 <= Math.max(x3, x4)
		return d341 * d342 < 0
	}

	private _writeObjectName(out: string[], name: string): void {
		out.push(`o ${name}`)
	}

	private _writeVertexInfo(out: string[]): void {
		for (const v of this.vertices)
			out.push(
				`v ${v.x.toFixed(Mesh.exportPrecision)} ${v.y.toFixed(Mesh.exportPrecision)} ${v.z.toFixed(Mesh.exportPrecision)}`,
			)
		for (const v of this.vertices)
			out.push(
				`vt ${(v.tu ?? 0).toFixed(Mesh.exportPrecision)} ${(1 - (v.tv ?? 0)).toFixed(Mesh.exportPrecision)}`,
			)
		for (const v of this.vertices)
			out.push(
				`vn ${v.nx.toFixed(Mesh.exportPrecision)} ${v.ny.toFixed(Mesh.exportPrecision)} ${v.nz.toFixed(Mesh.exportPrecision)}`,
			)
	}

	private _writeFaceInfoLong(out: string[]): void {
		for (let i = 0; i < this.indices.length; i += 3) {
			const corners = [this.indices[i + 2], this.indices[i + 1], this.indices[i]].map(index => {
				const oneBased = index + 1 + this.faceIndexOffset
				return `${oneBased}/${oneBased}/${oneBased}`
			})
			out.push(`f ${corners.join(' ')}`)
		}
	}
}
