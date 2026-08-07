// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { f4 } from './float.js'
import { Vertex3D } from './vertex3d.js'

/** Minimal 2D vector contract. */
export interface Vertex {
	x: number
	y: number
	clone(): Vertex
	sub(v: Vertex): this
	length(): number
}

/** Vertex with editor flags (smooth/slingshot/control-point). */
export interface IRenderVertex {
	x: number
	y: number
	fSmooth: boolean
	fSlingshot: boolean
	fControlPoint: boolean
	isVector3: boolean
	set(x: number, y: number, z?: number): this
}

/** Untextured vertex — position, normal, tex-coords (8 floats, 32 bytes). */
export class Vertex3DNoTex2 {
	static readonly size = 32

	_x = 0
	_y = 0
	_z = 0
	_nx = 0
	_ny = 0
	_nz = 0
	_tu = 0
	_tv = 0

	get x(): number {
		return this._x
	}
	set x(v: number) {
		this._x = f4(v)
	}
	get y(): number {
		return this._y
	}
	set y(v: number) {
		this._y = f4(v)
	}
	get z(): number {
		return this._z
	}
	set z(v: number) {
		this._z = f4(v)
	}
	get nx(): number {
		return this._nx
	}
	set nx(v: number) {
		this._nx = f4(v)
	}
	get ny(): number {
		return this._ny
	}
	set ny(v: number) {
		this._ny = f4(v)
	}
	get nz(): number {
		return this._nz
	}
	set nz(v: number) {
		this._nz = f4(v)
	}
	get tu(): number {
		return this._tu
	}
	set tu(v: number) {
		this._tu = f4(v)
	}
	get tv(): number {
		return this._tv
	}
	set tv(v: number) {
		this._tv = f4(v)
	}

	/** Reads vertex at `pos` from `buffer`. */
	static get(buffer: Uint8Array, pos: number): Vertex3DNoTex2 {
		const offset = pos * Vertex3DNoTex2.size
		const v = new Vertex3DNoTex2()
		try {
			const f32 = new Float32Array(buffer.buffer, buffer.byteOffset + offset, 8)
			v._x = f32[0]
			v._y = f32[1]
			v._z = f32[2]
			v._nx = f32[3]
			v._ny = f32[4]
			v._nz = f32[5]
			v._tu = f32[6]
			v._tv = f32[7]
			return v
		} catch {}
		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		v._x = f4(view.getFloat32(offset, true))
		v._y = f4(view.getFloat32(offset + 4, true))
		v._z = f4(view.getFloat32(offset + 8, true))
		v._nx = f4(view.getFloat32(offset + 12, true))
		v._ny = f4(view.getFloat32(offset + 16, true))
		v._nz = f4(view.getFloat32(offset + 20, true))
		v._tu = f4(view.getFloat32(offset + 24, true))
		v._tv = f4(view.getFloat32(offset + 28, true))
		return v
	}

	/** Returns position as `Vertex3D`. */
	getVertex(): Vertex3D {
		return new Vertex3D(this._x, this._y, this._z)
	}

	clone(): Vertex3DNoTex2 {
		const v = new Vertex3DNoTex2()
		v._x = this._x
		v._y = this._y
		v._z = this._z
		v._nx = this._nx
		v._ny = this._ny
		v._nz = this._nz
		v._tu = this._tu
		v._tv = this._tv
		return v
	}

	/** Whether texture coordinates are present. */
	hasTextureCoordinates(): boolean {
		return this._tu !== undefined && this._tv !== undefined
	}

	static from(data: any): Vertex3DNoTex2 {
		return Object.assign(new Vertex3DNoTex2(), data)
	}

	static fromArray(arr: number[]): Vertex3DNoTex2 {
		const v = new Vertex3DNoTex2()
		v._x = f4(arr[0])
		v._y = f4(arr[1])
		v._z = f4(arr[2])
		v._nx = f4(arr[3])
		v._ny = f4(arr[4])
		v._nz = f4(arr[5])
		v._tu = f4(arr[6])
		v._tv = f4(arr[7])
		return v
	}
}
