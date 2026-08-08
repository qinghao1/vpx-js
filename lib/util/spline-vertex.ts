// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { CatmullCurve2D } from './catmull-curve.js'
import { DragPoint } from './dragpoint.js'
import { f4 } from './float.js'
import { Vertex2D } from './math.js'
import { RenderVertex } from './render-vertex.js'

/** Thickened spline for wall/rubber. @see https://github.com/vpinball/vpinball/blob/master/spline.cpp */
export class SplineVertex {
	pcvertex!: number
	ppfCross: boolean[] = []
	pMiddlePoints: Vertex2D[] = []
	rgvLocal: Vertex2D[] = []

	/** Builds thick spline from drag points. */
	static getInstance(
		dragPoints: DragPoint[],
		thickness: number,
		detail: number,
		accuracy: number,
		staticRendering = true,
	): SplineVertex {
		const v = new SplineVertex()
		const spine = SplineVertex.getCentralCurve(dragPoints, detail, accuracy, staticRendering)
		const n = spine.length
		for (let i = 0; i < n; i++) {
			const prev = spine[i ? i - 1 : n - 1]!
			const next = spine[i < n - 1 ? i + 1 : 0]!
			const mid = spine[i]!
			v.ppfCross[i] = mid.fControlPoint
			const n1 = new Vertex2D(prev.y - mid.y, mid.x - prev.x).normalize()
			const n2 = new Vertex2D(mid.y - next.y, next.x - mid.x).normalize()
			let normal: Vertex2D
			if (n === 2) normal = i === n - 1 ? n1 : n2
			else if (Math.abs(n1.x - n2.x) < 1e-4 && Math.abs(n1.y - n2.y) < 1e-4) normal = n1
			else {
				const A = f4(prev.y - mid.y)
				const B = f4(mid.x - prev.x)
				const C = f4(A * (n1.x - prev.x) + B * (n1.y - prev.y))
				const D = f4(next.y - mid.y)
				const E = f4(mid.x - next.x)
				const F = f4(D * (n2.x - next.x) + E * (n2.y - next.y))
				const det = f4(A * E - B * D)
				const inv = det ? f4(1 / det) : 0
				const ix = f4((B * F - E * C) * inv)
				const iy = f4((C * D - A * F) * inv)
				normal = new Vertex2D(mid.x - ix, mid.y - iy)
			}
			v.pMiddlePoints[i] = mid
			const half = normal.clone().multiplyScalar(thickness * 0.5)
			v.rgvLocal[i] = mid.clone().add(half)
			v.rgvLocal[(n + 1) * 2 - i - 1] = mid.clone().sub(half)
			if (i === 0) {
				v.rgvLocal[n] = v.rgvLocal[0]!
				v.rgvLocal[(n + 1) * 2 - n - 1] = v.rgvLocal[(n + 1) * 2 - 1]!
			}
		}
		v.ppfCross[n] = spine[0]?.fControlPoint
		v.pMiddlePoints[n] = v.pMiddlePoints[0]!
		v.pcvertex = n + 1
		return v
	}

	/** Central (thin) spine with adaptive accuracy. */
	static getCentralCurve(dragPoints: DragPoint[], detail: number, acc: number, staticRendering = true): RenderVertex[] {
		const accuracy = acc !== -1 ? acc : 4 * 10 ** ((10 - (staticRendering ? 10 : detail)) / 1.5)
		return DragPoint.getRgVertex(dragPoints, () => new RenderVertex(), CatmullCurve2D.fromVertex2D, true, accuracy)
	}
}
