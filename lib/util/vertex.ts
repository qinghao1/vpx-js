// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex2D, Vertex3D } from '../math/vector.js'

/** Minimal vector contract. */
export interface Vertex {
	x: number
	y: number
	distanceTo(other: { x: number; y: number }): number
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
		const vertex = new Vertex3DNoTex2()
		const data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		vertex.x = data.getFloat32(off, true)
		vertex.y = data.getFloat32(off + 4, true)
		vertex.z = data.getFloat32(off + 8, true)
		vertex.nx = data.getFloat32(off + 12, true)
		vertex.ny = data.getFloat32(off + 16, true)
		vertex.nz = data.getFloat32(off + 20, true)
		vertex.tu = data.getFloat32(off + 24, true)
		vertex.tv = data.getFloat32(off + 28, true)
		return vertex
	}

	getVertex(): Vertex3D {
		return new Vertex3D(this.x, this.y, this.z)
	}

	clone(): Vertex3DNoTex2 {
		return Object.assign(new Vertex3DNoTex2(), this)
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

export class RenderVertex extends Vertex2D {
	fSmooth = false
	fSlingshot = false
	fControlPoint = false
}

export class RenderVertex3D extends Vertex3D {
	fSmooth = false
	fSlingshot = false
	fControlPoint = false
}
