// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { Table } from '../../vpt/table/table.js'
import { ThreePlayfieldMeshGenerator } from './three-playfield-mesh-generator.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('ThreePlayfieldMeshGenerator z-range', () => {
	it('spans z 0..thickness with the visible lid on the physics plane', () => {
		const table = {
			data: { left: 0, top: 0, right: 1000, bottom: 2000 },
			getDimensions: () => ({ width: 1000, height: 2000 }),
		} as unknown as Table
		const geometry = new ThreePlayfieldMeshGenerator().createPlayfieldGeometry(table, {} as any)
		geometry.computeBoundingBox()
		// The -z lid at z=0 is the surface the top-down camera sees; the slab
		// must extend into table +z, not sink 20 units under the flippers.
		expect(geometry.boundingBox?.min.z).to.equal(0)
		expect(geometry.boundingBox?.max.z).to.equal(Table.playfieldThickness)
	})
})
