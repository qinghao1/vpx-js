// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex3DNoTex2 } from '../../math/vertex.js'
import {
	type BufferGeometry,
	Float32BufferAttribute,
	Line,
	Matrix3,
	type Object3D,
	Mesh as ThreeMesh,
	Vector2,
	Vector3,
} from '../../refs.node.js'
import { Pool } from '../../util/object-pool.js'
import type { Mesh } from '../../vpt/mesh.js'
import { ThreeRenderApi } from './three-render-api.js'

/** Converts VPinball meshes to Three.js BufferGeometries. */
export class ThreeMeshGenerator {
	private readonly face = [new Array(3), new Array(3), new Array(3)]

	public convertToBufferGeometry(mesh: Mesh): BufferGeometry {
		const s = ParserState.claim(mesh.name)
		for (const v of mesh.vertices) {
			s.vertices.push(v.x, v.y, v.z)
			s.normals.push(v.nx, v.ny, v.nz)
			if (v.hasTextureCoordinates()) s.uvs.push(v.tu, 1 - v.tv)
		}
		for (let i = 0; i < mesh.indices.length; i += 3) {
			const a = mesh.indices[i + 2] + 1,
				b = mesh.indices[i + 1] + 1,
				c = mesh.indices[i] + 1
			for (let k = 0; k < 3; k++) {
				this.face[0][k] = a
				this.face[1][k] = b
				this.face[2][k] = c
			}
			const v1 = this.face[0]
			for (let j = 1; j < 2; j++) {
				const v2 = this.face[j],
					v3 = this.face[j + 1]
				s.addFace(v1[0], v2[0], v3[0], v1[1], v2[1], v3[1], v1[2], v2[2], v3[2])
			}
		}
		const g = s.object.geometry,
			bg = ThreeRenderApi.POOL.BufferGeometry.get()
		bg.name = mesh.name
		bg.setAttribute('position', RecyclableFloat32BufferAttribute.claim(g.vertices, 3))
		if (g.normals.length) bg.setAttribute('normal', RecyclableFloat32BufferAttribute.claim(g.normals, 3))
		else bg.computeVertexNormals()
		if (g.uvs.length) bg.setAttribute('uv', RecyclableFloat32BufferAttribute.claim(g.uvs, 2))
		ParserState.release(s)
		return bg
	}
}

class ParserState {
	public static readonly POOL = new Pool(ParserState)
	public object!: ParserObject
	public readonly vertices: number[] = []
	public readonly normals: number[] = []
	public readonly uvs: number[] = []

	public static claim(name: string): ParserState {
		return ParserState.POOL.get().set(name)
	}
	public static release(...s: ParserState[]) {
		for (const st of s) ParserState.POOL.release(st)
	}
	public set(name: string): this {
		this.object = ParserObject.claim(name)
		return this
	}
	public static reset(s: ParserState): void {
		s.vertices.length = 0
		s.normals.length = 0
		s.uvs.length = 0
		ParserObject.release(s.object)
	}

	public addFace(
		a: number,
		b: number,
		c: number,
		ua: number,
		ub: number,
		uc: number,
		na: number,
		nb: number,
		nc: number,
	): void {
		const vLen = this.vertices.length
		let ia = this.parseVertexIndex(a, vLen),
			ib = this.parseVertexIndex(b, vLen),
			ic = this.parseVertexIndex(c, vLen)
		this.addVertex(ia, ib, ic)
		if (ua !== undefined) {
			const uvLen = this.uvs.length
			ia = this.parseUVIndex(ua, uvLen)
			ib = this.parseUVIndex(ub, uvLen)
			ic = this.parseUVIndex(uc, uvLen)
			this.addUV(ia, ib, ic)
		}
		if (na !== undefined) {
			const nLen = this.normals.length
			ia = this.parseNormalIndex(na, nLen)
			ib = na === nb ? ia : this.parseNormalIndex(nb, nLen)
			ic = na === nc ? ia : this.parseNormalIndex(nc, nLen)
			this.addNormal(ia, ib, ic)
		}
	}

	private addUV(a: number, b: number, c: number): void {
		const s = this.uvs,
			d = this.object.geometry.uvs
		d.push(s[a], s[a + 1], s[b], s[b + 1], s[c], s[c + 1])
	}
	private parseVertexIndex(i: number, len: number): number {
		return (i >= 0 ? i - 1 : i + len / 3) * 3
	}
	private parseNormalIndex(i: number, len: number): number {
		return (i >= 0 ? i - 1 : i + len / 3) * 3
	}
	private parseUVIndex(i: number, len: number): number {
		return (i >= 0 ? i - 1 : i + len / 2) * 2
	}
	private addVertex(a: number, b: number, c: number): void {
		const s = this.vertices,
			d = this.object.geometry.vertices
		d.push(s[a], s[a + 1], s[a + 2], s[b], s[b + 1], s[b + 2], s[c], s[c + 1], s[c + 2])
	}
	private addNormal(a: number, b: number, c: number): void {
		const s = this.normals,
			d = this.object.geometry.normals
		d.push(s[a], s[a + 1], s[a + 2], s[b], s[b + 1], s[b + 2], s[c], s[c + 1], s[c + 2])
	}
}

class ParserObject {
	public static readonly POOL = new Pool(ParserObject)
	public name!: string
	public geometry: Record<string, number[]> = { vertices: [], normals: [], uvs: [] }
	public smooth = false

	public static claim(name: string): ParserObject {
		return ParserObject.POOL.get().set(name)
	}
	public static release(...o: ParserObject[]) {
		for (const st of o) ParserObject.POOL.release(st)
	}
	public static reset(po: ParserObject): void {
		po.geometry.vertices.length = 0
		po.geometry.normals.length = 0
		po.geometry.uvs.length = 0
		po.smooth = false
	}
	public set(name: string): this {
		this.name = name
		return this
	}
}

export function releaseGeometry(g: BufferGeometry): void {
	for (const n of Object.keys(g.attributes)) {
		const attr = g.getAttribute(n) as Float32BufferAttribute
		RecyclableFloat32BufferAttribute.release(attr)
	}
	g.dispose()
	ThreeRenderApi.POOL.BufferGeometry.release(g)
}

class RecyclableFloat32BufferAttribute extends Float32BufferAttribute {
	public static readonly POOL = new Pool(RecyclableFloat32BufferAttribute as any)
	public static claim(array: number[], itemSize: number): RecyclableFloat32BufferAttribute {
		const attr = RecyclableFloat32BufferAttribute.POOL.get()
		attr.array = new Float32Array(array)
		;(attr as any).itemSize = itemSize
		attr.needsUpdate = true
		return attr
	}
	public static release(...attrs: RecyclableFloat32BufferAttribute[]) {
		for (const a of attrs) RecyclableFloat32BufferAttribute.POOL.release(a)
	}
	public static reset(a: RecyclableFloat32BufferAttribute): void {
		a.array = new Float32Array(0)
		;(a as any).itemSize = 3
		a.needsUpdate = false
	}
}
