// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vector2 } from 'three';
import { Pool } from '../util/object-pool.js';
import { f4 } from './float.js';
import type { IRenderVertex, Vertex } from './vertex.js';

/** 2D single-precision vector with pooling, three.js interoperable. */
export class Vertex2D implements Vertex {
	static readonly POOL = new Pool(Vertex2D);

	readonly isVector2 = true as const;
	readonly isVector3 = false as const;

	private _x = 0;
	private _y = 0;

	get x(): number { return this._x; }
	set x(v: number) { this._x = f4(v); }
	get y(): number { return this._y; }
	set y(v: number) { this._y = f4(v); }

	constructor(x?: number, y?: number) {
		this._x = f4(x ?? 0);
		this._y = f4(y ?? 0);
	}

	/** Reads a 2D position from buffer start. */
	static get(buffer: Uint8Array): Vertex2D {
		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		return new Vertex2D(view.getFloat32(0, true), view.getFloat32(4, true));
	}

	/** Claims a pooled instance. */
	static claim(x?: number, y?: number): Vertex2D {
		return Vertex2D.POOL.get().set(x ?? 0, y ?? 0);
	}

	/** Releases instances to the pool. */
	static release(...vs: Vertex2D[]): void {
		for (const v of vs) Vertex2D.POOL.release(v);
	}

	/** Resets pooled instance. */
	static reset(v: Vertex2D): void { v.set(0, 0); }

	set(x: number, y: number): this {
		this._x = f4(x); this._y = f4(y); return this;
	}

	/** Sets to zero. */
	setZero(): this { return this.set(0, 0); }

	clone(recycle = false): Vertex2D {
		return recycle ? Vertex2D.POOL.get().set(this._x, this._y) : new Vertex2D(this._x, this._y);
	}

	add(v: Vertex2D): this {
		this._x = f4(this._x + v._x); this._y = f4(this._y + v._y); return this;
	}

	/** Adds and releases source. */
	addAndRelease(v: Vertex2D): this { this.add(v); Vertex2D.release(v); return this; }

	sub(v: Vertex2D): this {
		this._x = f4(this._x - v._x); this._y = f4(this._y - v._y); return this;
	}

	/** Subtracts and releases source. */
	subAndRelease(v: Vertex2D): this { this.sub(v); Vertex2D.release(v); return this; }

	normalize(): this {
		const len = this.length();
		return len ? this.divideScalar(len) : this;
	}

	divideScalar(s: number): this { return this.multiplyScalar(f4(1 / s)); }

	multiplyScalar(s: number): this {
		const f = f4(s); this._x = f4(this._x * f); this._y = f4(this._y * f); return this;
	}

	length(): number { return f4(new Vector2(this._x, this._y).length()); }

	lengthSq(): number { return f4(new Vector2(this._x, this._y).lengthSq()); }

	dot(v: Vertex2D): number { return f4(new Vector2(this._x, this._y).dot(new Vector2(v._x, v._y))); }

	equals(v?: Vertex2D): boolean { return !!v && this._x === v._x && this._y === v._y; }

	/** Converts to THREE.Vector2 (for rendering). */
	toThree(): Vector2 { return new Vector2(this._x, this._y); }

	/** Creates from THREE.Vector2. */
	static fromThree(v: Vector2): Vertex2D { return new Vertex2D(v.x, v.y); }
}

/** 2D vertex with editor flags. */
export class RenderVertex extends Vertex2D implements IRenderVertex {
	fSmooth = false;
	fSlingshot = false;
	fControlPoint = false;
}
