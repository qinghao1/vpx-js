// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import * as sinon from 'sinon'
import { TableBuilder } from '../../test/table-builder.js'
import type { FlipperMover } from '../vpt/flipper/flipper-mover.js'
import { Player } from './player.js'

describe('PlayerPhysics flipper hit-time boundary', () => {
	function setup(): { player: Player; mover: FlipperMover } {
		const table = new TableBuilder().withTableScript('').addFlipper('LeftFlipper').build('Table1')
		const player = new Player(table).init({})
		const mover = (table.flippers.LeftFlipper.getApi() as unknown as { mover: FlipperMover }).mover
		return { player, mover }
	}

	it('should consume the full cycle when a flipper hit time lands exactly on the boundary', () => {
		const { player, mover } = setup()
		const hitTime = sinon.stub(mover, 'getHitTime').returns(1)
		const displacements = sinon.spy(mover, 'updateDisplacements')
		try {
			player.getPhysics().physicsSimulateCycle(1)
			expect(displacements.callCount).to.equal(1)
			expect(displacements.firstCall.args[0]).to.equal(1)
		} finally {
			displacements.restore()
			hitTime.restore()
		}
	})

	it('should split the cycle when a flipper hit time lands strictly inside', () => {
		const { player, mover } = setup()
		const hitTime = sinon.stub(mover, 'getHitTime').returns(0.5)
		const displacements = sinon.spy(mover, 'updateDisplacements')
		try {
			player.getPhysics().physicsSimulateCycle(1)
			expect(displacements.callCount).to.equal(2)
			expect(displacements.firstCall.args[0]).to.equal(0.5)
		} finally {
			displacements.restore()
			hitTime.restore()
		}
	})
})
