// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import { CatmullCurve2D } from '../../math/catmull-curve.js'
import { DragPoint } from '../../math/dragpoint.js'
import { RenderVertex, Vertex2D } from '../../math/vertex2d.js'
import { Vertex3D } from '../../math/vertex3d.js'
import { CollisionType } from '../../physics/collision-type.js'
import { PHYS_SKIN } from '../../physics/constants.js'
import { Hit3DPoly } from '../../physics/hit-3dpoly.js'
import type { HitObject } from '../../physics/hit-object.js'
import type { Table } from '../table/table.js'
import type { TriggerAnimation } from './trigger-animation.js'
import type { TriggerData } from './trigger-data.js'
import { TriggerLineSeg } from './trigger-line-seg.js'

export /** TriggerHitGenerator. */
class TriggerHitGenerator {
	private readonly data: TriggerData

	constructor(data: TriggerData) {
		this.data = data
	}

	public generateHitObjects(animation: TriggerAnimation, events: EventProxy, table: Table): HitObject[] {
		const hitObjects: HitObject[] = []
		const height = table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y)
		const vVertex: RenderVertex[] = DragPoint.getRgVertex<RenderVertex>(
			this.data.dragPoints,
			() => new RenderVertex(),
			CatmullCurve2D.fromVertex2D as any,
		)

		const count = vVertex.length
		const rgv: RenderVertex[] = new Array<RenderVertex>(count)
		const rgv3D: Vertex3D[] = new Array<Vertex3D>(count)

		for (let i = 0; i < count; i++) {
			rgv[i] = vVertex[i]
			rgv3D[i] = new Vertex3D(rgv[i].x, rgv[i].y, height + PHYS_SKIN * 2.0)
		}

		for (let i = 0; i < count; i++) {
			const pv2 = rgv[i < count - 1 ? i + 1 : 0]
			const pv3 = rgv[i < count - 2 ? i + 2 : i + 2 - count]
			hitObjects.push(this.getLineSeg(pv2, pv3, animation, events, height))
		}

		const ph3dpoly = new Hit3DPoly(rgv3D, CollisionType.Trigger)
		ph3dpoly.obj = events
		hitObjects.push(ph3dpoly)

		return hitObjects
	}

	private getLineSeg(
		pv1: RenderVertex,
		pv2: RenderVertex,
		animation: TriggerAnimation,
		events: EventProxy,
		height: number,
	): TriggerLineSeg {
		const lineSeg = new TriggerLineSeg(
			new Vertex2D(pv1.x, pv1.y),
			new Vertex2D(pv2.x, pv2.y),
			height,
			height + Math.max(this.data.hitHeight - 8.0, 0), //adjust for same hit height as circular
			this.data,
			animation,
		)
		lineSeg.obj = events
		return lineSeg
	}
}
