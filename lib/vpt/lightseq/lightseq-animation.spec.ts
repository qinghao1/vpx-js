// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Vertex2D } from '../../math/vector.js'
import { Collection, CollectionData } from '../collection/collection.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import { LightSeq, LightSeqData } from './lightseq.js'
import { LightSeqAnimation } from './lightseq-animation.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()
const seq = Enums.SequencerState
const SWEEP_MEMBERS = ['Scaled', 'NoBulb', 'PlayfieldLight']

async function loadTableWithSequencer(fixture: string, memberNames: string[]) {
	const table = await Table.load(new NodeBinaryReader(three.fixturePath(fixture)))
	const collectionData = new (CollectionData as any)('SeqCollection')
	collectionData.name = 'SeqCollection'
	collectionData.itemNames = [...memberNames]
	const collection = new (Collection as any)(collectionData)
	table.collections.SeqCollection = collection
	table.items.SeqCollection = collection
	const seqData = new (LightSeqData as any)('LightSeqTest')
	seqData.name = 'LightSeqTest'
	seqData.collection = 'SeqCollection'
	seqData.center = new Vertex2D(500, 1000)
	seqData.updateInterval = 25
	const seqItem = new (LightSeq as any)(seqData)
	table.items.LightSeqTest = seqItem
	table.lightSeqs.LightSeqTest = seqItem
	const player = new Player(table).init()
	return { table, player, seqApi: seqItem.getApi() }
}

