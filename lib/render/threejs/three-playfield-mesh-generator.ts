// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { type BufferGeometry, ExtrudeGeometry, Shape } from 'three'
import { Table, type TableGenerateOptions } from '../../vpt/table/table.js'
import { playfieldUvGenerator } from './three-mesh-generator.js'

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

		const geometry = new ExtrudeGeometry(shape, {
			depth: Table.playfieldThickness,
			bevelEnabled: false,
			steps: 1,
			UVGenerator: playfieldUvGenerator(1 / dim.width, 1 / dim.height, table.data.left, table.data.top),
		})
		// ExtrudeGeometry spans z 0..depth with its -z lid at z=0; the scene root
		// turns table -z toward the top-down camera, so that lid is the visible
		// surface and already sits on the physics plane (z=0, see
		// Table.generatePlayfieldHit). No translate: sinking the slab would drop
		// the visible surface 20 units under the flippers.
		geometry.name = 'playfield_base'
		return geometry
	}
}
