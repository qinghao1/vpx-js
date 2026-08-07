// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as vec3 from 'gl-matrix/esm/vec3.js'
import { Pool } from '../util/object-pool.js'
import { FLT_MIN } from '../vpt/mesh.js'
import { f4 } from './float.js'
import type { Matrix2D } from './matrix2d.js'
import type { Matrix3D } from './matrix3d.js'
import type { IRenderVertex, Vertex } from './vertex.js'
import { Vertex2D } from './vertex2d.js'

/** 3D single-precision vector with pooling. Backed by gl-matrix for ops. */
export class Vertex3D implements Vertex {
	static readonly POOL = new Pool(Vertex3D)

	readonly isVector2 = false as const
	readonly isVector3 = true as const

	private _x = 0
	private _y = 0
	private _z = 0

	/** X coordinate (single precision). */
	get x(): number {
		return this._x
	}
	set x(v: number) {
		this._x = f4(v)
	}

	/** Y coordinate (single precision). */
	get y(): number {
		return this._y
	}
	set y(v: number) {
		this._y = f4(v)
	}

	/** Z coordinate (single precision). */
	get z(): number {
		return this._z
	}
	set z(v: number) {
		this._z = f4(v)
	}

	constructor(x?: number, y?: number, z?: number) {
		this._x = f4(x ?? 0)
		this._y = f4(y ?? 0)
		this._z = f4(z ?? 0)
	}

	/** Reads a 3D position from buffer (z optional). */
	static get(buffer: Uint8Array): Vertex3D {
		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		const v = new Vertex3D()
		v._x = view.getFloat32(0, true)
		v._y = view.getFloat32(4, true)
		if (buffer.length >= 12) v._z = view.getFloat32(8, true)
		return v
	}

	/** Creates from plain object. */
	static from(data: any): Vertex3D {
		return Object.assign(new Vertex3D(), data)
	}

	/** Claims a pooled instance. */
	static claim(x?: number, y?: number, z?: number): Vertex3D {
		return Vertex3D.POOL.get().set(x ?? 0, y ?? 0, z ?? 0)
	}

	/** Releases instances to the pool. */
	static release(...vs: Vertex3D[]): void {
		for (const v of vs) Vertex3D.POOL.release(v)
	}

	/** Resets pooled instance. */
	static reset(v: Vertex3D): void {
		v.set(0, 0, 0)
	}

	set(v: Vertex3D): this
	set(x: number, y: number, z?: number): this
	/** Sets coordinates from vector or components. */
	set(xOrV: number | Vertex3D, y?: number, z?: number): this {
		if (typeof xOrV === 'number') {
			this._x = f4(xOrV)
			this._y = f4(y!)
			this._z = f4(z ?? 0)
		} else {
			this._x = f4(xOrV.x)
			this._y = f4(xOrV.y)
			this._z = f4(xOrV.z)
		}
		return this
	}

	/** Copies and releases source. */
	setAndRelease(v: Vertex3D): this {
		this.set(v)
		Vertex3D.release(v)
		return this
	}

	/** Clones, optionally from pool. */
	clone(recycle = false): Vertex3D {
		return recycle ? Vertex3D.POOL.get().set(this._x, this._y, this._z) : new Vertex3D(this._x, this._y, this._z)
	}

	/** Normalizes in place. */
	normalize(): this {
		const out = vec3.create() as unknown as [number, number, number]
		vec3.normalize(out as unknown as vec3.vec3, [this._x, this._y, this._z] as unknown as vec3.vec3)
		this._x = f4(out[0])
		this._y = f4(out[1])
		this._z = f4(out[2])
		return this
	}

	/** Normalizes if non-zero. */
	normalizeSafe(): void {
		if (!this.isZero()) this.normalize()
	}

	/** Euclidean length. */
	length(): number {
		return f4(vec3.length([this._x, this._y, this._z] as unknown as vec3.vec3))
	}

	/** Squared length. */
	lengthSq(): number {
		return f4(vec3.squaredLength([this._x, this._y, this._z] as unknown as vec3.vec3))
	}

	/** Divides by scalar. */
	divideScalar(s: number): this {
		return this.multiplyScalar(f4(1 / s))
	}

	/** Multiplies by scalar. */
	multiplyScalar(s: number): this {
		const f = f4(s)
		this._x = f4(this._x * f)
		this._y = f4(this._y * f)
		this._z = f4(this._z * f)
		return this
	}

	/** Transforms by 3×3 matrix (VP convention). */
	applyMatrix2D(m: Matrix2D): this {
		const x = m.matrix[0][0] * this._x + m.matrix[0][1] * this._y + m.matrix[0][2] * this._z
		const y = m.matrix[1][0] * this._x + m.matrix[1][1] * this._y + m.matrix[1][2] * this._z
		const z = m.matrix[2][0] * this._x + m.matrix[2][1] * this._y + m.matrix[2][2] * this._z
		return this.set(x, y, z)
	}

	/** Dot product. */
	dot(v: Vertex3D): number {
		return f4(vec3.dot([this._x, this._y, this._z] as unknown as vec3.vec3, [v._x, v._y, v._z] as unknown as vec3.vec3))
	}

	/** Dot and releases source. */
	dotAndRelease(v: Vertex3D): number {
		const d = this.dot(v)
		Vertex3D.release(v)
		return d
	}

	/** Subtracts vector in place. */
	sub(v: Vertex3D): this {
		this._x = f4(this._x - v._x)
		this._y = f4(this._y - v._y)
		this._z = f4(this._z - v._z)
		return this
	}

