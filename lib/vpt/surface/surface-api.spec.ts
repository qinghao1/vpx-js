// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import { SurfaceData } from './surface.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball surface API', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-surface.vpx')))
	})

	beforeEach(async () => {
		player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const surface = table.surfaces.Wall.getApi()

		surface.HasHitEvent = false
		expect(surface.HasHitEvent).to.equal(false)
		surface.HasHitEvent = true
		surface.Threshold = 2.332
		surface.Image = 'imgzz'
		surface.SideMaterial = 'sidemat'
		surface.SlingshotMaterial = 'slingmat'
		surface.ImageAlignment = Enums.ImageAlignment.ImageAlignTopLeft
		surface.HeightBottom = 332.128
		surface.HeightTop = 554.96598
		surface.TopMaterial = 'topmat'
		surface.PhysicsMaterial = 'pmat'
		surface.OverwritePhysics = false
		expect(surface.OverwritePhysics).to.equal(false)
		surface.OverwritePhysics = true
		surface.CanDrop = false
		expect(surface.CanDrop).to.equal(false)
		surface.CanDrop = true
		surface.FlipbookAnimation = false
		expect(surface.FlipbookAnimation).to.equal(false)
		surface.FlipbookAnimation = true
		surface.IsBottomSolid = false
		expect(surface.IsBottomSolid).to.equal(false)
		surface.IsBottomSolid = true
		surface.IsDropped = false
		expect(surface.IsDropped).to.equal(false)
		surface.IsDropped = true
		surface.DisplayTexture = false
		expect(surface.DisplayTexture).to.equal(false)
		surface.DisplayTexture = true
		surface.SlingshotStrength = 8.6554
		surface.Elasticity = 1.0043
		surface.Friction = 3.552056
		surface.Scatter = Math.PI
		surface.Visible = false
		expect(surface.Visible).to.equal(false)
		surface.Visible = true
		surface.Disabled = false
		expect(surface.Disabled).to.equal(false)
		surface.Disabled = true
		surface.SideVisible = false
		expect(surface.SideVisible).to.equal(false)
		surface.SideVisible = true
		surface.Collidable = false
		expect(surface.Collidable).to.equal(false)
		surface.Collidable = true
		surface.SlingshotThreshold = 0.239578
		surface.SlingshotAnimation = false
		expect(surface.SlingshotAnimation).to.equal(false)
		surface.SlingshotAnimation = true
		surface.DisableLighting = false
		expect(surface.DisableLighting).to.equal(false)
		surface.DisableLighting = true
		surface.BlendDisableLighting = 0.3
		surface.BlendDisableLightingFromBelow = 0.5
		surface.ReflectionEnabled = false
		expect(surface.ReflectionEnabled).to.equal(false)
		surface.ReflectionEnabled = true

		expect(surface.HasHitEvent).to.equal(true)
		expect(surface.Threshold).to.equal(2.332)
		expect(surface.Image).to.equal('imgzz')
		expect(surface.SideMaterial).to.equal('sidemat')
		expect(surface.SlingshotMaterial).to.equal('slingmat')
		expect(surface.ImageAlignment).to.equal(Enums.ImageAlignment.ImageAlignCenter)
		expect(surface.HeightBottom).to.equal(332.128)
		expect(surface.HeightTop).to.equal(554.96598)
		expect(surface.TopMaterial).to.equal('topmat')
		expect(surface.PhysicsMaterial).to.equal('pmat')
		expect(surface.OverwritePhysics).to.equal(true)
		expect(surface.CanDrop).to.equal(true)
		expect(surface.FlipbookAnimation).to.equal(true)
		expect(surface.IsBottomSolid).to.equal(true)
		expect(surface.IsDropped).to.equal(true)
		expect(surface.DisplayTexture).to.equal(true)
		expect(surface.SlingshotStrength).to.equal(8.6554)
		expect(surface.Elasticity).to.equal(1.0043)
		expect(surface.Friction).to.equal(3.552056)
		expect(surface.Scatter).to.equal(Math.PI)
		expect(surface.Visible).to.equal(true)
		expect(surface.Disabled).to.equal(true)
		expect(surface.SideVisible).to.equal(true)
		expect(surface.Collidable).to.equal(true)
		expect(surface.SlingshotThreshold).to.equal(0.239578)
		expect(surface.SlingshotAnimation).to.equal(true)
		expect(surface.DisableLighting).to.equal(true)
		expect(surface.BlendDisableLighting).to.equal(0.3)
		expect(surface.BlendDisableLightingFromBelow).to.equal(0.5)
		expect(surface.ReflectionEnabled).to.equal(true)

		surface.Name = 'duh-doh'
		expect(surface.Name).to.equal('duh-doh')
		surface.TimerInterval = 5513
		expect(surface.TimerInterval).to.equal(5513)
		surface.TimerEnabled = false
		expect(surface.TimerEnabled).to.equal(false)
		surface.TimerEnabled = true
		expect(surface.TimerEnabled).to.equal(true)
		surface.UserValue = 'wazzup'
		expect(surface.UserValue).to.equal('wazzup')

		// reset table for next tests
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-surface.vpx')))
	})

	it('should correctly handle side image attribution', () => {
		const surface = table.surfaces.Wall.getApi()
		// Unknown names are stored without throwing, like native Surface::put_SideImage.
		surface.SideImage = 'some-image'
		expect(surface.SideImage).to.equal('some-image')
		surface.SideImage = 'ldr'
		expect(surface.SideImage).to.equal('ldr')
		table.textures.hdr_tex = { isHdr: () => true } as any
		expect(() => {
			surface.SideImage = 'hdr_tex'
		}).to.throw('Cannot use a HDR image (.exr/.hdr) here')
	})

	it('should trigger an Init event', () => {
		const surface = table.surfaces.Wall.getApi()
		const eventSpy = sinon.spy()
		surface.on('Init', eventSpy)
		player.init()

		expect(eventSpy).to.have.been.calledOnce
	})

	it('should return ImageAlignCenter and ignore writes for deprecated ImageAlignment', () => {
		const surface = table.surfaces.Wall.getApi()
		expect(surface.ImageAlignment).to.equal(Enums.ImageAlignment.ImageAlignCenter)
		surface.ImageAlignment = Enums.ImageAlignment.ImageAlignTopLeft
		expect(surface.ImageAlignment).to.equal(Enums.ImageAlignment.ImageAlignCenter)
	})

	it('should throw an error when dropping a non-droppable wall', () => {
		const surface = table.surfaces.Wall.getApi()
		surface.CanDrop = false
		expect(() => (surface.IsDropped = true)).to.throw('Surface "Wall" is not droppable.')
	})

	it('should update data and hit objects when setting Collidable', () => {
		const wall = table.surfaces.Wall
		const surface = wall.getApi()

		surface.Collidable = false
		expect(surface.Collidable).to.equal(false)
		expect(wall.isCollidable()).to.equal(false)
		expect(wall.getHitShapes().length).to.be.above(0)
		expect(wall.getHitShapes().every(hit => !hit.isEnabled)).to.equal(true)

		surface.Collidable = true
		expect(surface.Collidable).to.equal(true)
		expect(wall.isCollidable()).to.equal(true)
		expect(wall.getHitShapes().every(hit => hit.isEnabled)).to.equal(true)
	})
})

