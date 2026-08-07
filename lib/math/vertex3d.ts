// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../util/object-pool.js'
import { FLT_MIN } from '../vpt/mesh.js'
import { f4 } from './float.js'
import type { Matrix2D } from './matrix2d.js'
import type { Matrix3D } from './matrix3d.js'
import type { IRenderVertex, Vertex } from './vertex.js'
import { Vertex2D } from './vertex2d.js'

/** 3D single-precision vector with pooled allocation. */
export class Vertex3D implements Vertex {
	static readonly POOL = new Pool(Vertex3D)

	readonly isVector2 = false as const
	readonly isVector3 = true as const

	private _x = 0
	private _y = 0
	private _z = 0

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

	constructor(x?: number, y?: number, z?: number) {
		this.x = x ?? 0
		this.y = y ?? 0
		this.z = z ?? 0
	}

	/** Reads a 3D position from `buffer` (z optional). */
	static get(buffer: Uint8Array): Vertex3D {
		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		const v = new Vertex3D()
		v._x = view.getFloat32(0, true)
		v._y = view.getFloat32(4, true)
		if (buffer.length >= 12) v._z = view.getFloat32(8, true)
		return v
	}

	static from(data: any): Vertex3D {
		return Object.assign(new Vertex3D(), data)
	}

	/** Claims a pooled instance. */
	static claim(x?: number, y?: number, z?: number): Vertex3D {
		return Vertex3D.POOL.get().set(x ?? 0, y ?? 0, z ?? 0)
	}

	static release(...vertices: Vertex3D[]): void {
		for (const v of vertices) Vertex3D.POOL.release(v)
	}

	static reset(v: Vertex3D): void {
		v.set(0, 0, 0)
	}

	set(v: Vertex3D): this
	set(x: number, y: number, z?: number): this
	set(xOrV: number | Vertex3D, y?: number, z?: number): this {
		if (typeof xOrV === 'number') {
			this.x = xOrV
			this.y = y!
			this.z = z ?? 0
		} else {
			this.x = xOrV.x
			this.y = xOrV.y
			this.z = xOrV.z
		}
		return this
	}

	setAndRelease(v: Vertex3D): this {
		this.x = v.x
		this.y = v.y
		this.z = v.z
		Vertex3D.release(v)
		return this
	}

	clone(recycle = false): Vertex3D {
		return recycle ? Vertex3D.POOL.get().set(this._x, this._y, this._z) : new Vertex3D(this._x, this._y, this._z)
	}

	normalize(): this {
		return this.divideScalar(this.length() || 1)
	}

	normalizeSafe(): void {
		if (!this.isZero()) this.normalize()
	}

	length(): number {
		return f4(Math.sqrt(f4(f4(f4(this.x * this.x) + f4(this.y * this.y)) + f4(this.z * this.z))))
	}

	lengthSq(): number {
		return f4(f4(this.x * this.x) + f4(this.y * this.y)) + f4(this.z * this.z)
	}

	divideScalar(scalar: number): this {
		return this.multiplyScalar(f4(1 / scalar))
	}

	multiplyScalar(scalar: number): this {
		this.x *= f4(scalar)
		this.y *= f4(scalar)
		this.z *= f4(scalar)
		return this
	}

	applyMatrix2D(matrix: Matrix2D): this {
		const x = matrix.matrix[0][0] * this.x + matrix.matrix[0][1] * this.y + matrix.matrix[0][2] * this.z
		const y = matrix.matrix[1][0] * this.x + matrix.matrix[1][1] * this.y + matrix.matrix[1][2] * this.z
		const z = matrix.matrix[2][0] * this.x + matrix.matrix[2][1] * this.y + matrix.matrix[2][2] * this.z
		return this.set(x, y, z)
	}

	dot(v: Vertex3D): number {
		return f4(f4(this.x * v.x) + f4(this.y * v.y)) + f4(this.z * v.z)
	}

	dotAndRelease(v: Vertex3D): number {
		const d = this.dot(v)
		Vertex3D.release(v)
		return d
	}

	sub(v: Vertex3D): this {
		this.x -= v.x
		this.y -= v.y
		this.z -= v.z
		return this
	}
	subAndRelease(v: Vertex3D): this {
		this.sub(v)
		Vertex3D.release(v)
		return this
	}

	add(v: Vertex3D): this {
		this.x += v.x
		this.y += v.y
		this.z += v.z
		return this
	}
	addAndRelease(v: Vertex3D): this {
		this.add(v)
		Vertex3D.release(v)
		return this
	}

	cross(v: Vertex3D): this {
		return this.crossVectors(this, v)
	}

