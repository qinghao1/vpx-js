// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { FLT_MAX, FLT_MIN } from '../vpt/mesh.js'
import { f4 } from './float.js'

/** Progressive mesh decimation — Stan Melax.
 * @see https://github.com/vpinball/vpinball/blob/master/progressive.h */
const vertices: ProgMeshVertex[] = []
const triangles: ProgMeshTriangle[] = []

export class ProgMeshTriangle {
	private vertex: ProgMeshVertex[] = []
	public normal!: ProgMeshFloat3

	constructor(v0: ProgMeshVertex, v1: ProgMeshVertex, v2: ProgMeshVertex) {
		assert(v0 !== v1 && v1 !== v2 && v2 !== v0, 'Vertices must be distinct')
		this.vertex = [v0, v1, v2]
		this.computeNormal()
		triangles.push(this)
		for (let i = 0; i < 3; i++) {
			this.vertex[i].face.push(this)
			for (let j = 0; j < 3; j++) if (i !== j) addUnique(this.vertex[i].neighbor, this.vertex[j])
		}
	}

	private computeNormal(): void {
		const [a, b, c] = [this.vertex[0].position, this.vertex[1].position, this.vertex[2].position]
		this.normal = cross(b.sub(a), c.sub(b))
		const l = magnitude(this.normal)
		if (l > FLT_MIN) this.normal = this.normal.divideScalar(l)
	}

	public hasVertex(v: ProgMeshVertex): boolean {
		return v === this.vertex[0] || v === this.vertex[1] || v === this.vertex[2]
	}

	public destroy(): void {
		removeFillWithBack(triangles, this)
		for (let i = 0; i < 3; i++) if (this.vertex[i]) removeFillWithBack(this.vertex[i].face, this)
		for (let i = 0; i < 3; i++) {
			const j = (i + 1) % 3
			if (this.vertex[i] && this.vertex[j]) {
				this.vertex[i].removeIfNonNeighbor(this.vertex[j])
				this.vertex[j].removeIfNonNeighbor(this.vertex[i])
			}
		}
	}

	public replaceVertex(oldV: ProgMeshVertex, newV: ProgMeshVertex): void {
		assert(!!oldV && !!newV, 'Arguments must not be null')
		const idx = this.vertex.indexOf(oldV)
		assert(idx !== -1, 'oldV must be in triangle')
		assert(!this.vertex.includes(newV), 'newV must not be in triangle')
		this.vertex[idx] = newV
		removeFillWithBack(oldV.face, this)
		assert(!newV.face.includes(this), 'newV must not already contain this')
		newV.face.push(this)
		for (let i = 0; i < 3; i++) {
			oldV.removeIfNonNeighbor(this.vertex[i])
			this.vertex[i].removeIfNonNeighbor(oldV)
		}
		for (let i = 0; i < 3; i++) {
			assert(this.vertex[i].face.filter((f) => f === this).length === 1, 'face count must be 1')
			for (let j = 0; j < 3; j++) if (i !== j) addUnique(this.vertex[i].neighbor, this.vertex[j])
		}
		this.computeNormal()
	}
}

/** Vertex with adjacency for decimation. */
export class ProgMeshVertex {
	public position: ProgMeshFloat3
	public id: number
	public neighbor: ProgMeshVertex[] = []
	public face: ProgMeshTriangle[] = []
	public objdist?: number
	public collapse?: ProgMeshVertex

	constructor(v: ProgMeshFloat3, id: number) {
		this.position = v
		this.id = id
		vertices.push(this)
	}

	public destroy(): void {
		assert(this.face.length === 0, 'face must be empty')
		while (this.neighbor.length) {
			removeFillWithBack(this.neighbor[0].neighbor, this)
			removeFillWithBack(this.neighbor, this.neighbor[0])
		}
		removeFillWithBack(vertices, this)
	}

	public removeIfNonNeighbor(n: ProgMeshVertex): void {
		if (!this.neighbor.includes(n)) return
		for (const f of this.face) if (f.hasVertex(n)) return
		removeFillWithBack(this.neighbor, n)
	}
}

export class ProgMeshFloat3 {
	constructor(
		public x: number,
		public y: number,
		public z: number,
	) {}
	public sub(b: ProgMeshFloat3): ProgMeshFloat3 {
		return new ProgMeshFloat3(f4(this.x - b.x), f4(this.y - b.y), f4(this.z - b.z))
	}
	public multiplyScalar(s: number): ProgMeshFloat3 {
		return new ProgMeshFloat3(f4(this.x * s), f4(this.y * s), f4(this.z * s))
	}
	public divideScalar(s: number): ProgMeshFloat3 {
		return this.multiplyScalar(f4(1 / s))
	}
}

export class ProgMeshTriData {
	constructor(public readonly v: number[]) {}
}

function removeFillWithBack<T>(c: T[], t: T): void {
	const i = c.indexOf(t)
	const last = c.pop()
	if (i === c.length) return
	c[i] = last!
	assert(!c.includes(t), 'List must not include value anymore')
}

