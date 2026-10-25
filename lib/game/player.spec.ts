// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { ThreeHelper } from '../../test/three.helper'
import { Player } from '../game/player.js'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { Table } from '../vpt/table/table.js'

describe('The VPinball player', () => {
	const three = new ThreeHelper()

	it('should pause and resume the game', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-kicker.vpx')))
		const player = new Player(table).init()
		const kicker = table.kickers.BallRelease.getApi()

		const ball = kicker.CreateBall()
		kicker.Kick(0, 10)

		player.simulateTime(0)
		expect(ball.getState().pos.y).to.equal(1200)

		player.simulateTime(120)
		expect(ball.getState().pos.y).to.be.below(1100)

		player.pause()
		player.simulateTime(700)
		expect(ball.getState().pos.y).to.be.above(1090)

		player.resume()
		player.simulateTime(1400)
		expect(ball.getState().pos.y).to.be.below(650)
	})

	it('should broadcast OptionEvent(0) on finishInit', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-kicker.vpx')))
		let receivedEventId: number | undefined
		const player = new Player(table)
		player.prepareTable()
		table.getApi().on('OptionEvent', (eventId: number) => {
			receivedEventId = eventId
		})
		player.init()
		expect(receivedEventId).to.equal(0)
	})

	it('should wrap collection items so mutating collection elements marks items dirty', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-collection.vpx')))
		new Player(table).init()

		const collection = table.collections.FireSurpress
		expect(collection).to.exist
		expect(collection.items.length).to.be.above(0)

		const firstItemApi = collection.items[0] as unknown as { __isDirtyProxy?: boolean; Enabled?: boolean }
		expect(firstItemApi).to.exist
		expect(firstItemApi.__isDirtyProxy).to.equal(true)
	})
})
