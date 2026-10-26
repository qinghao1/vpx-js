import { expect } from 'chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { Enums } from '../enums.js'
import { TriggerAnimation } from './trigger-animation.js'
import { TriggerState } from './trigger-state.js'

describe('The VPinball trigger animation', () => {
	for (const [shape, limit] of [
		[Enums.TriggerShape.TriggerInder, 25],
		[Enums.TriggerShape.TriggerWireD, 25],
		[Enums.TriggerShape.TriggerWireC, 60],
		[Enums.TriggerShape.TriggerWireA, 32],
	]) {
		it(`should animate shape ${shape} with limit ${limit}`, () => {
			const table = new TableBuilder().addTrigger('trigger', { shape, animSpeed: 1000 }).build()
			const data = table.triggers.trigger.data
			const state = TriggerState.claim('trigger', 0, undefined, true)
			const animation = new TriggerAnimation(data, state)
			animation.triggerAnimationHit()
			animation.updateAnimation(1000, table)
			expect(Math.abs(state.heightOffset) / table.getScaleZ()).to.be.closeTo(limit, 1e-6)
			state.release()
		})
	}
})
