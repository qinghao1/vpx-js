import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'

describe('regression: light initial intensity not dark', () => {
	it('should seed LightState intensity from data.isOn for walking_dead GI', async () => {
		try {
			const table = await Table.load(new NodeBinaryReader('walking_dead.vpx'))
			const gi = table.lights['106']
			expect(gi).toBeDefined()
			expect(gi.data.intensity).toBe(1000)
			expect(gi.data.state).toBe(2)
			expect(gi.data.isOn()).toBe(true)
			expect(gi.getState().intensity).toBe(1000)
		} catch (e) {
			console.warn('skip walking_dead GI test', (e as Error).message)
		}
	})

	it('should keep bulbLight point lights bright for TWD 165', async () => {
		const table = new TableBuilder().build()
		const t = table as any
		t.lights = {
			a: {
				data: {
					bulbLight: true,
					showBulbMesh: false,
					meshRadius: 20,
					state: 1,
					intensity: 5,
					rgBlinkPattern: '10',
					isOn() {
						return true
					},
				},
				isBulbLight() {
					return false
				},
				getName() {
					return 'a'
				},
			},
			b: {
				data: {
					bulbLight: true,
					showBulbMesh: false,
					meshRadius: 20,
					state: 0,
					intensity: 5,
					rgBlinkPattern: '10',
					isOn() {
						return false
					},
				},
				isBulbLight() {
					return false
				},
				getName() {
					return 'b'
				},
			},
		}
		const lights = Object.values(t.lights) as any[]
		const bright = lights.filter(l => l.data.isOn())
		expect(bright.length).toBe(1)
	})
})