/** Collapse mesh to decimation order — returns `[map, permutation]`. */
export function progressiveMesh(vert: ProgMeshFloat3[], tri: ProgMeshTriData[]): [number[], number[]] {
	if (!vert.length || !tri.length) return [[], []]
	addVertex(vert)
	addFaces(tri)
	computeAllEdgeCollapseCosts()
	const permutation: number[] = []
	const map: number[] = []
	while (vertices.length) {
		const mn = minimumCostEdge()
		permutation[mn.id] = vertices.length - 1
		map[vertices.length - 1] = mn.collapse ? mn.collapse.id : 4294967295
		collapse(mn, mn.collapse)
	}
	for (let i = 0; i < map.length; i++) map[i] = map[i] === 4294967295 ? 0 : permutation[map[i]]
	assert(!vertices.length, 'vertices must be empty')
	assert(!triangles.length, 'triangles must be empty')
	return [map, permutation]
}

export function permuteVertices<T>(permutation: number[], vert: T[], tri: ProgMeshTriData[]): void {
	const tmp = vert.slice()
	for (let i = 0; i < vert.length; i++) vert[permutation[i]] = tmp[i]
	for (const t of tri) for (let j = 0; j < 3; j++) t.v[j] = permutation[t.v[j]]
}

export function remapIndices(
	numVertices: number,
	triDatas: ProgMeshTriData[],
	newTri: ProgMeshTriData[],
	map: number[],
): void {
	assert(!newTri.length, 'newTri must be empty')
	assert(map.length !== 0, 'map must not be empty')
	assert(numVertices !== 0, 'numVertices must not be 0')
	for (const tri of triDatas) {
		const t = new ProgMeshTriData([
			mapVertex(tri.v[0], numVertices, map),
			mapVertex(tri.v[1], numVertices, map),
			mapVertex(tri.v[2], numVertices, map),
		])
		if (t.v[0] === t.v[1] || t.v[1] === t.v[2] || t.v[2] === t.v[0]) continue
		newTri.push(t)
	}
}

function computeAllEdgeCollapseCosts(): void {
	for (const v of vertices) computeEdgeCostAtVertex(v)
}

function computeEdgeCostAtVertex(v: ProgMeshVertex): void {
	if (!v.neighbor.length) {
		v.collapse = undefined
		v.objdist = f4(-0.01)
		return
	}
	v.objdist = FLT_MAX
	v.collapse = undefined
	for (const n of v.neighbor) {
		const d = computeEdgeCollapseCost(v, n)
		if (d < v.objdist) {
			v.collapse = n
			v.objdist = d
		}
	}
}

function computeEdgeCollapseCost(u: ProgMeshVertex, v: ProgMeshVertex): number {
	const sides = u.face.filter((f) => f.hasVertex(v))
	let curvature = 0
	for (const face of u.face) {
		let minCurve = 1
		for (const side of sides) minCurve = Math.min(f4(minCurve), f4(f4(1 - dot(face.normal, side.normal)) * 0.5))
		curvature = Math.max(curvature, minCurve)
	}
	return f4(magnitude(v.position.sub(u.position)) * curvature)
}

function minimumCostEdge(): ProgMeshVertex {
	let mn = vertices[0]
	for (const vert of vertices) if (vert.objdist! < mn.objdist!) mn = vert
	return mn
}

function collapse(u: ProgMeshVertex, v?: ProgMeshVertex): void {
	if (!v) {
		u.destroy()
		return
	}
	const tmp = [...u.neighbor]
	let i = u.face.length
	while (i--) if (u.face[i].hasVertex(v)) u.face[i].destroy()
	i = u.face.length
	while (i--) u.face[i].replaceVertex(u, v)
	u.destroy()
	for (const t of tmp) computeEdgeCostAtVertex(t)
}

function addVertex(vert: ProgMeshFloat3[]): void {
	for (let i = 0; i < vert.length; i++) new ProgMeshVertex(vert[i], i)
}

function addFaces(tri: ProgMeshTriData[]): void {
	for (const t of tri) new ProgMeshTriangle(vertices[t.v[0]], vertices[t.v[1]], vertices[t.v[2]])
}

function addUnique<T>(c: T[], t: T): void {
	if (!c.includes(t)) c.push(t)
}

function cross(a: ProgMeshFloat3, b: ProgMeshFloat3): ProgMeshFloat3 {
	return new ProgMeshFloat3(f4(a.y * b.z - a.z * b.y), f4(a.z * b.x - a.x * b.z), f4(a.x * b.y - a.y * b.x))
}

function magnitude(v: ProgMeshFloat3): number {
	return f4(Math.sqrt(dot(v, v)))
}

function dot(a: ProgMeshFloat3, b: ProgMeshFloat3): number {
	return f4(a.x * b.x + a.y * b.y + a.z * b.z)
}

function mapVertex(a: number, mx: number, map: number[]): number {
	while (a >= mx) a = map[a]
	return a
}

function assert(ok: boolean, msg: string): void {
	if (!ok) throw new Error(msg)
}
