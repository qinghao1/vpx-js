// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { Hit3DPoly } from '../../physics/hit-3dpoly.js'
import { HitLine3D } from '../../physics/hit-line-3d.js'
import { HitLineZ } from '../../physics/hit-line-z.js'
import type { HitObject } from '../../physics/hit-object.js'
import { HitPoint } from '../../physics/hit-point.js'
import { LineSeg } from '../../physics/line-seg.js'
import { LineSegSlingshot } from '../../physics/line-seg-slingshot.js'
import { CatmullCurve2D } from '../../util/catmull-curve.js'
import { DragPoint } from '../../util/dragpoint.js'
import { Vertex3D } from '../../util/math.js'
import { RenderVertex } from '../../util/render-vertex.js'
import type { Table } from '../table/table.js'
import type { Surface } from './surface.js'
import type { SurfaceData } from './surface-data.js'

/** Surface hit generator. @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class SurfaceHitGenerator {
	public lineSling: LineSegSlingshot[] = []

	constructor(
		private readonly surface: Surface,
		private readonly data: SurfaceData,
	) {}

	public generateHitObjects(events: EventProxy, physics: PlayerPhysics, table: Table): HitObject[] {
		return this.updateCommonParameters(this.generate3DPolys(events, physics, table), events, table)
	}

	private generate3DPolys(events: EventProxy, physics: PlayerPhysics, table: Table): HitObject[] {
		const hitObjects: HitObject[] = []
		const vVertex = DragPoint.getRgVertex(this.data.dragPoints, () => new RenderVertex(), CatmullCurve2D.fromVertex2D)
		const count = vVertex.length
		const rgv3Dt: Vertex3D[] = []
		const rgv3Db: Vertex3D[] | null = this.data.isBottomSolid ? [] : null
		const bottom = this.data.heightBottom + table.getTableHeight()
		const top = this.data.heightTop + table.getTableHeight()
		for (let i = 0; i < count; ++i) {
			const pv1 = vVertex[i]!
			rgv3Dt[i] = new Vertex3D(pv1.x, pv1.y, top)
			if (rgv3Db) rgv3Db[count - 1 - i] = new Vertex3D(pv1.x, pv1.y, bottom)
			const pv2 = vVertex[(i + 1) % count]!
			const pv3 = vVertex[(i + 2) % count]!
			hitObjects.push(...this.generateLinePolys(pv2, pv3, events, physics, table))
		}
		hitObjects.push(new Hit3DPoly(rgv3Dt))
		if (rgv3Db) hitObjects.push(new Hit3DPoly(rgv3Db))
		return hitObjects
	}

	private generateLinePolys(
		pv1: RenderVertex,
		pv2: RenderVertex,
		events: EventProxy,
		physics: PlayerPhysics,
		table: Table,
	): HitObject[] {
		const linePolys: HitObject[] = []
		const bottom = this.data.heightBottom + table.getTableHeight()
		const top = this.data.heightTop + table.getTableHeight()
		if (!pv1.fSlingshot) {
			linePolys.push(new LineSeg(pv1, pv2, bottom, top))
		} else {
			const slingLine = new LineSegSlingshot(this.surface, this.data, pv1, pv2, bottom, top, physics)
			slingLine.force = this.data.slingshotForce
			slingLine.obj = events
			slingLine.fe = true
			slingLine.threshold = this.data.threshold!
			linePolys.push(slingLine)
			this.lineSling.push(slingLine)
		}
		if (this.data.heightBottom !== 0) {
			linePolys.push(new HitLine3D(new Vertex3D(pv1.x, pv1.y, bottom), new Vertex3D(pv2.x, pv2.y, bottom)))
		}
		linePolys.push(new HitLine3D(new Vertex3D(pv1.x, pv1.y, top), new Vertex3D(pv2.x, pv2.y, top)))
		linePolys.push(new HitLineZ(pv1, bottom, top))
		if (this.data.heightBottom !== 0) linePolys.push(new HitPoint(new Vertex3D(pv1.x, pv1.y, bottom)))
		linePolys.push(new HitPoint(new Vertex3D(pv1.x, pv1.y, top)))
		return linePolys
	}

	private updateCommonParameters(hitObjects: HitObject[], events: EventProxy, table: Table): HitObject[] {
		for (const obj of hitObjects) {
			obj.applyPhysics(this.data, table)
			if (this.data.hitEvent) {
				obj.obj = events
				obj.fe = true
				obj.threshold = this.data.threshold!
			}
		}
		return hitObjects
	}
}
