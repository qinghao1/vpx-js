// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex3D } from './vector.js'

/** Minimal vector contract. */
export interface Vertex {
	x: number
	y: number
	clone(): Vertex
	sub(v: any): this
	length(): number
}

/** Vertex with editor flags. */
export interface IRenderVertex {
	x: number
	y: number
	fSmooth: boolean
	fSlingshot: boolean
	fControlPoint: boolean
	isVector3: boolean
	set(x: number, y: number, z?: number): this
}

export class Vertex3DNoTex2 {
	static readonly size = 32
	x = 0
	y = 0
	z = 0
	nx = 0
	ny = 0
	nz = 0
	tu = 0
	tv = 0

	static get(buffer: Uint8Array, pos: number): Vertex3DNoTex2 {
		const off = pos * Vertex3DNoTex2.size
		const v = new Vertex3DNoTex2()
		try {
			const f32 = new Float32Array(buffer.buffer, buffer.byteOffset + off, 8)
			v.x = f32[0]!
			v.y = f32[1]!
			v.z = f32[2]!
			v.nx = f32[3]!
			v.ny = f32[4]!
			v.nz = f32[5]!
			v.tu = f32[6]!
			v.tv = f32[7]!
			return v
		} catch {}
		const d = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		v.x = d.getFloat32(off, true)
		v.y = d.getFloat32(off + 4, true)
		v.z = d.getFloat32(off + 8, true)
		v.nx = d.getFloat32(off + 12, true)
		v.ny = d.getFloat32(off + 16, true)
		v.nz = d.getFloat32(off + 20, true)
		v.tu = d.getFloat32(off + 24, true)
		v.tv = d.getFloat32(off + 28, true)
		return v
	}

	getVertex(): Vertex3D {
		return new Vertex3D(this.x, this.y, this.z)
	}

	clone(): Vertex3DNoTex2 {
		return Object.assign(new Vertex3DNoTex2(), this)
	}

	hasTextureCoordinates(): boolean {
		return this.tu !== undefined && this.tv !== undefined
	}

	static from(data: Record<string, unknown> | Vertex3DNoTex2): Vertex3DNoTex2 {
		return Object.assign(new Vertex3DNoTex2(), data)
	}

	static fromArray(a: number[]): Vertex3DNoTex2 {
		const v = new Vertex3DNoTex2()
		v.x = a[0]!
		v.y = a[1]!
		v.z = a[2]!
		v.nx = a[3]!
		v.ny = a[4]!
		v.nz = a[5]!
		v.tu = a[6]!
		v.tv = a[7]!
		return v
	}
}
