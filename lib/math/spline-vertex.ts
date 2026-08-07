// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { CatmullCurve2D } from './catmull-curve.js'
import { DragPoint } from './dragpoint.js'
import { f4 } from './float.js'
import { RenderVertex, Vertex2D } from './vertex2d.js'

/** Helper for rubber/wall splines. */
export class SplineVertex {
	public pcvertex!: number
	public ppfCross: boolean[] = []
	public pMiddlePoints: Vertex2D[] = []
	public rgvLocal: Vertex2D[] = []

	public static getInstance(
		dragPoints: DragPoint[],
		thickness: number,
		tableDetailLevel: number,
		accuracy: number,
		staticRendering = true,
	): SplineVertex {
		const v = new SplineVertex()
		const vvertex = SplineVertex.getCentralCurve(dragPoints, tableDetailLevel, accuracy, staticRendering)
		const n = vvertex.length

		for (let i = 0; i < n; i++) {
			const prev = vvertex[i > 0 ? i - 1 : n - 1]
			const next = vvertex[i < n - 1 ? i + 1 : 0]
			const mid = vvertex[i]
			v.ppfCross[i] = mid.fControlPoint

			let normal: Vertex2D
			const n1 = new Vertex2D(prev.y - mid.y, mid.x - prev.x)
			const n2 = new Vertex2D(mid.y - next.y, next.x - mid.x)

			if (n === 2 && i === n - 1) {
				n1.normalize()
				normal = n1
			} else if (n === 2 && i === 0) {
				n2.normalize()
				normal = n2
			} else {
				n1.normalize()
				n2.normalize()
				if (Math.abs(n1.x - n2.x) < 0.0001 && Math.abs(n1.y - n2.y) < 0.0001) normal = n1
				else {
					const A = f4(prev.y - mid.y),
						B = f4(mid.x - prev.x)
					const C = f4(f4(A * f4(n1.x - prev.x)) + f4(B * f4(n1.y - prev.y)))
					const D = f4(next.y - mid.y),
						E = f4(mid.x - next.x)
					const F = f4(f4(D * f4(n2.x - next.x)) + f4(E * f4(n2.y - next.y)))
					const det = f4(f4(A * E) - f4(B * D))
					const invDet = det !== 0 ? f4(1 / det) : 0
					const ix = f4(f4(f4(B * F) - f4(E * C)) * invDet)
					const iy = f4(f4(f4(C * D) - f4(A * F)) * invDet)
					normal = new Vertex2D(mid.x - ix, mid.y - iy)
				}
			}

			v.pMiddlePoints[i] = mid
			const half = normal.clone().multiplyScalar(thickness * 0.5)
			v.rgvLocal[i] = mid.clone().add(half)
			v.rgvLocal[(n + 1) * 2 - i - 1] = mid.clone().sub(half)
			if (i === 0) {
				v.rgvLocal[n] = v.rgvLocal[0]
				v.rgvLocal[(n + 1) * 2 - n - 1] = v.rgvLocal[(n + 1) * 2 - 1]
			}
		}
		v.ppfCross[n] = vvertex[0].fControlPoint
		v.pMiddlePoints[n] = v.pMiddlePoints[0]
		v.pcvertex = n + 1
		return v
	}

	public static getCentralCurve(
		dragPoints: DragPoint[],
		tableDetailLevel: number,
		acc: number,
		staticRendering = true,
	): RenderVertex[] {
		let accuracy: number
		if (acc !== -1) accuracy = acc
		else {
			accuracy = staticRendering ? 10 : tableDetailLevel
			accuracy = 4 * 10 ** ((10 - accuracy) * (1 / 1.5))
		}
		return DragPoint.getRgVertex<RenderVertex>(
			dragPoints,
			() => new RenderVertex(),
			CatmullCurve2D.fromVertex2D as any,
			true,
			accuracy,
		)
	}
}
