// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { Enums } from '../enums.js'
import type { Table } from '../table/table.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball ramp habitrail classification', () => {
	let table: Table

	beforeEach(() => {
		table = new TableBuilder()
			.addMaterial('opaque', { isOpacityActive: false })
			.addRamp('flat', { szMaterial: 'opaque', rampType: Enums.RampType.RampTypeFlat })
			.addRamp('wire4', { szMaterial: 'opaque', rampType: Enums.RampType.RampType4Wire })
			.addRamp('wire1', { szMaterial: 'opaque', rampType: Enums.RampType.RampType1Wire })
			.addRamp('untyped', { szMaterial: 'opaque', rampType: undefined })
			.build()
	})

	it('should generate a floor mesh for a flat ramp', () => {
		const meshes = table.ramps.flat.getMeshes(table)
		expect(meshes.floor).to.be.ok
		expect(meshes.wire1).to.not.be.ok
	})

	it('should generate wire meshes without a floor for habitrail ramps', () => {
		const meshes = table.ramps.wire4.getMeshes(table)
		expect(meshes.floor).to.not.be.ok
		expect(meshes.wire1).to.be.ok
		expect(meshes.wire2).to.be.ok
	})

	it('should generate a single wire for a 1-wire habitrail', () => {
		const meshes = table.ramps.wire1.getMeshes(table)
		expect(meshes.floor).to.not.be.ok
		expect(meshes.wire1).to.be.ok
		expect(meshes.wire2).to.not.be.ok
	})

	it('should fall back to a flat floor when the type is unset', () => {
		// RampState.type is optional; an unset type is never a habitrail wire
		// type, so generation falls back to the flat mesh instead of crashing.
		const meshes = table.ramps.untyped.getMeshes(table)
		expect(meshes.floor).to.be.ok
		expect(meshes.wire1).to.not.be.ok
	})
})
