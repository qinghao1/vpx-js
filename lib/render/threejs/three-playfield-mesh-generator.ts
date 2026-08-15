// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { type BufferGeometry, ExtrudeGeometry, Shape, Vector2 } from 'three'
import { Table, type TableGenerateOptions } from '../../vpt/table/table.js'

/** Generates playfield mesh. */
export class ThreePlayfieldMeshGenerator {
	public createPlayfieldGeometry(table: Table, _opts: TableGenerateOptions): BufferGeometry {
		if (!table.data) throw new Error('Table data not loaded')
		const dim = table.getDimensions()
		const shape = new Shape()
		shape.moveTo(table.data.left, table.data.top)
		shape.lineTo(table.data.right, table.data.top)
		shape.lineTo(table.data.right, table.data.bottom)
		shape.lineTo(table.data.left, table.data.bottom)
		shape.lineTo(table.data.left, table.data.top)

		const invW = 1 / dim.width
		const invH = 1 / dim.height
		return new ExtrudeGeometry(shape, {
			depth: Table.playfieldThickness,
			bevelEnabled: false,
			steps: 1,
			UVGenerator: {
				generateSideWallUV(): Vector2[] {
					return [new Vector2(0, 0), new Vector2(0, 0), new Vector2(0, 0), new Vector2(0, 0)]
				},
				generateTopUV(_g: ExtrudeGeometry, vertices: number[], a: number, b: number, c: number): Vector2[] {
					const ax = vertices[a * 3]!,
						ay = vertices[a * 3 + 1]!
					const bx = vertices[b * 3]!,
						by = vertices[b * 3 + 1]!
					const cx = vertices[c * 3]!,
						cy = vertices[c * 3 + 1]!
					return [
						new Vector2(ax * invW, 1 - ay * invH),
						new Vector2(bx * invW, 1 - by * invH),
						new Vector2(cx * invW, 1 - cy * invH),
					]
				},
			},
		})
	}
}
