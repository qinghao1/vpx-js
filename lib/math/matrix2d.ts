// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix3, Vector3 } from 'three';
import { Pool } from '../util/object-pool.js';
import { Vertex3D } from './vertex3d.js';

/** 3×3 rotation matrix (VP-compatible, three.js interoperable). */
export class Matrix2D {
	private static readonly POOL = new Pool(Matrix2D);

	/** Column-major 3×3 matrix. */
	readonly matrix: number[][] = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	];

	/** Claims a pooled instance. */
	static claim(): Matrix2D { return Matrix2D.POOL.get(); }

	/** Releases instances. */
	static release(...ms: Matrix2D[]): void { for (const m of ms) Matrix2D.POOL.release(m); }

	/** Resets pooled instance. */
	static reset(m: Matrix2D): void { m.setIdentity(); }

	/** Sets to identity. */
	setIdentity(): this {
		this.matrix[0][0] = 1; this.matrix[0][1] = 0; this.matrix[0][2] = 0;
		this.matrix[1][0] = 0; this.matrix[1][1] = 1; this.matrix[1][2] = 0;
		this.matrix[2][0] = 0; this.matrix[2][1] = 0; this.matrix[2][2] = 1;
		return this;
	}

	/** Multiplies vector (matrixᵀ·v). */
	multiplyVectorT(v: Vertex3D, recycle = false): Vertex3D {
		const x = this.matrix[0][0] * v.x + this.matrix[1][0] * v.y + this.matrix[2][0] * v.z;
		const y = this.matrix[0][1] * v.x + this.matrix[1][1] * v.y + this.matrix[2][1] * v.z;
		const z = this.matrix[0][2] * v.x + this.matrix[1][2] * v.y + this.matrix[2][2] * v.z;
		return recycle ? Vertex3D.claim(x, y, z) : new Vertex3D(x, y, z);
	}

	/** Sets rotation around axis. */
	rotationAroundAxis(axis: Vertex3D, s: number, c: number): void {
		const { x, y, z } = axis; const oc = 1 - c;
		this.matrix[0][0] = x * x + c * (1 - x * x);
		this.matrix[1][0] = x * y * oc - z * s;
		this.matrix[2][0] = z * x * oc + y * s;
		this.matrix[0][1] = x * y * oc + z * s;
		this.matrix[1][1] = y * y + c * (1 - y * y);
		this.matrix[2][1] = y * z * oc - x * s;
		this.matrix[0][2] = z * x * oc - y * s;
		this.matrix[1][2] = y * z * oc + x * s;
		this.matrix[2][2] = z * z + c * (1 - z * z);
	}

	/** Sets skew-symmetric matrix of v. */
	createSkewSymmetric(v: Vertex3D): this {
		this.matrix[0][0] = 0; this.matrix[0][1] = -v.z; this.matrix[0][2] = v.y;
		this.matrix[1][0] = v.z; this.matrix[1][1] = 0; this.matrix[1][2] = -v.x;
		this.matrix[2][0] = -v.y; this.matrix[2][1] = v.x; this.matrix[2][2] = 0;
		return this;
	}

	/** Clones, optionally pooled. */
	clone(recycle = false): Matrix2D {
		const m = recycle ? Matrix2D.claim() : new Matrix2D();
		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m.matrix[i][j] = this.matrix[i][j];
		return m;
	}

	/** Copies from other. */
	set(m: Matrix2D): void {
		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.matrix[i][j] = m.matrix[i][j];
	}

	/** Sets to a·b via three.js. */
	multiplyMatrix(a: Matrix2D, b: Matrix2D): void {
		const am = new Matrix3().set(
			a.matrix[0][0], a.matrix[1][0], a.matrix[2][0],
			a.matrix[0][1], a.matrix[1][1], a.matrix[2][1],
			a.matrix[0][2], a.matrix[1][2], a.matrix[2][2],
		);
		const bm = new Matrix3().set(
			b.matrix[0][0], b.matrix[1][0], b.matrix[2][0],
			b.matrix[0][1], b.matrix[1][1], b.matrix[2][1],
			b.matrix[0][2], b.matrix[1][2], b.matrix[2][2],
		);
		const out = new Matrix3().multiplyMatrices(am, bm);
		const e = out.elements;
		this.matrix[0][0] = e[0]; this.matrix[1][0] = e[1]; this.matrix[2][0] = e[2];
		this.matrix[0][1] = e[3]; this.matrix[1][1] = e[4]; this.matrix[2][1] = e[5];
		this.matrix[0][2] = e[6]; this.matrix[1][2] = e[7]; this.matrix[2][2] = e[8];
	}

	/** Scales all elements. */
	multiplyScalar(s: number): void {
		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.matrix[i][j] *= s;
	}

	/** Sets to a+b. */
	addMatrix(a: Matrix2D, b: Matrix2D): void {
		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.matrix[i][j] = a.matrix[i][j] + b.matrix[i][j];
	}

	/** Orthonormalizes via three.js Vector3. */
	orthoNormalize(): void {
		const vx = new Vector3(this.matrix[0][0], this.matrix[1][0], this.matrix[2][0]);
		const vy = new Vector3(this.matrix[0][1], this.matrix[1][1], this.matrix[2][1]);
		const vz = new Vector3().crossVectors(vx, vy);
		vx.normalize(); vz.normalize();
		const vyy = new Vector3().crossVectors(vz, vx);
		this.matrix[0][0] = vx.x; this.matrix[0][1] = vyy.x; this.matrix[0][2] = vz.x;
		this.matrix[1][0] = vx.y; this.matrix[1][1] = vyy.y; this.matrix[1][2] = vz.y;
		this.matrix[2][0] = vx.z; this.matrix[2][1] = vyy.z; this.matrix[2][2] = vz.z;
	}

	/** Exact equality. */
	equals(m: Matrix2D): boolean {
		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (this.matrix[i][j] !== m.matrix[i][j]) return false;
		return true;
	}

	/** Converts to THREE.Matrix3. */
	toThree(): Matrix3 {
		return new Matrix3().set(
			this.matrix[0][0], this.matrix[1][0], this.matrix[2][0],
			this.matrix[0][1], this.matrix[1][1], this.matrix[2][1],
			this.matrix[0][2], this.matrix[1][2], this.matrix[2][2],
		);
	}

	/** Creates from THREE.Matrix3. */
	static fromThree(m: Matrix3): Matrix2D {
		const e = m.elements, out = new Matrix2D();
		out.matrix[0][0] = e[0]; out.matrix[1][0] = e[1]; out.matrix[2][0] = e[2];
		out.matrix[0][1] = e[3]; out.matrix[1][1] = e[4]; out.matrix[2][1] = e[5];
		out.matrix[0][2] = e[6]; out.matrix[1][2] = e[7]; out.matrix[2][2] = e[8];
		return out;
	}

	toString(): string {
		const r = (n: number) => Math.round(n * 1000) / 1000;
		return `[${r(this.matrix[0][0])}, ${r(this.matrix[0][1])}, ${r(this.matrix[0][2])}]\n[${r(this.matrix[1][0])}, ${r(this.matrix[1][1])}, ${r(this.matrix[1][2])}]\n[${r(this.matrix[2][0])}, ${r(this.matrix[2][1])}, ${r(this.matrix[2][2])}]`;
	}
}
