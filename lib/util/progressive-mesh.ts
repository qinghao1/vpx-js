// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { FLT_MAX, FLT_MIN, f4 } from './float.js'

/** Progressive mesh decimation (Stan Melax). @see https://github.com/vpinball/vpinball/blob/master/progressive.h */
const vertices: ProgMeshVertex[] = []
const triangles: ProgMeshTriangle[] = []

/** Triangle with adjacency. */
export class ProgMeshTriangle {
	private vertices: ProgMeshVertex[]
	normal!: ProgMeshFloat3

	constructor(v0: ProgMeshVertex, v1: ProgMeshVertex, v2: ProgMeshVertex) {
		if (v0 === v1 || v1 === v2 || v2 === v0) throw new Error('Vertices must be distinct')
		this.vertices = [v0, v1, v2]
		this.computeNormal()
		triangles.push(this)
		for (let i = 0; i < 3; i++) {
			this.vertices[i].face.push(this)
			for (let j = 0; j < 3; j++) if (i !== j) addUnique(this.vertices[i].neighbor, this.vertices[j])
		}
	}

	private computeNormal(): void {
		const [a, b, c] = this.vertices.map((v) => v.position)
		this.normal = cross(b.sub(a), c.sub(b))
		const len = magnitude(this.normal)
		if (len > FLT_MIN) this.normal = this.normal.divideScalar(len)
	}

	/** Whether triangle contains vertex. */
	hasVertex(v: ProgMeshVertex): boolean {
		return this.vertices.includes(v)
	}

	/** Removes triangle and updates adjacency. */
	destroy(): void {
		removeFillWithBack(triangles, this)
		for (let i = 0; i < 3; i++) if (this.vertices[i]) removeFillWithBack(this.vertices[i].face, this)
		for (let i = 0; i < 3; i++) {
			const j = (i + 1) % 3
			if (this.vertices[i] && this.vertices[j]) {
				this.vertices[i].removeIfNonNeighbor(this.vertices[j])
				this.vertices[j].removeIfNonNeighbor(this.vertices[i])
			}
		}
	}

	/** Replaces oldV with newV in triangle. */
	replaceVertex(oldV: ProgMeshVertex, newV: ProgMeshVertex): void {
		const idx = this.vertices.indexOf(oldV)
		if (idx === -1) throw new Error('oldV not in triangle')
		if (this.vertices.includes(newV)) throw new Error('newV already in triangle')
		this.vertices[idx] = newV
		removeFillWithBack(oldV.face, this)
		if (newV.face.includes(this)) throw new Error('newV already contains triangle')
		newV.face.push(this)
		for (let i = 0; i < 3; i++) {
			oldV.removeIfNonNeighbor(this.vertices[i])
			this.vertices[i].removeIfNonNeighbor(oldV)
		}
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) if (i !== j) addUnique(this.vertices[i].neighbor, this.vertices[j])
		}
		this.computeNormal()
	}
}

/** Vertex with adjacency for decimation. */
export class ProgMeshVertex {
	neighbor: ProgMeshVertex[] = []
	face: ProgMeshTriangle[] = []
	objdist?: number
	collapse?: ProgMeshVertex

	constructor(
		public position: ProgMeshFloat3,
		public id: number,
	) {
		vertices.push(this)
	}

	/** Destroys isolated vertex. */
	destroy(): void {
		if (this.face.length) throw new Error('face must be empty')
		while (this.neighbor.length) {
			removeFillWithBack(this.neighbor[0].neighbor, this)
			removeFillWithBack(this.neighbor, this.neighbor[0])
		}
		removeFillWithBack(vertices, this)
	}

	/** Removes neighbor if no shared face. */
	removeIfNonNeighbor(n: ProgMeshVertex): void {
		if (!this.neighbor.includes(n)) return
		for (const f of this.face) if (f.hasVertex(n)) return
		removeFillWithBack(this.neighbor, n)
	}
}

/** Simple 3D float. */
export class ProgMeshFloat3 {
	constructor(
		public x: number,
		public y: number,
		public z: number,
	) {}

