// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as vec2 from 'gl-matrix/esm/vec2.js'
import { Pool } from '../util/object-pool.js'
import { f4 } from './float.js'
import type { IRenderVertex, Vertex } from './vertex.js'

/** 2D single-precision vector with pooling. Backed by gl-matrix for ops. */
export class Vertex2D implements Vertex {
	static readonly POOL = new Pool(Vertex2D)

	readonly isVector2 = true as const
	readonly isVector3 = false as const

	private _x = 0
	private _y = 0

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

	/** Creates a vector. */
	constructor(x?: number, y?: number) {
		this._x = f4(x ?? 0)
		this._y = f4(y ?? 0)
	}

	/** Reads a 2D position from buffer start. */
	static get(buffer: Uint8Array): Vertex2D {
		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		const v = new Vertex2D()
		v._x = view.getFloat32(0, true)
		v._y = view.getFloat32(4, true)
		return v
	}

	/** Claims a pooled instance. */
	static claim(x?: number, y?: number): Vertex2D {
		return Vertex2D.POOL.get().set(x ?? 0, y ?? 0)
	}

	/** Releases instances to the pool. */
	static release(...vs: Vertex2D[]): void {
		for (const v of vs) Vertex2D.POOL.release(v)
	}

	/** Resets pooled instance. */
	static reset(v: Vertex2D): void {
		v.set(0, 0)
	}

	/** Sets coordinates. */
	set(x: number, y: number): this {
		this._x = f4(x)
		this._y = f4(y)
		return this
	}

	/** Sets to zero. */
	setZero(): this {
		return this.set(0, 0)
	}

	/** Clones, optionally from pool. */
	clone(recycle = false): Vertex2D {
		return recycle ? Vertex2D.POOL.get().set(this._x, this._y) : new Vertex2D(this._x, this._y)
	}

	/** Adds vector in place. */
	add(v: Vertex2D): this {
		this._x = f4(this._x + v._x)
		this._y = f4(this._y + v._y)
		return this
	}

	/** Adds and releases source. */
	addAndRelease(v: Vertex2D): this {
		this.add(v)
		Vertex2D.release(v)
		return this
	}

	/** Subtracts vector in place. */
	sub(v: Vertex2D): this {
		this._x = f4(this._x - v._x)
		this._y = f4(this._y - v._y)
		return this
	}

	/** Subtracts and releases source. */
	subAndRelease(v: Vertex2D): this {
		this.sub(v)
		Vertex2D.release(v)
		return this
	}

	/** Normalizes in place (no-op if zero). */
	normalize(): this {
		const len = this.length()
		return len ? this.divideScalar(len) : this
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
		return this
	}

	/** Euclidean length. */
	length(): number {
		return f4(vec2.length([this._x, this._y] as unknown as vec2.vec2))
	}

	/** Squared length. */
	lengthSq(): number {
		return f4(vec2.squaredLength([this._x, this._y] as unknown as vec2.vec2))
	}

	/** Dot product. */
	dot(v: Vertex2D): number {
		return f4(vec2.dot([this._x, this._y] as unknown as vec2.vec2, [v._x, v._y] as unknown as vec2.vec2))
	}

	/** Exact equality. */
	equals(v?: Vertex2D): boolean {
		return !!v && this._x === v._x && this._y === v._y
	}
}

/** 2D vertex with editor flags. */
export class RenderVertex extends Vertex2D implements IRenderVertex {
	fSmooth = false
	fSlingshot = false
	fControlPoint = false
}
