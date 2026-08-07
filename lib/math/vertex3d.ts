// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vector3 } from 'three'
import { Pool } from '../util/object-pool.js'
import { FLT_MIN } from '../vpt/mesh.js'
import { f4 } from './float.js'
import type { Matrix2D } from './matrix2d.js'
import type { Matrix3D } from './matrix3d.js'
import type { IRenderVertex, Vertex } from './vertex.js'
import { Vertex2D } from './vertex2d.js'

/** 3D single-precision vector, three.js based with pooling. */
export class Vertex3D extends Vector3 implements Vertex {
	static readonly POOL = new Pool(Vertex3D)

	readonly isVector2 = false as const
	readonly isVector3 = true as const

	constructor(x?: number, y?: number, z?: number) {
		super(f4(x ?? 0), f4(y ?? 0), f4(z ?? 0))
	}

	/** Reads a 3D position from buffer (z optional). */
	static get(buffer: Uint8Array): Vertex3D {
		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		const v = new Vertex3D(view.getFloat32(0, true), view.getFloat32(4, true))
		if (buffer.length >= 12) v.z = f4(view.getFloat32(8, true))
		return v
	}

	/** Creates from plain object. */
	static from(data: Record<string, unknown>): Vertex3D {
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

	override set(x: number, y: number, z?: number): this
	override set(v: Vector3): this
	override set(xOrV: number | Vector3, y?: number, z?: number): this {
		if (typeof xOrV === 'number') {
			super.set(f4(xOrV), f4(y!), f4(z ?? 0))
		} else {
			super.set(f4(xOrV.x), f4(xOrV.y), f4(xOrV.z))
		}
		return this
	}

	/** Copies and releases source. */
	setAndRelease(v: Vertex3D): this {
		this.set(v)
		Vertex3D.release(v)
		return this
	}

	override clone(recycle = false): this {
		const v = recycle ? Vertex3D.POOL.get().set(this.x, this.y, this.z) : new Vertex3D(this.x, this.y, this.z)
		return v as this
	}

	override normalize(): this {
		const len = this.length() || 1
		return this.divideScalar(len)
	}

	/** Normalizes if non-zero. */
	normalizeSafe(): void {
		if (!this.isZero()) this.normalize()
	}

	override length(): number {
		return f4(super.length())
	}

	override lengthSq(): number {
		return f4(super.lengthSq())
	}

	override divideScalar(s: number): this {
		return this.multiplyScalar(f4(1 / s))
	}

	override multiplyScalar(s: number): this {
		super.multiplyScalar(f4(s))
		this.x = f4(this.x)
		this.y = f4(this.y)
		this.z = f4(this.z)
		return this
	}

	/** Transforms by 3×3 matrix (VP convention). */
	applyMatrix2D(m: Matrix2D): this {
		const x = m.matrix[0][0] * this.x + m.matrix[0][1] * this.y + m.matrix[0][2] * this.z
		const y = m.matrix[1][0] * this.x + m.matrix[1][1] * this.y + m.matrix[1][2] * this.z
		const z = m.matrix[2][0] * this.x + m.matrix[2][1] * this.y + m.matrix[2][2] * this.z
		return this.set(x, y, z)
	}

	override dot(v: Vector3): number {
		return f4(super.dot(v))
	}

	/** Dot and releases source. */
	dotAndRelease(v: Vertex3D): number {
		const d = this.dot(v)
		Vertex3D.release(v)
		return d
	}

	override sub(v: Vector3): this {
		super.sub(v)
		this.x = f4(this.x)
		this.y = f4(this.y)
		this.z = f4(this.z)
		return this
	}

	/** Subtracts and releases source. */
	subAndRelease(v: Vertex3D): this {
		this.sub(v)
		Vertex3D.release(v)
		return this
	}

	override add(v: Vector3): this {
		super.add(v)
		this.x = f4(this.x)
		this.y = f4(this.y)
		this.z = f4(this.z)
		return this
	}

	/** Adds and releases source. */
	addAndRelease(v: Vertex3D): this {
		this.add(v)
		Vertex3D.release(v)
		return this
	}

	override cross(v: Vector3): this {
		return this.crossVectors(this, v)
	}

	override crossVectors(a: Vector3, b: Vector3): this {
		super.crossVectors(a, b)
		this.x = f4(this.x)
		this.y = f4(this.y)
		this.z = f4(this.z)
		return this
	}

	/** Returns XY as Vertex2D. */
	xy(): Vertex2D {
		return new Vertex2D(this.x, this.y)
	}

	/** Sets to zero. */
	setZero(): this {
		return this.set(0, 0, 0)
	}

	/** Checks near-zero. */
	isZero(): boolean {
		return Math.abs(this.x) < FLT_MIN && Math.abs(this.y) < FLT_MIN && Math.abs(this.z) < FLT_MIN
	}

	/** Exact equality. */
	equals(v: Vector3): boolean {
		return v.x === this.x && v.y === this.y && v.z === this.z
	}

	/** Cross product, optionally pooled. */
	static crossProduct(a: Vertex3D, b: Vertex3D, recycle = false): Vertex3D {
		const out = new Vector3().crossVectors(a, b)
		return recycle ? Vertex3D.claim(out.x, out.y, out.z) : new Vertex3D(out.x, out.y, out.z)
	}

	/** Cross of Z-axis scaled vector with v. */
	static crossZ(rz: number, v: Vertex3D, recycle = false): Vertex3D {
		return recycle ? Vertex3D.claim(-rz * v.y, rz * v.x, 0) : new Vertex3D(-rz * v.y, rz * v.x, 0)
	}

	/** Rotates temp around axis by angle degrees. */
	static getRotatedAxis(angle: number, axis: Vertex3D, temp: Vertex3D): Vertex3D {
		const u = axis.clone(true).normalize()
		const rad = f4((Math.PI / 180) * angle)
		const s = f4(Math.sin(rad)),
			c = f4(Math.cos(rad)),
			omc = f4(1 - c)
		const r0 = new Vertex3D(
			f4(u.x * u.x + c * (1 - u.x * u.x)),
			f4(u.x * u.y * omc - s * u.z),
			f4(u.x * u.z * omc + s * u.y),
		)
		const r1 = new Vertex3D(
			f4(u.x * u.y * omc + s * u.z),
			f4(u.y * u.y + c * (1 - u.y * u.y)),
			f4(u.y * u.z * omc - s * u.x),
		)
		const r2 = new Vertex3D(
			f4(u.x * u.z * omc - s * u.y),
			f4(u.y * u.z * omc + s * u.x),
			f4(u.z * u.z + c * (1 - u.z * u.z)),
		)
		Vertex3D.release(u)
		return new Vertex3D(temp.dot(r0), temp.dot(r1), temp.dot(r2))
	}

	/** Transforms through 4×4 matrix with perspective divide. */
	multiplyMatrix(m: Matrix3D): this {
		const x = this.x,
			y = this.y,
			z = this.z
		const xp = f4(f4(f4(f4(m._11 * x) + f4(m._21 * y)) + f4(m._31 * z)) + m._41)
		const yp = f4(f4(f4(f4(m._12 * x) + f4(m._22 * y)) + f4(m._32 * z)) + m._42)
		const zp = f4(f4(f4(f4(m._13 * x) + f4(m._23 * y)) + f4(m._33 * z)) + m._43)
		const wp = f4(f4(f4(f4(m._14 * x) + f4(m._24 * y)) + f4(m._34 * z)) + m._44)
		const inv = f4(1 / wp)
		return this.set(xp * inv, yp * inv, zp * inv)
	}

	/** Transforms through 4×4 matrix without translation. */
	multiplyMatrixNoTranslate(m: Matrix3D): this {
		const xp = f4(f4(m._11 * this.x) + f4(m._21 * this.y)) + f4(m._31 * this.z)
		const yp = f4(f4(m._12 * this.x) + f4(m._22 * this.y)) + f4(m._32 * this.z)
		const zp = f4(f4(m._13 * this.x) + f4(m._23 * this.y)) + f4(m._33 * this.z)
		return this.set(xp, yp, zp)
	}

	/** Converts to THREE.Vector3. */
	toThree(): Vector3 {
		return new Vector3(this.x, this.y, this.z)
	}

	/** Creates from THREE.Vector3. */
	static fromThree(v: Vector3): Vertex3D {
		return new Vertex3D(v.x, v.y, v.z)
	}
}

/** 3D vertex with editor flags. */
export class RenderVertex3D extends Vertex3D implements IRenderVertex {
	fSmooth = false
	fSlingshot = false
	fControlPoint = false
}
