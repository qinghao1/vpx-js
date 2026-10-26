import { describe, expect, it } from 'vitest'
import { ItemType } from './enums.js'
import { ItemData } from './item-data.js'

describe('ItemData.getType', () => {
	it('should name every item type', () => {
		expect(
			[
				ItemType.Surface,
				ItemType.Flipper,
				ItemType.Timer,
				ItemType.Plunger,
				ItemType.Textbox,
				ItemType.Bumper,
				ItemType.Trigger,
				ItemType.Light,
				ItemType.Kicker,
				ItemType.Decal,
				ItemType.Gate,
				ItemType.Spinner,
				ItemType.Ramp,
				ItemType.Table,
				ItemType.LightCenter,
				ItemType.DragPoint,
				ItemType.Collection,
				ItemType.DispReel,
				ItemType.LightSeq,
				ItemType.Primitive,
				ItemType.Flasher,
				ItemType.Rubber,
				ItemType.HitTarget,
				ItemType.Count,
				ItemType.Invalid,
			].map(type => ItemData.getType(type)),
		).toEqual([
			'Surface',
			'Flipper',
			'Timer',
			'Plunger',
			'Textbox',
			'Bumper',
			'Trigger',
			'Light',
			'Kicker',
			'Decal',
			'Gate',
			'Spinner',
			'Ramp',
			'Table',
			'Light Center',
			'Drag Point',
			'Collection',
			'Reel',
			'Light Sequence',
			'Primitive',
			'Flasher',
			'Rubber',
			'Hit Target',
			'Count',
			'Invalid',
		])
	})

	it('should fall back to an unknown-type message', () => {
		expect(ItemData.getType(99)).toBe('Unknown type "99"')
	})
})
