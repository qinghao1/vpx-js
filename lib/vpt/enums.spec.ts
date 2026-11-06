// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { ItemType } from './enums.js'

/**
 * File-format ItemType values (GameItem type ids). Must match upstream
 * `ItemType` (`external/vpinball/src/core/iselect.h`); renumbering breaks parsing.
 */
describe('ItemType file-format values', () => {
	it('should match upstream ids 0..22', () => {
		expect([
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
		]).toEqual(Array.from({ length: 23 }, (_, i) => i))
	})

	it('should use 0xffffffff for Invalid', () => {
		expect(ItemType.Invalid).toBe(0xffffffff)
	})
})
