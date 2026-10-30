// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Transpiler } from '../../scripting/transpiler.js'
import type { ItemApi } from '../item-api.js'
import type { ItemData } from '../item-data.js'
import { Table } from '../table/table.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball collection', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-collection.vpx')))
		player = new Player(table).init()
	})

	it('should fire events for a collection', async () => {
		const coll = table.collections.CollectionFireEvents.getApi()
		const timer1 = table.timers.CollFireEventsTimer1.getApi()
		const timer2 = table.timers.CollFireEventsTimer2.getApi()

		const collSpy = sinon.spy()
		const timer1Spy = sinon.spy()
		const timer2Spy = sinon.spy()
		coll.on('Timer', collSpy)
		timer1.on('Timer', timer1Spy)
		timer2.on('Timer', timer2Spy)

		player.updatePhysics(50)
		expect(timer1Spy).to.have.been.not.called
		expect(timer2Spy).to.have.been.not.called
		expect(collSpy).to.have.been.not.called

		player.updatePhysics(1001)
		expect(timer1Spy).to.have.been.calledOnce
		expect(timer2Spy).to.have.been.not.called
		expect(collSpy).to.have.been.calledOnceWith(0)

		player.updatePhysics(1501)
		expect(timer1Spy).to.have.been.calledOnce
		expect(timer2Spy).to.have.been.calledOnce
		expect(collSpy).to.have.been.calledTwice
		expect(collSpy).to.have.been.calledWith(0)
		expect(collSpy).to.have.been.calledWith(1)
	})

	it('should suppress individual events for each member', async () => {
		const coll = table.collections.FireSurpress.getApi()
		const timer1 = table.timers.FireSurpressTimer1.getApi()
		const timer2 = table.timers.FireSurpressTimer2.getApi()

		const collSpy = sinon.spy()
		const timer1Spy = sinon.spy()
		const timer2Spy = sinon.spy()
		coll.on('Timer', collSpy)
		timer1.on('Timer', timer1Spy)
		timer2.on('Timer', timer2Spy)

		player.updatePhysics(50)
		expect(timer1Spy).to.have.been.not.called
		expect(timer2Spy).to.have.been.not.called
		expect(collSpy).to.have.been.not.called

		player.updatePhysics(1001)
		expect(timer1Spy).to.have.been.not.called
		expect(timer2Spy).to.have.been.not.called
		expect(collSpy).to.have.been.calledOnceWith(0)

		player.updatePhysics(1501)
		expect(timer1Spy).to.have.been.not.called
		expect(timer2Spy).to.have.been.not.called
		expect(collSpy).to.have.been.calledTwice
		expect(collSpy).to.have.been.calledWith(0)
		expect(collSpy).to.have.been.calledWith(1)
	})

	it('should suppress individual and collection events', async () => {
		const coll = table.collections.SuppressEvents.getApi()
		const timer1 = table.timers.SuppressEventsTimer1.getApi()
		const timer2 = table.timers.SuppressEventsTimer2.getApi()

		const collSpy = sinon.spy()
		const timer1Spy = sinon.spy()
		const timer2Spy = sinon.spy()
		coll.on('Timer', collSpy)
		timer1.on('Timer', timer1Spy)
		timer2.on('Timer', timer2Spy)

		player.updatePhysics(50)
		expect(timer1Spy).to.have.been.not.called
		expect(timer2Spy).to.have.been.not.called
		expect(collSpy).to.have.been.not.called

		player.updatePhysics(1001)
		expect(timer1Spy).to.have.been.not.called
		expect(timer2Spy).to.have.been.not.called
		expect(collSpy).to.have.been.not.called

		player.updatePhysics(1501)
		expect(timer1Spy).to.have.been.not.called
		expect(timer2Spy).to.have.been.not.called
		expect(collSpy).to.have.been.not.called
	})

	it('should create an iterable API', () => {
		const coll = table.collections.SuppressEvents.getApi()
		let i = 0
		for (const item of coll) {
			i++
			expect(item.Name).to.equal(`SuppressEventsTimer${i}`)
		}
	})

	it('should expose an API whose elements are accessible by index', () => {
		const coll = table.collections.SuppressEvents.getApi() as unknown as Array<ItemApi<ItemData>>
		expect(coll.length).to.equal(2)
		expect(coll[0].Name).to.equal('SuppressEventsTimer1')
		expect(coll[1].Name).to.equal('SuppressEventsTimer2')
	})

	it('should expose Count and Item(i) like upstream ICollection', () => {
		const coll = table.collections.SuppressEvents.getApi()
		expect(coll.Count).to.equal(2)
		expect(coll.Item(0).Name).to.equal('SuppressEventsTimer1')
		expect(coll.Item(1).Name).to.equal('SuppressEventsTimer2')
		expect(() => coll.Item(2)).to.throw(RangeError)
		expect(() => coll.Item(-1)).to.throw(RangeError)
	})

	it('should resolve default-member calls to Item(i)', () => {
		const scope: Record<string, unknown> = {}
		new Transpiler(table, player).execute('SuppressEvents(0).Name = "renamed"\n', scope, 'global')
		expect(table.timers.SuppressEventsTimer1.getApi().Name).to.equal('renamed')
		expect(() => new Transpiler(table, player).execute('x = SuppressEvents(99)\n', scope, 'global')).to.throw(
			RangeError,
		)
		// Companion guard: enumeration is unaffected by the call fall-through.
		new Transpiler(table, player).execute(
			'count = 0\nFor Each m In SuppressEvents\ncount = count + 1\nNext\n',
			scope,
			'global',
		)
		expect(scope.count).to.equal(2)
	})

	it('should resolve member names case-insensitively like upstream', () => {
		expect(table.getItemByName('suppresseventstimer1')?.getName()).to.equal('SuppressEventsTimer1')
		const coll = table.collections.SuppressEvents.getApi()
		for (const item of coll) {
			expect(table.getItemByName(item.Name.toLowerCase())?.getName()).to.equal(item.Name)
		}
	})
})
