import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'

describe('regression: light initial intensity not dark', () => {
	it.skipIf(!existsSync('walking_dead.vpx'))(
		'should seed LightState intensity from data.isOn for walking_dead GI',
		async () => {
			const table = await Table.load(new NodeBinaryReader('walking_dead.vpx'))
			const gi = table.lights['106']
			expect(gi).toBeDefined()
			expect(gi.data.intensity).toBe(1000)
			expect(gi.data.state).toBe(2)
			expect(gi.data.isOn()).toBe(true)
			expect(gi.getState().intensity).toBe(1000)
		},
	)
})
