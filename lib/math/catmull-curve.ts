// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { f4 } from './float.js'
import type { IRenderVertex, Vertex } from './vertex.js'
import { RenderVertex, type Vertex2D } from './vertex2d.js'
import { RenderVertex3D, type Vertex3D } from './vertex3d.js'

/** Catmull-Rom curve — non-uniform centripetal.
 * @see https://github.com/vpinball/vpinball/blob/master/mesh.h */
export abstract class CatmullCurve {
	public abstract getPointAt(t: number): IRenderVertex

	protected static dt(v0: Vertex, v1: Vertex, v2: Vertex, v3: Vertex): [number, number, number] {
		let dt0 = f4(Math.sqrt(v1.clone().sub(v0).length()))
		let dt1 = f4(Math.sqrt(v2.clone().sub(v1).length()))
		let dt2 = f4(Math.sqrt(v3.clone().sub(v2).length()))
		if (dt1 < 1e-4) dt1 = 1
		if (dt0 < 1e-4) dt0 = dt1
		if (dt2 < 1e-4) dt2 = dt1
		return [dt0, dt1, dt2]
	}

	protected static initNonuniformCatmullCoeffs(
		x0: number,
		x1: number,
		x2: number,
		x3: number,
		dt0: number,
		dt1: number,
		dt2: number,
	): number[] {
		let t1 = f4(f4(f4(f4(x1 - x0) / dt0) - f4(f4(x2 - x0) / f4(dt0 + dt1))) + f4(f4(x2 - x1) / dt1))
		let t2 = f4(f4(f4(f4(x2 - x1) / dt1) - f4(f4(x3 - x1) / f4(dt1 + dt2))) + f4(f4(x3 - x2) / dt2))
		t1 = f4(t1 * dt1)
		t2 = f4(t2 * dt1)
		return CatmullCurve.coeffs(x1, x2, f4(t1), f4(t2))
	}

	private static coeffs(x0: number, x1: number, t0: number, t1: number): number[] {
		return [
			f4(x0),
			f4(t0),
			f4(f4(f4(-3 * x0) + f4(3 * x1)) - f4(2 * t0) - t1),
			f4(f4(f4(f4(2 * x0) - f4(2 * x1)) + t0) + t1),
		]
	}

	protected static evalCubic(c: number[], t: number): number {
		const t2 = f4(t * t),
			t3 = f4(t2 * t)
		return f4(f4(f4(c[3] * t3) + f4(c[2] * t2)) + f4(c[1] * t)) + c[0]
	}
}

export class CatmullCurve2D extends CatmullCurve {
	private c: { x: number[]; y: number[] } = { x: [0, 0, 0, 0], y: [0, 0, 0, 0] }

	public static fromVertex2D(v0: Vertex2D, v1: Vertex2D, v2: Vertex2D, v3: Vertex2D): CatmullCurve2D {
		const [dt0, dt1, dt2] = CatmullCurve.dt(v0, v1, v2, v3)
		return new CatmullCurve2D(v0, v1, v2, v3, dt0, dt1, dt2)
	}

	public static fromVertex3D(v0: Vertex3D, v1: Vertex3D, v2: Vertex3D, v3: Vertex3D): CatmullCurve2D {
		return CatmullCurve2D.fromVertex2D(v0.xy(), v1.xy(), v2.xy(), v3.xy())
	}

	private constructor(v0: Vertex2D, v1: Vertex2D, v2: Vertex2D, v3: Vertex2D, dt0: number, dt1: number, dt2: number) {
		super()
		this.c.x = CatmullCurve.initNonuniformCatmullCoeffs(v0.x, v1.x, v2.x, v3.x, dt0, dt1, dt2)
		this.c.y = CatmullCurve.initNonuniformCatmullCoeffs(v0.y, v1.y, v2.y, v3.y, dt0, dt1, dt2)
	}

	public getPointAt(t: number): IRenderVertex {
		return new RenderVertex(CatmullCurve.evalCubic(this.c.x, t), CatmullCurve.evalCubic(this.c.y, t))
	}
}

export class CatmullCurve3D extends CatmullCurve {
	private c: { x: number[]; y: number[]; z: number[] } = { x: [0, 0, 0, 0], y: [0, 0, 0, 0], z: [0, 0, 0, 0] }

	public static fromVertex3D(v0: Vertex3D, v1: Vertex3D, v2: Vertex3D, v3: Vertex3D): CatmullCurve3D {
		const [dt0, dt1, dt2] = CatmullCurve.dt(v0, v1, v2, v3)
		return new CatmullCurve3D(v0, v1, v2, v3, dt0, dt1, dt2)
	}

	private constructor(v0: Vertex3D, v1: Vertex3D, v2: Vertex3D, v3: Vertex3D, dt0: number, dt1: number, dt2: number) {
		super()
		this.c.x = CatmullCurve.initNonuniformCatmullCoeffs(v0.x, v1.x, v2.x, v3.x, dt0, dt1, dt2)
		this.c.y = CatmullCurve.initNonuniformCatmullCoeffs(v0.y, v1.y, v2.y, v3.y, dt0, dt1, dt2)
		this.c.z = CatmullCurve.initNonuniformCatmullCoeffs(v0.z, v1.z, v2.z, v3.z, dt0, dt1, dt2)
	}

	public getPointAt(t: number): IRenderVertex {
		return new RenderVertex3D(
			CatmullCurve.evalCubic(this.c.x, t),
			CatmullCurve.evalCubic(this.c.y, t),
			CatmullCurve.evalCubic(this.c.z, t),
		)
	}
}
