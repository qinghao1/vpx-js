// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import { CollisionType } from '../../physics/collision-type.js'
import { PHYS_SKIN } from '../../physics/constants.js'
import { Hit3DPoly } from '../../physics/hit-3dpoly.js'
import type { HitObject } from '../../physics/hit-object.js'
import { CatmullCurve2D } from '../../util/catmull-curve.js'
import { DragPoint } from '../../util/dragpoint.js'
import { Vertex2D, Vertex3D } from '../../util/math.js'
import { RenderVertex } from '../../util/render-vertex.js'
import type { Table } from '../table/table.js'
import type { TriggerAnimation } from './trigger-animation.js'
import type { TriggerData } from './trigger-data.js'
import { TriggerLineSeg } from './trigger-line-seg.js'

/** Generates trigger hit shapes. @see https://github.com/vpinball/vpinball/blob/master/trigger.cpp */
export class TriggerHitGenerator {
	constructor(private readonly data: TriggerData) {}
	public generateHitObjects(animation: TriggerAnimation, events: EventProxy, table: Table): HitObject[] {
		const h = table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y)
		const vVertex = DragPoint.getRgVertex<RenderVertex>(
			this.data.dragPoints,
			() => new RenderVertex(),
			CatmullCurve2D.fromVertex2D,
		)
		const n = vVertex.length
		const rgv3D = vVertex.map((v) => new Vertex3D(v.x, v.y, h + PHYS_SKIN * 2))
		const hits: HitObject[] = []
		for (let i = 0; i < n; i++) {
			const pv2 = vVertex[i < n - 1 ? i + 1 : 0]!,
				pv3 = vVertex[i < n - 2 ? i + 2 : i + 2 - n]!
			hits.push(this.lineSeg(pv2, pv3, animation, events, h))
		}
		const poly = new Hit3DPoly(rgv3D, CollisionType.Trigger)
		poly.obj = events
		hits.push(poly)
		return hits
	}
	private lineSeg(
		pv1: RenderVertex,
		pv2: RenderVertex,
		animation: TriggerAnimation,
		events: EventProxy,
		height: number,
	): TriggerLineSeg {
		const seg = new TriggerLineSeg(
			new Vertex2D(pv1.x, pv1.y),
			new Vertex2D(pv2.x, pv2.y),
			height,
			height + Math.max(this.data.hitHeight - 8, 0),
			this.data,
			animation,
		)
		seg.obj = events
		return seg
	}
}