describe('The VPinball light sequencer', () => {
	describe('with lights', () => {
		let table: Table
		let player: Player
		let seqApi: any

		beforeEach(async () => {
			;({ table, player, seqApi } = await loadTableWithSequencer('table-light.vpx', SWEEP_MEMBERS))
			for (const name of SWEEP_MEMBERS) {
				table.lights[name].getApi().Intensity = 10
				table.lights[name].getApi().Fader = 0
			}
		})

		function intensity(name: string): number {
			return table.lights[name].getState().intensity
		}

		it('should turn all collection lights on and off immediately', () => {
			const playDone = sinon.spy()
			seqApi.on('PlayDone', playDone)

			seqApi.Play(seq.SeqAllOn, 0, 1, 0)
			player.simulateTime(20)
			expect(intensity('Scaled')).to.equal(10)
			expect(intensity('NoBulb')).to.equal(10)
			expect(intensity('PlayfieldLight')).to.equal(10)

			seqApi.Play(seq.SeqAllOff, 0, 1, 0)
			player.simulateTime(40)
			expect(intensity('Scaled')).to.equal(0)
			expect(intensity('NoBulb')).to.equal(0)
			expect(intensity('PlayfieldLight')).to.equal(0)

			expect(playDone).to.have.not.been.called
		})

		it('should sweep bottom-up and restore lights when done', () => {
			const playDone = sinon.spy()
			seqApi.on('PlayDone', playDone)

			seqApi.Play(seq.SeqUpOn, 0, 1, 0)
			player.simulateTime(900)
			expect(intensity('Scaled')).to.equal(10)
			expect(intensity('NoBulb')).to.equal(0)
			expect(intensity('PlayfieldLight')).to.equal(0)
			expect(playDone).to.have.not.been.called

			player.simulateTime(3000)
			expect(intensity('Scaled')).to.equal(0)
			expect(intensity('NoBulb')).to.equal(0)
			expect(intensity('PlayfieldLight')).to.equal(0)
			expect(playDone).to.have.been.calledOnce
		})

		it('should defer script writes while locked and apply them on stop', () => {
			seqApi.Play(seq.SeqAllOn, 0, 1, 0)
			player.simulateTime(20)
			expect(intensity('Scaled')).to.equal(10)
			expect(table.lights.Scaled.getApi().State).to.equal(Enums.LightStatus.LightStateOff)

			table.lights.Scaled.getApi().State = Enums.LightStatus.LightStateOff
			player.simulateTime(40)
			expect(intensity('Scaled')).to.equal(10)

			seqApi.StopPlay()
			player.simulateTime(60)
			expect(intensity('Scaled')).to.equal(0)

			table.lights.Scaled.getApi().State = Enums.LightStatus.LightStateOn
			player.simulateTime(80)
			expect(intensity('Scaled')).to.equal(10)
		})

		it('should restore original states and flush the queue on stop', () => {
			const playDone = sinon.spy()
			seqApi.on('PlayDone', playDone)

			seqApi.Play(seq.SeqUpOn, 0, 1, 0)
			player.simulateTime(900)
			expect(intensity('Scaled')).to.equal(10)

			seqApi.StopPlay()
			player.simulateTime(1200)
			expect(intensity('Scaled')).to.equal(0)
			expect(intensity('NoBulb')).to.equal(0)
			expect(intensity('PlayfieldLight')).to.equal(0)

			player.simulateTime(4000)
			expect(playDone).to.have.not.been.called
		})

		it('should run queued sequences in order and fire PlayDone once', () => {
			const playDone = sinon.spy()
			seqApi.on('PlayDone', playDone)

			seqApi.Play(seq.SeqUpOn, 0, 1, 0)
			seqApi.Play(seq.SeqDownOn, 0, 1, 0)
			player.simulateTime(3000)
			expect(intensity('Scaled')).to.equal(10)
			expect(intensity('NoBulb')).to.equal(10)
			expect(intensity('PlayfieldLight')).to.equal(10)
			expect(playDone).to.have.not.been.called

			player.simulateTime(6000)
			expect(intensity('Scaled')).to.equal(0)
			expect(playDone).to.have.been.calledOnce
		})

		it('should treat a repeat below 1 as a single run', () => {
			const playDone = sinon.spy()
			seqApi.on('PlayDone', playDone)

			seqApi.Play(seq.SeqUpOn, 0, 0, 0)
			player.simulateTime(3000)
			expect(playDone).to.have.been.calledOnce

			seqApi.Play(seq.SeqUpOn, 0, -3, 0)
			player.simulateTime(6000)
			expect(playDone).to.have.been.calledTwice
		})

		it('should treat a negative tail length as no tail', () => {
			const playDone = sinon.spy()
			seqApi.on('PlayDone', playDone)

			seqApi.Play(seq.SeqUpOn, -5, 1, 0)
			player.simulateTime(3000)
			expect(playDone).to.have.been.calledOnce
		})

		it('should reject plays when the queue is full', () => {
			for (let i = 0; i < 99; i++) {
				seqApi.Play(seq.SeqUpOn, 0, 1, 0)
			}
			expect(() => seqApi.Play(seq.SeqUpOn, 0, 1, 0)).to.throw()
			seqApi.StopPlay()
			expect(() => seqApi.Play(seq.SeqUpOn, 0, 1, 0)).to.not.throw()
		})

		it('should blink all lights and fire PlayDone', () => {
			const playDone = sinon.spy()
			seqApi.on('PlayDone', playDone)

			seqApi.Play(seq.SeqBlinking, 0, 1, 100)
			player.simulateTime(50)
			expect(intensity('Scaled')).to.equal(10)
			expect(intensity('NoBulb')).to.equal(10)

			player.simulateTime(200)
			expect(intensity('Scaled')).to.equal(0)
			expect(intensity('NoBulb')).to.equal(0)

			player.simulateTime(500)
			expect(playDone).to.have.been.calledOnce
		})

		it('should complete random, circle, radar and inverse effects', () => {
			const playDone = sinon.spy()
			seqApi.on('PlayDone', playDone)

			seqApi.Play(seq.SeqRandom, 2, 1, 100)
			player.simulateTime(500)
			expect(playDone).to.have.been.calledOnce

			seqApi.Play(seq.SeqCircleOutOn, 0, 1, 0)
			seqApi.Play(seq.SeqClockRightOn, 0, 1, 0)
			seqApi.Play(seq.SeqUpOff, 10, 1, 0)
			player.simulateTime(20000)
			expect(playDone).to.have.been.calledTwice
			expect(intensity('Scaled')).to.equal(0)
		})

		it('should expire unknown animations without touching lights', () => {
			const playDone = sinon.spy()
			seqApi.on('PlayDone', playDone)

			seqApi.Play(999, 0, 1, 0)
			player.simulateTime(500)
			expect(playDone).to.have.been.calledOnce
			expect(intensity('Scaled')).to.equal(0)
		})

		it('should clamp the update interval and validate the center', () => {
			seqApi.UpdateInterval = 0
			expect(seqApi.UpdateInterval).to.equal(1)
			seqApi.UpdateInterval = 122
			expect(seqApi.UpdateInterval).to.equal(122)

			// Fixture table is 1000x2000.
			expect(() => {
				seqApi.CenterX = -5
			}).to.throw('out of range')
			expect(seqApi.CenterX).to.equal(500)
			expect(() => {
				seqApi.CenterX = 1000
			}).to.throw('out of range')
			expect(seqApi.CenterX).to.equal(500)
			seqApi.CenterX = 999
			expect(seqApi.CenterX).to.equal(999)

			expect(() => {
				seqApi.CenterY = -1
			}).to.throw('out of range')
			expect(seqApi.CenterY).to.equal(1000)
			expect(() => {
				seqApi.CenterY = 2000
			}).to.throw('out of range')
			expect(seqApi.CenterY).to.equal(1000)
			seqApi.CenterY = 1999
			expect(seqApi.CenterY).to.equal(1999)
		})
	})

	describe('with a missing collection', () => {
		it('should complete immediately without crashing', async () => {
			const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-lightseq.vpx')))
			const player = new Player(table).init()
			const api = table.lightSeqs.LightSeq001.getApi()
			const playDone = sinon.spy()
			api.on('PlayDone', playDone)

			api.Play(seq.SeqUpOn, 0, 1, 0)
			player.simulateTime(500)
			expect(playDone).to.have.been.calledOnce

			api.Play(seq.SeqAllOn, 0, 1, 0)
			player.simulateTime(600)
			expect(playDone).to.have.been.calledOnce
		})
	})

	describe('with a flasher', () => {
		it('should lock the flasher without touching script visibility and preserve mid-run writes on stop', async () => {
			const { player, seqApi, table } = await loadTableWithSequencer('table-flasher.vpx', ['Flasher'])
			const flasher = table.flashers.Flasher
			const flasherApi = flasher.getApi()
			const state = flasher.getState()
			expect(flasherApi.Visible).to.equal(true)

			seqApi.Play(seq.SeqAllOn, 0, 1, 0)
			expect(state.lockedByLS).to.equal(true)
			expect(state.inPlayState).to.equal(true)
			expect(flasherApi.Visible).to.equal(true)

			flasherApi.Visible = false
			expect(state.lockedByLS).to.equal(true)
			seqApi.Play(seq.SeqAllOff, 0, 1, 0)
			expect(state.inPlayState).to.equal(false)
			expect(flasherApi.Visible).to.equal(false)

			seqApi.StopPlay()
			expect(state.lockedByLS).to.equal(false)
			expect(flasherApi.Visible).to.equal(false)
			player.simulateTime(20)
		})

		it('should complete a sweep without writing script visibility', async () => {
			const { player, seqApi, table } = await loadTableWithSequencer('table-flasher.vpx', ['Flasher'])
			const flasher = table.flashers.Flasher
			const flasherApi = flasher.getApi()
			const playDone = sinon.spy()
			seqApi.on('PlayDone', playDone)

			flasherApi.Visible = false
			seqApi.Play(seq.SeqUpOn, 0, 1, 0)
			player.simulateTime(3000)
			expect(flasherApi.Visible).to.equal(false)
			expect(flasher.getState().lockedByLS).to.equal(false)
			expect(playDone).to.have.been.calledOnce
		})
	})

	describe('with a primitive', () => {
		it('should lock the primitive without touching script visibility and restore on stop', async () => {
			const { player, seqApi, table } = await loadTableWithSequencer('table-primitive.vpx', ['Cube'])
			const primitive = table.primitives.Cube
			const primitiveApi = primitive.getApi()
			const state = primitive.getState()
			const playDone = sinon.spy()
			seqApi.on('PlayDone', playDone)
			expect(primitiveApi.Visible).to.equal(true)

			seqApi.Play(seq.SeqAllOff, 0, 1, 0)
			expect(state.lockedByLS).to.equal(true)
			expect(state.inPlayState).to.equal(false)
			expect(primitiveApi.Visible).to.equal(true)
			seqApi.StopPlay()
			expect(state.lockedByLS).to.equal(false)
			expect(primitiveApi.Visible).to.equal(true)

			primitiveApi.Visible = false
			seqApi.Play(seq.SeqUpOn, 0, 1, 0)
			player.simulateTime(3000)
			expect(primitiveApi.Visible).to.equal(false)
			expect(state.lockedByLS).to.equal(false)
			expect(playDone).to.have.been.calledOnce
		})
	})
})

