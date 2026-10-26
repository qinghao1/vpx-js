import { describe, expect, it } from 'vitest'
import type { Storage } from '../io/ole-doc.js'
import { ItemType } from './enums.js'
import { getItemKey, ITEM_KEYS, ITEM_REGISTRY, loadItemByType } from './item-registry.js'

const EXPECTED_KEYS: Array<[number, string]> = [
	[ItemType.Surface, 'surfaces'],
	[ItemType.Flipper, 'flippers'],
	[ItemType.Timer, 'timers'],
	[ItemType.Plunger, 'plungers'],
	[ItemType.Textbox, 'textBoxes'],
	[ItemType.Bumper, 'bumpers'],
	[ItemType.Trigger, 'triggers'],
	[ItemType.Light, 'lights'],
	[ItemType.Kicker, 'kickers'],
	[ItemType.Decal, 'decals'],
	[ItemType.Gate, 'gates'],
	[ItemType.Spinner, 'spinners'],
	[ItemType.Ramp, 'ramps'],
	[ItemType.DispReel, 'dispReels'],
	[ItemType.LightSeq, 'lightSeqs'],
	[ItemType.Primitive, 'primitives'],
	[ItemType.Flasher, 'flashers'],
	[ItemType.Rubber, 'rubbers'],
	[ItemType.HitTarget, 'hitTargets'],
]

describe('The VPinball item registry', () => {
	it('should map every loadable game-item type to its LoadedTable key', () => {
		expect(Object.keys(ITEM_REGISTRY)).toHaveLength(EXPECTED_KEYS.length)
		for (const [type, key] of EXPECTED_KEYS) {
			expect(getItemKey(type)).toBe(key)
		}
	})

	it('should expose one unique key per registered type', () => {
		expect(ITEM_KEYS).toHaveLength(EXPECTED_KEYS.length)
		expect(new Set(ITEM_KEYS).size).toBe(EXPECTED_KEYS.length)
		for (const [, key] of EXPECTED_KEYS) {
			expect(ITEM_KEYS).toContain(key)
		}
	})

	it('should not register non-game-item types', () => {
		// Table/LightCenter/DragPoint never appear as GameItems; collections load separately.
		expect(getItemKey(ItemType.Table)).toBeUndefined()
		expect(getItemKey(ItemType.LightCenter)).toBeUndefined()
		expect(getItemKey(ItemType.DragPoint)).toBeUndefined()
		expect(getItemKey(ItemType.Collection)).toBeUndefined()
		expect(getItemKey(99)).toBeUndefined()
	})

	it('should return null for unknown types without touching storage', async () => {
		const storage = new Proxy(
			{},
			{
				get: () => {
					throw new Error('storage must not be touched for unknown types')
				},
			},
		) as unknown as Storage
		await expect(loadItemByType(storage, 'GameItem0', 99, {})).resolves.toBeNull()
	})
})
