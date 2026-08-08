// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { type Matrix3, Vector2, Vector3 } from 'three'
import { FLT_MIN, f4 } from './float.js'
import type { Matrix2D, Matrix3D } from './matrix.js'
import { pooled } from './object-pool.js'

export class Vertex2D extends Vector2 {
	static readonly _pooled = pooled(Vertex2D)
	static readonly POOL = Vertex2D._pooled.pool
	readonly isVector2 = true as const
	readonly isVector3 = false as const
	constructor(x?: number, y?: number) {
		super(f4(x ?? 0), f4(y ?? 0))
	}
	static claim(x?: number, y?: number): Vertex2D {
		return Vertex2D._pooled.claim().set(x ?? 0, y ?? 0)
	}
	static release(...vs: Vertex2D[]): void {
		Vertex2D._pooled.release(...vs)
	}
	static reset(v: Vertex2D): void {
		v.set(0, 0)
	}
	override set(x: number, y: number): this {
		super.set(f4(x), f4(y))
		return this
	}
	setZero(): this {
		return this.set(0, 0)
	}
	override clone(recycle = false): this {
		const v = recycle ? Vertex2D._pooled.claim().set(this.x, this.y) : new Vertex2D(this.x, this.y)
		return v as this
	}
	override add(v: Vector2): this {
		super.add(v)
		this.x = f4(this.x)
		this.y = f4(this.y)
		return this
	}
	addAndRelease(v: Vertex2D): this {
		this.add(v)
		Vertex2D.release(v)
		return this
	}
	override sub(v: Vector2): this {
		super.sub(v)
		this.x = f4(this.x)
		this.y = f4(this.y)
		return this
	}
	subAndRelease(v: Vertex2D): this {
		this.sub(v)
		Vertex2D.release(v)
		return this
	}
	override normalize(): this {
		const len = this.length()
		return len ? this.divideScalar(len) : this
	}
	override divideScalar(s: number): this {
		return this.multiplyScalar(f4(1 / s))
	}
	override multiplyScalar(s: number): this {
		super.multiplyScalar(f4(s))
		this.x = f4(this.x)
		this.y = f4(this.y)
		return this
	}
	override length(): number {
		return f4(super.length())
	}
	override lengthSq(): number {
		return f4(super.lengthSq())
	}
	override dot(v: Vector2): number {
		return f4(super.dot(v))
	}
	equals(v?: Vertex2D): boolean {
		return !!v && this.x === v.x && this.y === v.y
	}
	toThree(): Vector2 {
		return new Vector2(this.x, this.y)
	}
	static fromThree(v: Vector2): Vertex2D {
		return new Vertex2D(v.x, v.y)
	}
	static get(buffer: Uint8Array): Vertex2D {
		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		return new Vertex2D(view.getFloat32(0, true), view.getFloat32(4, true))
	}
}

/** 3D single-precision vector, three.js based with pooling. */