describe('The VPinball light sequencer center validation', () => {
	function makeAnimation(right: number, bottom: number) {
		const table = new TableBuilder().build()
		table.data!.right = right
		table.data!.bottom = bottom
		const settings = { center: { x: 500, y: 1000 }, updateInterval: 25, collection: '' }
		const animation = new LightSeqAnimation(settings, {} as any, {} as any, table)
		return { settings, animation }
	}

	it('should throw for out-of-range centers without changing them', () => {
		const { settings, animation } = makeAnimation(1111, 2222)
		expect(() => animation.setCenterX(-5)).to.throw('out of range')
		expect(() => animation.setCenterX(1111)).to.throw('out of range')
		expect(settings.center.x).to.equal(500)
		expect(() => animation.setCenterY(-1)).to.throw('out of range')
		expect(() => animation.setCenterY(2222)).to.throw('out of range')
		expect(settings.center.y).to.equal(1000)
		animation.setCenterX(1110)
		animation.setCenterY(2221)
		expect(settings.center.x).to.equal(1110)
		expect(settings.center.y).to.equal(2221)
	})

	it('should accept wide-table centers rejected by the editor bounds', () => {
		const { settings, animation } = makeAnimation(3000, 4000)
		animation.setCenterX(2500)
		animation.setCenterY(3500)
		expect(settings.center.x).to.equal(2500)
		expect(settings.center.y).to.equal(3500)
	})

	it('should fall back to editor bounds when table dimensions are degenerate', () => {
		const { settings, animation } = makeAnimation(0, 0)
		animation.setCenterX(999)
		animation.setCenterY(1999)
		expect(settings.center.x).to.equal(999)
		expect(settings.center.y).to.equal(1999)
		expect(() => animation.setCenterX(1000)).to.throw('out of range')
		expect(() => animation.setCenterY(2000)).to.throw('out of range')
	})
})
