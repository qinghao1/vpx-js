// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { findWalkingDead } from '../../../test/harness/bench-shared.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'
import { bakedIntensity } from './light.js'

const walkingDeadVpx = findWalkingDead()

describe('regression: light initial intensity not dark', () => {
	it.skipIf(!walkingDeadVpx)('should seed LightState intensity from data.isOn for walking_dead GI', async () => {
		const table = await Table.load(new NodeBinaryReader(walkingDeadVpx))
		const gi = table.lights['106']
		expect(gi).toBeDefined()
		expect(gi.data.intensity).toBe(1000)
		expect(gi.data.state).toBe(2)
		expect(gi.data.isOn()).toBe(true)
		expect(bakedIntensity(gi.data)).toBe(1000)
	})
})