	crossVectors(a: Vertex3D, b: Vertex3D): this {
		const { x: ax, y: ay, z: az } = a
		const { x: bx, y: by, z: bz } = b
		this.x = f4(ay * bz) - f4(az * by)
		this.y = f4(az * bx) - f4(ax * bz)
		this.z = f4(ax * by) - f4(ay * bx)
		return this
	}

	xy(): Vertex2D {
		return new Vertex2D(this.x, this.y)
	}

	setZero(): this {
		return this.set(0, 0, 0)
	}

	isZero(): boolean {
		return Math.abs(this.x) < FLT_MIN && Math.abs(this.y) < FLT_MIN && Math.abs(this.z) < FLT_MIN
	}

	equals(v: Vertex3D): boolean {
		return v.x === this.x && v.y === this.y && v.z === this.z
	}

	static crossProduct(a: Vertex3D, b: Vertex3D, recycle = false): Vertex3D {
		const x = a.y * b.z - a.z * b.y,
			y = a.z * b.x - a.x * b.z,
			z = a.x * b.y - a.y * b.x
		return recycle ? Vertex3D.claim(x, y, z) : new Vertex3D(x, y, z)
	}

	static crossZ(rz: number, v: Vertex3D, recycle = false): Vertex3D {
		return recycle ? Vertex3D.claim(-rz * v.y, rz * v.x, 0) : new Vertex3D(-rz * v.y, rz * v.x, 0)
	}

	/** Rotates `temp` around `axis` by `angle` degrees. */
	static getRotatedAxis(angle: number, axis: Vertex3D, temp: Vertex3D): Vertex3D {
		const u = axis.clone(true).normalize()
		const sin = f4(Math.sin(f4(f4(Math.PI / 180) * angle)))
		const cos = f4(Math.cos(f4(f4(Math.PI / 180) * angle)))
		const omc = f4(1 - cos)

		const r0 = new Vertex3D()
		const r1 = new Vertex3D()
		const r2 = new Vertex3D()

		r0.x = f4(u.x * u.x) + f4(cos * f4(1 - f4(u.x * u.x)))
		r0.y = f4(f4(u.x * u.y) * omc) - f4(sin * u.z)
		r0.z = f4(f4(u.x * u.z) * omc) + f4(sin * u.y)

		r1.x = f4(f4(u.x * u.y) * omc) + f4(sin * u.z)
		r1.y = f4(u.y * u.y) + f4(cos * (1 - f4(u.y * u.y)))
		r1.z = f4(f4(u.y * u.z) * omc) - f4(sin * u.x)

		r2.x = f4(f4(u.x * u.z) * omc) - f4(sin * u.y)
		r2.y = f4(f4(u.y * u.z) * omc) + f4(sin * u.x)
		r2.z = f4(u.z * u.z) + f4(cos * f4(1 - f4(u.z * u.z)))

		Vertex3D.release(u)
		return new Vertex3D(temp.dot(r0), temp.dot(r1), temp.dot(r2))
	}

	/** Transforms through a 4×4 matrix (with perspective divide). */
	multiplyMatrix(m: Matrix3D): this {
		const xp = f4(f4(f4(f4(m._11 * this.x) + f4(m._21 * this.y)) + f4(m._31 * this.z)) + m._41)
		const yp = f4(f4(f4(f4(m._12 * this.x) + f4(m._22 * this.y)) + f4(m._32 * this.z)) + m._42)
		const zp = f4(f4(f4(f4(m._13 * this.x) + f4(m._23 * this.y)) + f4(m._33 * this.z)) + m._43)
		const wp = f4(f4(f4(f4(m._14 * this.x) + f4(m._24 * this.y)) + f4(m._34 * this.z)) + m._44)
		return this.set(xp * f4(1 / wp), yp * f4(1 / wp), zp * f4(1 / wp))
	}

	/** Transforms through a 4×4 matrix without translation. */
	multiplyMatrixNoTranslate(m: Matrix3D): this {
		const xp = f4(f4(m._11 * this.x) + f4(m._21 * this.y)) + f4(m._31 * this.z)
		const yp = f4(f4(m._12 * this.x) + f4(m._22 * this.y)) + f4(m._32 * this.z)
		const zp = f4(f4(m._13 * this.x) + f4(m._23 * this.y)) + f4(m._33 * this.z)
		return this.set(xp, yp, zp)
	}
}

/** 3D vertex with editor flags. */
export class RenderVertex3D extends Vertex3D implements IRenderVertex {
	fSmooth = false
	fSlingshot = false
	fControlPoint = false
	constructor(x?: number, y?: number, z?: number) {
		super(x, y, z)
	}
}
