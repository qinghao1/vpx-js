// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex2D, Vertex3D } from '../../math/vector.js'
import { Hit3DPoly } from '../../physics/hit-3dpoly.js'
import type { HitObject } from '../../physics/hit-object.js'
import { LineSeg } from '../../physics/line-seg.js'
import { logger } from '../../util/logger.js'
import type { TableData } from './table-data.js'

/** Table enclosure hit shapes: 4 wall LineSegs + sloped glass Hit3DPoly. @see https://github.com/vpinball/vpinball/blob/master/src/parts/pintable.cpp */
export class TableHitGenerator {
	constructor(private readonly data: TableData) {}

	public generateHitObjects(): HitObject[] {
		const hitObjects: HitObject[] = []
		hitObjects.push(
			new LineSeg(
				new Vertex2D(this.data.right, this.data.top),
				new Vertex2D(this.data.right, this.data.bottom),
				this.data.tableHeight,
				this.data.glassHeight,
			),
		)
		hitObjects.push(
			new LineSeg(
				new Vertex2D(this.data.left, this.data.bottom),
				new Vertex2D(this.data.left, this.data.top),
				this.data.tableHeight,
				this.data.glassBottomHeight,
			),
		)
		hitObjects.push(
			new LineSeg(
				new Vertex2D(this.data.right, this.data.bottom),
				new Vertex2D(this.data.left, this.data.bottom),
				this.data.tableHeight,
				this.data.glassBottomHeight,
			),
		)
		hitObjects.push(
			new LineSeg(
				new Vertex2D(this.data.left, this.data.top),
				new Vertex2D(this.data.right, this.data.top),
				this.data.tableHeight,
				this.data.glassHeight,
			),
		)
		const rgv3D: Vertex3D[] = [
			new Vertex3D(this.data.left, this.data.top, this.data.glassHeight),
			new Vertex3D(this.data.right, this.data.top, this.data.glassHeight),
			new Vertex3D(this.data.right, this.data.bottom, this.data.glassBottomHeight),
			new Vertex3D(this.data.left, this.data.bottom, this.data.glassBottomHeight),
		]
		const ph3dpoly = new Hit3DPoly(rgv3D)
		ph3dpoly.calcHitBBox()
		hitObjects.push(ph3dpoly)
		logger().debug('[Player] Playfield hit objects set.', hitObjects)
		return hitObjects
	}
}