export class Vertex3D extends Vector3 {
	static readonly _pooled = pooled(Vertex3D)
	static readonly POOL = Vertex3D._pooled.pool
	readonly isVector2 = false as const
	readonly isVector3 = true as const
	constructor(x?: number, y?: number, z?: number) {
		super(f4(x ?? 0), f4(y ?? 0), f4(z ?? 0))
	}
	static claim(x?: number, y?: number, z?: number): Vertex3D {
		return Vertex3D._pooled.claim().set(x ?? 0, y ?? 0, z ?? 0)
	}
	static release(...vs: Vertex3D[]): void {
		Vertex3D._pooled.release(...vs)
	}
	static reset(v: Vertex3D): void {
		v.set(0, 0, 0)
	}
	override set(x: number, y: number, z?: number): this
	override set(v: Vector3): this
	override set(xOrV: number | Vector3, y?: number, z?: number): this {
		if ((xOrV as any)?.__isUndefined === true) return super.set(0, 0, 0) as this
		if (typeof xOrV === 'number') {
			if ((y as any)?.__isUndefined === true) y = 0 as any
			if ((z as any)?.__isUndefined === true) z = 0 as any
			super.set(f4(xOrV), f4(y!), f4(z ?? 0))
		} else {
			super.set(f4((xOrV as any)?.x ?? 0), f4((xOrV as any)?.y ?? 0), f4((xOrV as any)?.z ?? 0))
		}
		return this
	}
	setAndRelease(v: Vertex3D): this {
		this.set(v)
		Vertex3D.release(v)
		return this
	}
	override clone(recycle = false): this {
		const v = recycle ? Vertex3D._pooled.claim().set(this.x, this.y, this.z) : new Vertex3D(this.x, this.y, this.z)
		return v as this
	}
	override normalize(): this {
		const len = this.length() || 1
		return this.divideScalar(len)
	}
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
	applyMatrix2D(m: Matrix2D): this {
		const e = (m as any).elements ?? (m as any).matrix
		const ex = Array.isArray(e[0]) ? e : null
		if (ex) {
			const x = ex[0][0] * this.x + ex[0][1] * this.y + ex[0][2] * this.z
			const y = ex[1][0] * this.x + ex[1][1] * this.y + ex[1][2] * this.z
			const z = ex[2][0] * this.x + ex[2][1] * this.y + ex[2][2] * this.z
			return this.set(x, y, z)
		}
		const ee = (m as Matrix3).elements
		const x = ee[0] * this.x + ee[1] * this.y + ee[2] * this.z
		const y = ee[3] * this.x + ee[4] * this.y + ee[5] * this.z
		const z = ee[6] * this.x + ee[7] * this.y + ee[8] * this.z
		return this.set(x, y, z)
	}
	override dot(v: Vector3): number {
		return f4(super.dot(v))
	}
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
	xy(): Vertex2D {
		return new Vertex2D(this.x, this.y)
	}
	setZero(): this {
		return this.set(0, 0, 0)
	}
	isZero(): boolean {
		return Math.abs(this.x) < FLT_MIN && Math.abs(this.y) < FLT_MIN && Math.abs(this.z) < FLT_MIN
	}
	equals(v: Vector3): boolean {
		return v.x === this.x && v.y === this.y && v.z === this.z
	}
	static crossProduct(a: Vertex3D, b: Vertex3D, recycle = false): Vertex3D {
		const out = new Vector3().crossVectors(a, b)
		return recycle ? Vertex3D.claim(out.x, out.y, out.z) : new Vertex3D(out.x, out.y, out.z)
	}
	static crossZ(rz: number, v: Vertex3D, recycle = false): Vertex3D {
		return recycle ? Vertex3D.claim(-rz * v.y, rz * v.x, 0) : new Vertex3D(-rz * v.y, rz * v.x, 0)
	}
	static getRotatedAxis(angle: number, axis: Vertex3D, temp: Vertex3D): Vertex3D {
		const u = axis.clone().normalize()
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
	multiplyMatrix(m: Matrix3D): this {
		const e = (m as unknown as { elements: number[] }).elements
		if (!e) {
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
		const x = this.x,
			y = this.y,
			z = this.z
		const xp = f4(f4(f4(f4(e[0] * x) + f4(e[4] * y)) + f4(e[8] * z)) + e[12])
		const yp = f4(f4(f4(f4(e[1] * x) + f4(e[5] * y)) + f4(e[9] * z)) + e[13])
		const zp = f4(f4(f4(f4(e[2] * x) + f4(e[6] * y)) + f4(e[10] * z)) + e[14])
		const wp = f4(f4(f4(f4(e[3] * x) + f4(e[7] * y)) + f4(e[11] * z)) + e[15])
		const inv = f4(1 / wp)
		return this.set(xp * inv, yp * inv, zp * inv)
	}
	multiplyMatrixNoTranslate(m: Matrix3D): this {
		const e = (m as unknown as { elements: number[] }).elements
		if (!e) {
			const xp = f4(f4(m._11 * this.x) + f4(m._21 * this.y)) + f4(m._31 * this.z)
			const yp = f4(f4(m._12 * this.x) + f4(m._22 * this.y)) + f4(m._32 * this.z)
			const zp = f4(f4(m._13 * this.x) + f4(m._23 * this.y)) + f4(m._33 * this.z)
			return this.set(xp, yp, zp)
		}
		const xp = f4(f4(e[0] * this.x) + f4(e[4] * this.y)) + f4(e[8] * this.z)
		const yp = f4(f4(e[1] * this.x) + f4(e[5] * this.y)) + f4(e[9] * this.z)
		const zp = f4(f4(e[2] * this.x) + f4(e[6] * this.y)) + f4(e[10] * this.z)
		return this.set(xp, yp, zp)
	}
	toThree(): Vector3 {
		return new Vector3(this.x, this.y, this.z)
	}
	static fromThree(v: Vector3): Vertex3D {
		return new Vertex3D(v.x, v.y, v.z)
	}
	static get(buffer: Uint8Array): Vertex3D {
		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		const v = new Vertex3D(view.getFloat32(0, true), view.getFloat32(4, true))
		if (buffer.length >= 12) v.z = f4(view.getFloat32(8, true))
		return v
	}
	static from(data: Record<string, unknown>): Vertex3D {
		return Object.assign(new Vertex3D(), data)
	}
}

/** 3×3 matrix, three.js based. */
