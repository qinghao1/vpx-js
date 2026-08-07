// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { PlungerCoord } from './plunger-coord.js'
import type { PlungerData } from './plunger-data.js'

/** Plunger 3D shape descriptor. @see https://github.com/vpinball/vpinball/blob/master/plunger.cpp */
export class PlungerDesc {
	constructor(
		public n: number,
		public c: PlungerCoord[],
	) {}

	public static getModern(): PlungerDesc {
		const modernCoords = [
			new PlungerCoord(0.2, 0.0, 0.0, 1.0, 0.0),
			new PlungerCoord(0.3, 3.0, 0.11, 1.0, 0.0),
			new PlungerCoord(0.35, 5.0, 0.14, 1.0, 0.0),
			new PlungerCoord(0.35, 23.0, 0.19, 1.0, 0.0),
			new PlungerCoord(0.45, 23.0, 0.21, 0.8, 0.0),
			new PlungerCoord(0.25, 24.0, 0.25, 0.3, 0.0),
			new PlungerCoord(0.25, 100.0, 1.0, 0.3, 0.0),
		]
		return new PlungerDesc(modernCoords.length, modernCoords)
	}

	public static getFlat(): PlungerDesc {
		return new PlungerDesc(0, [])
	}

	public static getCustom(data: PlungerData, beginY: number, springMinSpacing: number): CustomDescResult {
		let i: number
		let nn = 2 + 6 + 2 + 1 + 1
		const tipShapes = data.szTipShape ? data.szTipShape.split(';') : []
		const nTip = tipShapes.length
		nn += tipShapes.length - 1
		const desc = new PlungerDesc(nn, [])
		for (i = 0; i < nn; i++) desc.c.push(new PlungerCoord(0, 0, 0, 0, 1))
		let tipLen = 0
		for (i = 0; i < tipShapes.length; i++) {
			const tipShape = tipShapes[i]!
			const ts = tipShape.trim().split(' ')
			const yOffset = parseInt(ts[0]!, 10)
			const diam = parseFloat(ts[1]!)
			const c = desc.c[i]!
			c.y = yOffset
			c.r = diam / 2
			if (c.y < tipLen) c.y = tipLen
			tipLen = c.y
		}
		let cprv = new PlungerCoord(0, 0, 0, 0, 1)
		for (i = 0; i < tipShapes.length; i++) {
			const c = desc.c[i]!
			c.tv = (0.24 * c.y) / tipLen
			const cnxt = desc.c[i + 1 < nTip ? i + 1 : i]!
			const x0 = cprv.r
			const y0 = cprv.y
			const x1 = cnxt.r
			const y1 = cnxt.y
			const th = Math.atan2(y1 - y0, (x1 - x0) * data.width)
			c.nx = Math.sin(th)
			c.ny = -Math.cos(th)
			cprv = c
		}
		const rRod = data.rodDiam / 2
		let y = tipLen
		desc.c[i++].set(rRod, y, 0.24, 1.0, 0.0)
		desc.c[i++].set(rRod, y, 0.51, 1.0, 0.0)
		y += data.ringGap
		desc.c[i++].set(rRod, y, 0.55, 1.0, 0.0)
		const rRing = data.ringDiam / 2
		desc.c[i++].set(rRod, y, 0.26, 0.0, -1.0)
		desc.c[i++].set(rRing, y, 0.33, 0.0, -1.0)
		desc.c[i++].set(rRing, y, 0.33, 1.0, 0.0)
		y += data.ringWidth
		desc.c[i++].set(rRing, y, 0.42, 1.0, 0.0)
		desc.c[i++].set(rRing, y, 0.42, 0.0, 1.0)
		desc.c[i++].set(rRod, y, 0.49, 0.0, 1.0)
		const springRadius = data.springDiam / 2
		const springGauge = data.springGauge
		const springLoops = data.springLoops
		const springEndLoops = data.springEndLoops
		desc.c[i++].set(rRod, y, 0.51, 1.0, 0.0)
		const springMin = (springLoops + springEndLoops) * springMinSpacing
		const rody = beginY + y + springMin
		desc.c[i].set(rRod, rody, 0.74, 1.0, 0.0)
		return { desc, springRadius, springGauge, springLoops, springEndLoops, rody }
	}
}

export interface CustomDescResult {
	desc: PlungerDesc
	springRadius: number
	springGauge: number
	springLoops: number
	springEndLoops: number
	rody: number
}
