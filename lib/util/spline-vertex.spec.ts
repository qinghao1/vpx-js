// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { Vertex3D } from '../math/vector.js'
import { DragPoint } from '../vpt/dragpoint.js'
import { SplineVertex } from './spline-vertex.js'

function square(): DragPoint[] {
	return [
		[0, 0],
		[100, 0],
		[100, 100],
		[0, 100],
	].map(([x, y]) =>
		Object.assign(new DragPoint(), {
			vertex: new Vertex3D(x, y, 0),
			fSmooth: true,
			fSlingshot: false,
			fAutoTexture: true,
			texturecoord: 0,
		}),
	)
}

describe('SplineVertex', () => {
	it('keeps ppfCross boolean even for an empty spine', () => {
		const v = SplineVertex.getInstance([], 1, 10, 4)
		expect(v.ppfCross.length).toBe(1)
		for (const flag of v.ppfCross) expect(typeof flag).toBe('boolean')
	})

	it('honors the explicit lowQuality parameter instead of the global', () => {
		const hi = SplineVertex.getCentralCurve(square(), 16, -1, false, false)
		const lo = SplineVertex.getCentralCurve(square(), 16, -1, false, true)
		expect(lo.length).toBeGreaterThan(0)
		expect(lo.length).toBeLessThan(hi.length)
	})
})
