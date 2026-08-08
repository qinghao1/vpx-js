// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { f4 } from './float.js'
import type { Vertex3D } from './math.js'
import { RenderVertex, RenderVertex3D } from './render-vertex.js'
import type { IRenderVertex, Vertex } from './vertex.js'

/** Non-uniform centripetal Catmull-Rom spline. @see https://github.com/vpinball/vpinball/blob/master/mesh.h */
export abstract class CatmullCurve {
	/** Evaluate at `t` ∈ [0,1]. */
	abstract getPointAt(t: number): IRenderVertex

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
		let t1 = f4((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1)
		let t2 = f4((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2)
		t1 = f4(t1 * dt1)
		t2 = f4(t2 * dt1)
		return CatmullCurve.coeffs(x1, x2, t1, t2)
	}

	private static coeffs(x0: number, x1: number, t0: number, t1: number): number[] {
		return [f4(x0), f4(t0), f4(-3 * x0 + 3 * x1 - 2 * t0 - t1), f4(2 * x0 - 2 * x1 + t0 + t1)]
	}

	protected static evalCubic(c: number[], t: number): number {
		const t2 = f4(t * t)
		const t3 = f4(t2 * t)
		return f4(c[3]! * t3 + c[2]! * t2 + c[1]! * t) + c[0]!
	}
}

/** 2D Catmull curve. */
export class CatmullCurve2D extends CatmullCurve {
	private readonly c: { x: number[]; y: number[] }

	static fromVertex2D(v0: Vertex, v1: Vertex, v2: Vertex, v3: Vertex): CatmullCurve2D {
		const [dt0, dt1, dt2] = CatmullCurve.dt(v0, v1, v2, v3)
		return new CatmullCurve2D(v0, v1, v2, v3, dt0, dt1, dt2)
	}

	static fromVertex3D(v0: Vertex3D, v1: Vertex3D, v2: Vertex3D, v3: Vertex3D): CatmullCurve2D {
		return CatmullCurve2D.fromVertex2D(v0.xy(), v1.xy(), v2.xy(), v3.xy())
	}

	private constructor(v0: Vertex, v1: Vertex, v2: Vertex, v3: Vertex, dt0: number, dt1: number, dt2: number) {
		super()
		this.c = {
			x: CatmullCurve.initNonuniformCatmullCoeffs(v0.x, v1.x, v2.x, v3.x, dt0, dt1, dt2),
			y: CatmullCurve.initNonuniformCatmullCoeffs(v0.y, v1.y, v2.y, v3.y, dt0, dt1, dt2),
		}
	}

	override getPointAt(t: number): IRenderVertex {
		return new RenderVertex(CatmullCurve.evalCubic(this.c.x, t), CatmullCurve.evalCubic(this.c.y, t))
	}
}

/** 3D Catmull curve. */
export class CatmullCurve3D extends CatmullCurve {
	private readonly c: { x: number[]; y: number[]; z: number[] }

	static fromVertex3D(v0: Vertex, v1: Vertex, v2: Vertex, v3: Vertex): CatmullCurve3D {
		const [dt0, dt1, dt2] = CatmullCurve.dt(v0, v1, v2, v3)
		const z0 = (v0 as Vertex3D).z ?? 0
		const z1 = (v1 as Vertex3D).z ?? 0
		const z2 = (v2 as Vertex3D).z ?? 0
		const z3 = (v3 as Vertex3D).z ?? 0
		return new CatmullCurve3D(v0, v1, v2, v3, z0, z1, z2, z3, dt0, dt1, dt2)
	}

	private constructor(
		v0: Vertex,
		v1: Vertex,
		v2: Vertex,
		v3: Vertex,
		z0: number,
		z1: number,
		z2: number,
		z3: number,
		dt0: number,
		dt1: number,
		dt2: number,
	) {
		super()
		this.c = {
			x: CatmullCurve.initNonuniformCatmullCoeffs(v0.x, v1.x, v2.x, v3.x, dt0, dt1, dt2),
			y: CatmullCurve.initNonuniformCatmullCoeffs(v0.y, v1.y, v2.y, v3.y, dt0, dt1, dt2),
			z: CatmullCurve.initNonuniformCatmullCoeffs(z0, z1, z2, z3, dt0, dt1, dt2),
		}
	}

	override getPointAt(t: number): IRenderVertex {
		return new RenderVertex3D(
			CatmullCurve.evalCubic(this.c.x, t),
			CatmullCurve.evalCubic(this.c.y, t),
			CatmullCurve.evalCubic(this.c.z, t),
		)
	}
}
