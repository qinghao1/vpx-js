// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vector2 } from 'three'
import { Pool } from '../util/object-pool.js'
import { f4 } from './float.js'
import type { IRenderVertex, Vertex } from './vertex.js'

/** 2D single-precision vector, three.js based with pooling. */
export class Vertex2D extends Vector2 implements Vertex {
	static readonly POOL = new Pool(Vertex2D)

	readonly isVector2 = true as const
	readonly isVector3 = false as const

	constructor(x?: number, y?: number) {
		super(f4(x ?? 0), f4(y ?? 0))
	}

	/** Reads a 2D position from buffer start. */
	static get(buffer: Uint8Array): Vertex2D {
		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		return new Vertex2D(view.getFloat32(0, true), view.getFloat32(4, true))
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

	override set(x: number, y: number): this {
		super.set(f4(x), f4(y))
		return this
	}

	/** Sets to zero. */
	setZero(): this {
		return this.set(0, 0)
	}

	override clone(recycle = false): this {
		const v = recycle ? Vertex2D.POOL.get().set(this.x, this.y) : new Vertex2D(this.x, this.y)
		return v as this
	}

	override add(v: Vector2): this {
		super.add(v)
		this.x = f4(this.x)
		this.y = f4(this.y)
		return this
	}

	/** Adds and releases source. */
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

	/** Subtracts and releases source. */
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

	/** Converts to THREE.Vector2 (for rendering). */
	toThree(): Vector2 {
		return new Vector2(this.x, this.y)
	}

	/** Creates from THREE.Vector2. */
	static fromThree(v: Vector2): Vertex2D {
		return new Vertex2D(v.x, v.y)
	}
}

/** 2D vertex with editor flags. */
export class RenderVertex extends Vertex2D implements IRenderVertex {
	fSmooth = false
	fSlingshot = false
	fControlPoint = false
}
