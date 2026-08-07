// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex2D } from '../../math/vertex2d.js'
import { Vertex3D } from '../../math/vertex3d.js'
import { Hit3DPoly } from '../../physics/hit-3dpoly.js'
import type { HitObject } from '../../physics/hit-object.js'
import { LineSeg } from '../../physics/line-seg.js'
import { logger } from '../../util/logger.js'
import type { TableData } from './table-data.js'

/** Generates table hit shapes. */
export class TableHitGenerator {
	private readonly data: TableData

	constructor(data: TableData) {
		this.data = data
	}

	public generateHitObjects(): HitObject[] {
		const hitObjects: HitObject[] = []

		// simple outer borders:
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
				this.data.glassHeight,
			),
		)

		hitObjects.push(
			new LineSeg(
				new Vertex2D(this.data.right, this.data.bottom),
				new Vertex2D(this.data.left, this.data.bottom),
				this.data.tableHeight,
				this.data.glassHeight,
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

		// glass
		const rgv3D: Vertex3D[] = [
			new Vertex3D(this.data.left, this.data.top, this.data.glassHeight),
			new Vertex3D(this.data.right, this.data.top, this.data.glassHeight),
			new Vertex3D(this.data.right, this.data.bottom, this.data.glassHeight),
			new Vertex3D(this.data.left, this.data.bottom, this.data.glassHeight),
		]
		const ph3dpoly = new Hit3DPoly(rgv3D)
		ph3dpoly.calcHitBBox()
		hitObjects.push(ph3dpoly)

		logger().debug('[Player] Playfield hit objects set.', hitObjects)
		return hitObjects
	}
}