	sub(b: ProgMeshFloat3): ProgMeshFloat3 {
		return new ProgMeshFloat3(f4(this.x - b.x), f4(this.y - b.y), f4(this.z - b.z))
	}
	multiplyScalar(s: number): ProgMeshFloat3 {
		return new ProgMeshFloat3(f4(this.x * s), f4(this.y * s), f4(this.z * s))
	}
	divideScalar(s: number): ProgMeshFloat3 {
		return this.multiplyScalar(f4(1 / s))
	}
}

/** Triangle index data. */
export class ProgMeshTriData {
	constructor(public readonly v: number[]) {}
}

function removeFillWithBack<T>(arr: T[], item: T): void {
	const i = arr.indexOf(item)
	const last = arr.pop()
	if (i === arr.length) return
	arr[i] = last!
}

/** Decimates mesh, returns [map, permutation]. */
export function progressiveMesh(vert: ProgMeshFloat3[], tri: ProgMeshTriData[]): [number[], number[]] {
	if (!vert.length || !tri.length) return [[], []]
	addVertex(vert)
	addFaces(tri)
	computeAllEdgeCollapseCosts()
	const perm: number[] = []
	const map: number[] = []
	while (vertices.length) {
		const v = minimumCostEdge()
		perm[v.id] = vertices.length - 1
		map[vertices.length - 1] = v.collapse ? v.collapse.id : 0xffffffff
		collapse(v, v.collapse)
	}
	for (let i = 0; i < map.length; i++) map[i] = map[i] === 0xffffffff ? 0 : perm[map[i]]
	return [map, perm]
}

/** Reorders vertices per permutation. */
export function permuteVertices<T>(perm: number[], vert: T[], tri: ProgMeshTriData[]): void {
	const tmp = vert.slice()
	for (let i = 0; i < vert.length; i++) vert[perm[i]] = tmp[i]
	for (const t of tri) for (let j = 0; j < 3; j++) t.v[j] = perm[t.v[j]]
}

/** Remaps indices via map. */
export function remapIndices(numVertices: number, src: ProgMeshTriData[], dst: ProgMeshTriData[], map: number[]): void {
	if (dst.length || !map.length || !numVertices) throw new Error('Invalid args')
	for (const tri of src) {
		const t = new ProgMeshTriData([
			mapVertex(tri.v[0], numVertices, map),
			mapVertex(tri.v[1], numVertices, map),
			mapVertex(tri.v[2], numVertices, map),
		])
		if (t.v[0] === t.v[1] || t.v[1] === t.v[2] || t.v[2] === t.v[0]) continue
		dst.push(t)
	}
}

function computeAllEdgeCollapseCosts(): void {
	for (const v of vertices) computeEdgeCostAtVertex(v)
}

function computeEdgeCostAtVertex(v: ProgMeshVertex): void {
	if (!v.neighbor.length) {
		v.collapse = undefined
		v.objdist = -0.01
		return
	}
	v.objdist = FLT_MAX
	v.collapse = undefined
	for (const n of v.neighbor) {
		const d = computeEdgeCollapseCost(v, n)
		if (d < v.objdist!) {
			v.collapse = n
			v.objdist = d
		}
	}
}

function computeEdgeCollapseCost(u: ProgMeshVertex, v: ProgMeshVertex): number {
	const sides = u.face.filter((f) => f.hasVertex(v))
	let curvature = 0
	for (const f of u.face) {
		let min = 1
		for (const s of sides) min = Math.min(min, f4((1 - dot(f.normal, s.normal)) * 0.5))
		curvature = Math.max(curvature, min)
	}
	return f4(magnitude(v.position.sub(u.position)) * curvature)
}

function minimumCostEdge(): ProgMeshVertex {
	return vertices.reduce((a, b) => (b.objdist! < a.objdist! ? b : a), vertices[0])
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

function addUnique<T>(arr: T[], v: T): void {
	if (!arr.includes(v)) arr.push(v)
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
