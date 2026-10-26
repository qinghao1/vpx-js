import { MathUtils } from 'three'
import { describe, expect, it } from 'vitest'
import { Matrix3D } from '../math/matrix.js'
import { RenderVertex, Vertex3DNoTex2 } from '../util/vertex.js'
import { Mesh } from './mesh.js'

function countLines(obj: string, prefix: string): number {
	return obj.split('\n').filter(line => line.startsWith(prefix)).length
}

function makeMixedUvMesh(): Mesh {
	const mesh = Mesh.fromArray(
		[
			[0, 0, 0, 0, 0, 1, 0.1, 0.2],
			[1, 0, 0, 0, 0, 1],
			[0, 1, 0, 0, 0, 1, 0.3, 0.4],
		],
		[0, 1, 2],
	)
	mesh.name = 'mixed'
	return mesh
}

describe('Mesh.serializeToObj', () => {
	it('emits one texture coordinate per vertex even when some vertices lack UVs', () => {
		const obj = makeMixedUvMesh().serializeToObj()
		expect(countLines(obj, 'v ')).toBe(3)
		expect(countLines(obj, 'vt ')).toBe(3)
		expect(countLines(obj, 'vn ')).toBe(3)
		expect(obj).toContain('vt 0.000000 1.000000')
	})

	it('keeps face texture indices aligned with vertex indices', () => {
		const obj = makeMixedUvMesh().serializeToObj()
		const vertexCount = countLines(obj, 'v ')
		const texCount = countLines(obj, 'vt ')
		const faceLines = obj.split('\n').filter(line => line.startsWith('f '))
		expect(faceLines.length).toBe(1)
		for (const face of faceLines) {
			const corners = face.split(' ').slice(1)
			expect(corners.length).toBe(3)
			for (const corner of corners) {
				const [vertex, texture, normal] = corner.split('/').map(Number)
				expect(vertex).toBeLessThanOrEqual(vertexCount)
				expect(texture).toBeLessThanOrEqual(texCount)
				expect(texture).toBe(vertex)
				expect(normal).toBe(vertex)
			}
		}
	})
})

function normalOf(points: Array<[number, number, number]>): Array<[number, number, number]> {
	const vertices = points.map(([x, y, z]) => {
		const vertex = new Vertex3DNoTex2()
		vertex.x = x
		vertex.y = y
		vertex.z = z
		return vertex
	})
	Mesh.computeNormals(vertices, vertices.length, [0, 1, 2], 3)
	return vertices.map(vertex => [vertex.nx, vertex.ny, vertex.nz])
}

describe('Mesh.computeNormals', () => {
	it('computes unit normals for a regular triangle', () => {
		expect(
			normalOf([
				[0, 0, 0],
				[1, 0, 0],
				[0, 1, 0],
			]),
		).toEqual([
			[0, 0, 1],
			[0, 0, 1],
			[0, 0, 1],
		])
	})

	it('emits zero normals instead of NaN for degenerate triangles', () => {
		for (const points of [
			[
				[0, 0, 0],
				[0, 0, 0],
				[0, 0, 0],
			],
			[
				[0, 0, 0],
				[1, 1, 1],
				[2, 2, 2],
			],
		] as Array<Array<[number, number, number]>>) {
			const normals = normalOf(points)
			expect(normals).toEqual([
				[0, 0, 0],
				[0, 0, 0],
				[0, 0, 0],
			])
			for (const [x, y, z] of normals) {
				expect(Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)).toBe(false)
			}
		}
	})
})

describe('Mesh.polygonToTriangles', () => {
	it('triangulates a concave polygon that the upstream x/y typo cannot complete', () => {
		// Upstream `AdvancePoint` (`external/vpinball/src/math/MeshUtils.h`) tests
		// `pvCross2->y <= maxx` where it means `pvCross2->x`; vpx-js fixes the typo.
		// With the typo this heptagon yields 3 triangles; fixed it yields all 5.
		const points: Array<[number, number]> = [
			[2, 7],
			[7, 0],
			[5, 6],
			[2, 8],
			[5, 9],
			[0, 8],
			[2, 5],
		]
		const vertices = points.map(([x, y]) => {
			const vertex = new RenderVertex()
			vertex.x = x
			vertex.y = y
			return vertex
		})
		const triangles = Mesh.polygonToTriangles(
			vertices,
			vertices.map((_, i) => i),
		)
		expect(triangles).toEqual([5, 3, 4, 5, 2, 3, 2, 0, 1, 5, 0, 2, 6, 0, 5])
	})
})

describe('Mesh.transform', () => {
	it('bakes row vertices and normals', () => {
		const mesh = new Mesh('test')
		mesh.vertices = [
			Object.assign(new Vertex3DNoTex2(), { x: 1, y: 0, z: 0, nx: 1, ny: 0, nz: 0 }),
			Object.assign(new Vertex3DNoTex2(), { x: 0, y: 1, z: 0, nx: 0, ny: 1, nz: 0 }),
		]
		mesh.indices = [0, 1, 0]
		const tr = new Matrix3D().setTranslation(10, 0, 0)
		mesh.transform(tr)
		const first = mesh.vertices[0]
		expect(first?.x).toBeCloseTo(11, 5)
		expect(first?.nx).toBeCloseTo(1, 5)
		const rot = new Matrix3D().rotateZMatrix(MathUtils.degToRad(90))
		const mesh2 = new Mesh('test2')
		mesh2.vertices = [Object.assign(new Vertex3DNoTex2(), { x: 1, y: 0, z: 0, nx: 1, ny: 0, nz: 0 })]
		mesh2.indices = [0, 0, 0]
		mesh2.transform(rot)
		const rotated = mesh2.vertices[0]
		expect(rotated?.x).toBeCloseTo(0, 5)
		expect(rotated?.y).toBeCloseTo(1, 5)
		expect(rotated?.nx).toBeCloseTo(0, 5)
		expect(rotated?.ny).toBeCloseTo(1, 5)
	})
})