	/** Subtracts and releases source. */
	subAndRelease(v: Vertex3D): this {
		this.sub(v)
		Vertex3D.release(v)
		return this
	}

	/** Adds vector in place. */
	add(v: Vertex3D): this {
		this._x = f4(this._x + v._x)
		this._y = f4(this._y + v._y)
		this._z = f4(this._z + v._z)
		return this
	}

	/** Adds and releases source. */
	addAndRelease(v: Vertex3D): this {
		this.add(v)
		Vertex3D.release(v)
		return this
	}

	/** Cross with vector in place. */
	cross(v: Vertex3D): this {
		return this.crossVectors(this, v)
	}

	/** Sets to cross of a×b. */
	crossVectors(a: Vertex3D, b: Vertex3D): this {
		const out = vec3.create() as unknown as [number, number, number]
		vec3.cross(
			out as unknown as vec3.vec3,
			[a._x, a._y, a._z] as unknown as vec3.vec3,
			[b._x, b._y, b._z] as unknown as vec3.vec3,
		)
		this._x = f4(out[0])
		this._y = f4(out[1])
		this._z = f4(out[2])
		return this
	}

	/** Returns XY as Vertex2D. */
	xy(): Vertex2D {
		return new Vertex2D(this._x, this._y)
	}

	/** Sets to zero. */
	setZero(): this {
		return this.set(0, 0, 0)
	}

	/** Checks near-zero. */
	isZero(): boolean {
		return Math.abs(this._x) < FLT_MIN && Math.abs(this._y) < FLT_MIN && Math.abs(this._z) < FLT_MIN
	}

	/** Exact equality. */
	equals(v: Vertex3D): boolean {
		return v._x === this._x && v._y === this._y && v._z === this._z
	}

	/** Cross product, optionally pooled. */
	static crossProduct(a: Vertex3D, b: Vertex3D, recycle = false): Vertex3D {
		const out = vec3.create() as unknown as [number, number, number]
		vec3.cross(
			out as unknown as vec3.vec3,
			[a._x, a._y, a._z] as unknown as vec3.vec3,
			[b._x, b._y, b._z] as unknown as vec3.vec3,
		)
		return recycle ? Vertex3D.claim(out[0], out[1], out[2]) : new Vertex3D(out[0], out[1], out[2])
	}

	/** Cross of Z-axis scaled vector with v. */
	static crossZ(rz: number, v: Vertex3D, recycle = false): Vertex3D {
		return recycle ? Vertex3D.claim(-rz * v._y, rz * v._x, 0) : new Vertex3D(-rz * v._y, rz * v._x, 0)
	}

	/** Rotates temp around axis by angle degrees. */
	static getRotatedAxis(angle: number, axis: Vertex3D, temp: Vertex3D): Vertex3D {
		const u = axis.clone(true).normalize()
		const rad = f4((Math.PI / 180) * angle)
		const s = f4(Math.sin(rad))
		const c = f4(Math.cos(rad))
		const omc = f4(1 - c)

		const r0 = new Vertex3D(
			f4(u._x * u._x + c * (1 - u._x * u._x)),
			f4(u._x * u._y * omc - s * u._z),
			f4(u._x * u._z * omc + s * u._y),
		)
		const r1 = new Vertex3D(
			f4(u._x * u._y * omc + s * u._z),
			f4(u._y * u._y + c * (1 - u._y * u._y)),
			f4(u._y * u._z * omc - s * u._x),
		)
		const r2 = new Vertex3D(
			f4(u._x * u._z * omc - s * u._y),
			f4(u._y * u._z * omc + s * u._x),
			f4(u._z * u._z + c * (1 - u._z * u._z)),
		)
		Vertex3D.release(u)
		return new Vertex3D(temp.dot(r0), temp.dot(r1), temp.dot(r2))
	}

	/** Transforms through 4×4 matrix with perspective divide. */
	multiplyMatrix(m: Matrix3D): this {
		const x = this._x,
			y = this._y,
			z = this._z
		const xp = f4(f4(f4(f4(m._11 * x) + f4(m._21 * y)) + f4(m._31 * z)) + m._41)
		const yp = f4(f4(f4(f4(m._12 * x) + f4(m._22 * y)) + f4(m._32 * z)) + m._42)
		const zp = f4(f4(f4(f4(m._13 * x) + f4(m._23 * y)) + f4(m._33 * z)) + m._43)
		const wp = f4(f4(f4(f4(m._14 * x) + f4(m._24 * y)) + f4(m._34 * z)) + m._44)
		const inv = f4(1 / wp)
		return this.set(xp * inv, yp * inv, zp * inv)
	}

	/** Transforms through 4×4 matrix without translation. */
	multiplyMatrixNoTranslate(m: Matrix3D): this {
		const x = this._x,
			y = this._y,
			z = this._z
		const xp = f4(f4(m._11 * x) + f4(m._21 * y)) + f4(m._31 * z)
		const yp = f4(f4(m._12 * x) + f4(m._22 * y)) + f4(m._32 * z)
		const zp = f4(f4(m._13 * x) + f4(m._23 * y)) + f4(m._33 * z)
		return this.set(xp, yp, zp)
	}
}

/** 3D vertex with editor flags. */
export class RenderVertex3D extends Vertex3D implements IRenderVertex {
	fSmooth = false
	fSlingshot = false
	fControlPoint = false
}
