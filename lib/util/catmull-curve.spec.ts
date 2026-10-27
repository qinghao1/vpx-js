// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { Vertex3D } from '../math/vector.js'
import { CatmullCurve3D } from './catmull-curve.js'

describe('CatmullCurve3D.fromVertex3D', () => {
	it('accepts Vertex3D and preserves height through the control point', () => {
		const v0 = new Vertex3D(0, 0, 10)
		const v1 = new Vertex3D(100, 0, 20)
		const v2 = new Vertex3D(100, 100, 30)
		const v3 = new Vertex3D(0, 100, 40)
		const curve = CatmullCurve3D.fromVertex3D(v0, v1, v2, v3)
		// Centripetal evaluation at t=0 reproduces the second control point.
		const at = curve.getPointAt(0) as unknown as { x: number; y: number; z: number }
		expect(at.x).toBeCloseTo(100, 6)
		expect(at.y).toBeCloseTo(0, 6)
		expect(at.z).toBeCloseTo(20, 6)
	})
})
