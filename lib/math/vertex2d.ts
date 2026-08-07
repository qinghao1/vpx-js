// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../util/object-pool.js'
import { f4 } from './float.js'
import type { IRenderVertex, Vertex } from './vertex.js'

/** 2D single-precision vector with pooled allocation. */
export class Vertex2D implements Vertex {
	static readonly POOL = new Pool(Vertex2D)

	readonly isVector2 = true as const
	readonly isVector3 = false as const

	private _x = 0
	private _y = 0

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

	constructor(x?: number, y?: number) {
		this.x = x ?? 0
		this.y = y ?? 0
	}

	/** Reads a 2D position from the start of `buffer`. */
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

	static release(...vertices: Vertex2D[]): void {
		for (const v of vertices) Vertex2D.POOL.release(v)
	}

	static reset(v: Vertex2D): void {
		v.set(0, 0)
	}

	set(x: number, y: number): this {
		this.x = x
		this.y = y
		return this
	}

	setZero(): this {
		return this.set(0, 0)
	}

	clone(recycle = false): Vertex2D {
		return recycle ? Vertex2D.POOL.get().set(this._x, this._y) : new Vertex2D(this._x, this._y)
	}

	add(v: Vertex2D): this {
		this.x += v.x
		this.y += v.y
		return this
	}

	/** Adds `v` and releases it. */
	addAndRelease(v: Vertex2D): this {
		this.add(v)
		Vertex2D.release(v)
		return this
	}

	sub(v: Vertex2D): this {
		this.x -= v.x
		this.y -= v.y
		return this
	}

	subAndRelease(v: Vertex2D): this {
		this.sub(v)
		Vertex2D.release(v)
		return this
	}

	normalize(): this {
		return this.divideScalar(this.length() || 1)
	}

	divideScalar(scalar: number): this {
		return this.multiplyScalar(f4(1 / scalar))
	}

	multiplyScalar(scalar: number): this {
		this.x *= f4(scalar)
		this.y *= f4(scalar)
		return this
	}

	length(): number {
		return f4(Math.sqrt(f4(f4(this.x * this.x) + f4(this.y * this.y))))
	}

	lengthSq(): number {
		return this.x * this.x + this.y * this.y
	}

	dot(v: Vertex2D): number {
		return this.x * v.x + this.y * v.y
	}

	equals(v?: Vertex2D): boolean {
		return !!v && this.x === v.x && this.y === v.y
	}
}

/** 2D vertex with editor flags. */
export class RenderVertex extends Vertex2D implements IRenderVertex {
	fSmooth = false
	fSlingshot = false
	fControlPoint = false
	constructor(x?: number, y?: number) {
		super(x, y)
	}
}
