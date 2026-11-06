import { describe, expect, it } from 'vitest'
import type { Storage } from '../io/ole-doc.js'
import { ItemType } from './enums.js'
import { ITEM_KEYS, ITEM_REGISTRY, loadItemByType } from './item-registry.js'

// Renderable table items only: Timer/Textbox/LightSeq/DispReel left with the script surface.
const EXPECTED_KEYS: Array<[number, string]> = [
	[ItemType.Surface, 'surfaces'],
	[ItemType.Flipper, 'flippers'],
	[ItemType.Plunger, 'plungers'],
	[ItemType.Bumper, 'bumpers'],
	[ItemType.Trigger, 'triggers'],
	[ItemType.Light, 'lights'],
	[ItemType.Kicker, 'kickers'],
	[ItemType.Decal, 'decals'],
	[ItemType.Gate, 'gates'],
	[ItemType.Spinner, 'spinners'],
	[ItemType.Ramp, 'ramps'],
	[ItemType.Primitive, 'primitives'],
	[ItemType.Flasher, 'flashers'],
	[ItemType.Rubber, 'rubbers'],
	[ItemType.HitTarget, 'hitTargets'],
]

describe('The VPinball item registry', () => {
	it('should map every loadable game-item type to its LoadedTable key', () => {
		expect(Object.keys(ITEM_REGISTRY)).toHaveLength(EXPECTED_KEYS.length)
		for (const [type, key] of EXPECTED_KEYS) {
			expect(ITEM_REGISTRY[type]?.key).toBe(key)
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
		// Table/LightCenter/DragPoint never appear as GameItems; Timer/Textbox/
		// LightSeq/DispReel/Collection load separately or not at all.
		expect(ITEM_REGISTRY[ItemType.Table]?.key).toBeUndefined()
		expect(ITEM_REGISTRY[ItemType.LightCenter]?.key).toBeUndefined()
		expect(ITEM_REGISTRY[ItemType.DragPoint]?.key).toBeUndefined()
		expect(ITEM_REGISTRY[ItemType.Collection]?.key).toBeUndefined()
		expect(ITEM_REGISTRY[ItemType.Timer]?.key).toBeUndefined()
		expect(ITEM_REGISTRY[ItemType.Textbox]?.key).toBeUndefined()
		expect(ITEM_REGISTRY[ItemType.LightSeq]?.key).toBeUndefined()
		expect(ITEM_REGISTRY[ItemType.DispReel]?.key).toBeUndefined()
		expect(ITEM_REGISTRY[99]?.key).toBeUndefined()
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
