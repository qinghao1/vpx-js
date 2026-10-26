// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'
import { DispReelApi, DispReelData } from './dispreel.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball dispreel API', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-dispreel.vpx')))
		player = new Player(table).init()
	})

	function stepReels(endMsec: number): void {
		for (let timeMsec = 0; timeMsec <= endMsec; timeMsec += 50) {
			player.updateAnimations(timeMsec)
		}
	}

	it('should correctly read and write the properties', async () => {
		const decal = table.dispReels.EMReel001.getApi()

		decal.BackColor = 0x98e6f1
		decal.Reels = 12
		decal.Width = 90
		decal.Height = 11
		decal.X = 12.4
		decal.Y = 500.6
		decal.IsTransparent = true
		expect(decal.IsTransparent).to.equal(true)
		decal.IsTransparent = false
		decal.Image = 'test_pattern'
		decal.Spacing = 5.5
		decal.Sound = 'Sound'
		decal.Steps = 7
		decal.Range = -10
		expect(decal.Range).to.equal(0)
		decal.Range = 513
		expect(decal.Range).to.equal(511)
		decal.Range = 21
		decal.UpdateInterval = 45.2
		decal.UseImageGrid = true
		expect(decal.UseImageGrid).to.equal(true)
		decal.UseImageGrid = false
		decal.Visible = true
		expect(decal.Visible).to.equal(true)
		decal.Visible = false
		decal.ImagesPerGridRow = 17

		expect(decal.BackColor).to.equal(0x98e6f1)
		expect(decal.Reels).to.equal(12)
		expect(decal.Width).to.equal(90)
		expect(decal.Height).to.equal(11)
		expect(decal.X).to.closeTo(12.4, 0.0001)
		expect(decal.Y).to.closeTo(500.6, 0.0001)
		expect(decal.IsTransparent).to.equal(false)
		expect(decal.Image).to.equal('test_pattern')
		expect(decal.Spacing).to.equal(5.5)
		expect(decal.Sound).to.equal('Sound')
		expect(decal.Steps).to.equal(7)
		expect(decal.Range).to.equal(21)
		expect(decal.UpdateInterval).to.equal(45.2)
		expect(decal.UseImageGrid).to.equal(false)
		expect(decal.Visible).to.equal(false)
		expect(decal.ImagesPerGridRow).to.equal(17)
	})

	it('should bind Visible to the item data instead of a shadow property', async () => {
		const reel = table.dispReels.EMReel001
		const api = reel.getApi()

		expect(api.Visible).to.equal(true)
		api.Visible = false
		expect(reel.data.isVisible).to.equal(false)
		expect(api.Visible).to.equal(false)
	})

	it('should set reel values immediately with SetValue', async () => {
		const reel = table.dispReels.EMReel001
		reel.getApi().SetValue(123)
		expect(reel.getAnimation().getReelValues()).to.deep.equal([0, 0, 1, 2, 3])
	})

	it('should advance reels with carry when stepping AddValue pulses', async () => {
		const reel = table.dispReels.EMReel001
		const api = reel.getApi()
		let animateCount = 0
		api.on('Animate', () => animateCount++)

		api.SetValue(99)
		api.AddValue(1)
		stepReels(2000)

		expect(reel.getAnimation().getReelValues()).to.deep.equal([0, 0, 1, 0, 0])
		expect(animateCount).to.be.greaterThan(0)
	})

	it('should roll back to zero with ResetToZero', async () => {
		const reel = table.dispReels.EMReel001
		const api = reel.getApi()
		let animateCount = 0
		api.on('Animate', () => animateCount++)

		api.SetValue(25)
		api.ResetToZero()
		stepReels(6000)

		expect(reel.getAnimation().getReelValues()).to.deep.equal([0, 0, 0, 0, 0])
		expect(animateCount).to.be.greaterThan(0)
	})

	it('should spin a single reel with SpinReel and reject out-of-range reels', async () => {
		const reel = table.dispReels.EMReel001
		const api = reel.getApi()

		api.SetValue(0)
		api.SpinReel(5, 3)
		stepReels(1000)
		expect(reel.getAnimation().getReelValues()).to.deep.equal([0, 0, 0, 0, 3])

		expect(() => api.SpinReel(0, 1)).to.throw()
		expect(() => api.SpinReel(6, 1)).to.throw()
	})

	it('should expose the Animate event', async () => {
		expect(table.dispReels.EMReel001.getEventNames()).to.include('Animate')
	})

	it('should clamp reel and layout properties like upstream', async () => {
		const decal = table.dispReels.EMReel001.getApi()

		decal.Reels = 0
		expect(decal.Reels).to.equal(1)
		decal.Reels = 99
		expect(decal.Reels).to.equal(32)
		decal.Reels = 5
		decal.Steps = 0
		expect(decal.Steps).to.equal(1)
		decal.UpdateInterval = 0
		expect(decal.UpdateInterval).to.equal(5)
		decal.Width = -5
		expect(decal.Width).to.equal(0)
		decal.Spacing = -5
		expect(decal.Spacing).to.equal(0)
	})

	it('should truncate values wider than the reel count', async () => {
		const reel = table.dispReels.EMReel001
		reel.getApi().Range = 9
		reel.getApi().SetValue(1234567)
		expect(reel.getAnimation().getReelValues()).to.deep.equal([3, 4, 5, 6, 7])
	})

	it('should track the bounding box when moving or resizing', async () => {
		const reel = table.dispReels.EMReel001
		const api = reel.getApi()
		const x0 = api.X
		const v2x0 = reel.data.v2.x
		const v2y0 = reel.data.v2.y

		api.X = x0 + 50
		expect(api.X).to.closeTo(x0 + 50, 1e-9)
		expect(reel.data.v2.x).to.be.closeTo(v2x0 + 50, 1e-6)
		expect(reel.data.v2.y).to.be.closeTo(v2y0, 1e-6)

		api.Reels = 10
		expect(reel.data.v2.x).to.be.closeTo(v2x0 + 50 + 5 * (api.Width + api.Spacing), 1e-6)
	})

	it('should fire the Timer event when enabled', async () => {
		const api = table.dispReels.EMReel001.getApi()
		let timerCount = 0
		api.on('Timer', () => timerCount++)

		api.TimerEnabled = true
		api.TimerInterval = 100
		player.updatePhysics(150)
		expect(timerCount).to.be.greaterThan(0)
	})
})

describe('The VPinball dispreel grid clamping', () => {
	it('should floor images per row at one', async () => {
		const api = new DispReelApi(new (DispReelData as any)('EMReel001'), {} as any, {} as any, {} as any, {} as any)
		api.ImagesPerGridRow = 0
		expect(api.ImagesPerGridRow).to.equal(1)
		api.ImagesPerGridRow = 4
		expect(api.ImagesPerGridRow).to.equal(4)
		api.ImagesPerRow = -2
		expect(api.ImagesPerRow).to.equal(1)
	})
})