describe('The VPinball surface legacy tags', () => {
	it('should read the legacy DILI tag as an int level', async () => {
		async function loadWith(value: number): Promise<SurfaceData> {
			const record = new Uint8Array(20)
			const view = new DataView(record.buffer)
			view.setInt32(0, 8, true)
			record.set([0x44, 0x49, 0x4c, 0x49], 4) // DILI
			view.setInt32(8, value, true)
			view.setInt32(12, 4, true)
			record.set([0x45, 0x4e, 0x44, 0x42], 16) // ENDB
			const storage = {
				async streamFiltered(
					_name: string,
					_offset: number,
					next: (result: ReadResult) => Promise<number | null>,
				): Promise<void> {
					let pos = 0
					while (pos < record.length) {
						const consumed = await next({ data: record.subarray(pos), storageOffset: pos })
						if (consumed === null) break
						pos += consumed
					}
				},
			}
			return SurfaceData.fromStorage(storage as unknown as Storage, 'Wall')
		}
		expect((await loadWith(0)).disableLightingTop).to.equal(0)
		expect((await loadWith(1)).disableLightingTop).to.equal(1)
		expect((await loadWith(255)).disableLightingTop).to.equal(1)
		expect((await loadWith(128)).disableLightingTop).to.be.closeTo(128 / 255, 1e-6)
		// Upstream dequantizeUnsigned has no lower clamp: negatives stay negative.
		expect((await loadWith(-255)).disableLightingTop).to.equal(-1)
	})
})
