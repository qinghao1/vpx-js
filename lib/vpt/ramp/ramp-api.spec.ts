// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { EventProxy } from '../../game/event-proxy.js'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import type { RampState } from './ramp.js'
import { RampApi } from './ramp.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball ramp API', () => {
	it('should correctly read and write the properties', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-ramp.vpx')))
		new Player(table).init()
		const ramp = table.ramps.Flat.getApi()

		ramp.HeightBottom = 23
		ramp.HeightTop = 523
		ramp.WidthBottom = 226
		ramp.WidthTop = 854
		ramp.Material = 'maathos'
		ramp.Type = 5
		ramp.Image = 'test_pattern'
		ramp.ImageAlignment = Enums.ImageAlignment.ImageAlignWorld
		expect(ramp.ImageAlignment).to.equal(0)
		ramp.ImageAlignment = Enums.ImageAlignment.ImageAlignTopLeft
		ramp.HasWallImage = false
		expect(ramp.HasWallImage).to.equal(false)
		ramp.HasWallImage = true
		ramp.LeftWallHeight = 3.221
		ramp.RightWallHeight = 5.3984
		ramp.VisibleLeftWallHeight = 3.22
		ramp.VisibleRightWallHeight = 6.237
		ramp.Elasticity = 0.339
		ramp.Friction = 2.554
		ramp.Scatter = 83.45
		ramp.Collidable = false
		expect(ramp.Collidable).to.equal(false)
		ramp.Collidable = true
		ramp.HasHitEvent = false
		expect(ramp.HasHitEvent).to.equal(false)
		ramp.HasHitEvent = true
		ramp.Threshold = 1.003
		ramp.Visible = false
		expect(ramp.Visible).to.equal(false)
		ramp.Visible = true
		ramp.ReflectionEnabled = false
		expect(ramp.ReflectionEnabled).to.equal(false)
		ramp.ReflectionEnabled = true
		ramp.DepthBias = 2.332
		ramp.WireDiameter = 12
		ramp.WireDistanceX = 1.2
		ramp.WireDistanceY = 3.2
		ramp.PhysicsMaterial = 'physmat'
		ramp.OverwritePhysics = false
		expect(ramp.OverwritePhysics).to.equal(false)
		ramp.OverwritePhysics = true

		expect(ramp.HeightBottom).to.equal(23)
		expect(ramp.HeightTop).to.equal(523)
		expect(ramp.WidthBottom).to.equal(226)
		expect(ramp.WidthTop).to.equal(854)
		expect(ramp.Material).to.equal('maathos')
		expect(ramp.Type).to.equal(5)
		expect(ramp.Image).to.equal('test_pattern')
		expect(ramp.ImageAlignment).to.equal(1)
		expect(ramp.HasWallImage).to.equal(true)
		expect(ramp.LeftWallHeight).to.equal(3.221)
		expect(ramp.RightWallHeight).to.equal(5.3984)
		expect(ramp.VisibleLeftWallHeight).to.equal(3.22)
		expect(ramp.VisibleRightWallHeight).to.equal(6.237)
		expect(ramp.Elasticity).to.equal(0.339)
		expect(ramp.Friction).to.equal(2.554)
		expect(ramp.Scatter).to.equal(83.45)
		expect(ramp.Collidable).to.equal(true)
		expect(ramp.HasHitEvent).to.equal(true)
		expect(ramp.Threshold).to.equal(1.003)
		expect(ramp.Visible).to.equal(true)
		expect(ramp.ReflectionEnabled).to.equal(true)
		expect(ramp.DepthBias).to.equal(2.332)
		expect(ramp.WireDiameter).to.equal(12)
		expect(ramp.WireDistanceX).to.equal(1.2)
		expect(ramp.WireDistanceY).to.equal(3.2)
		expect(ramp.PhysicsMaterial).to.equal('physmat')
		expect(ramp.OverwritePhysics).to.equal(true)
	})

	it('should update the state when static rendering is disabled', () => {
		const table = new TableBuilder()
			.addMaterial('mat', { isOpacityActive: true })
			.addMaterial('mat2')
			.addRamp('ramp', { szMaterial: 'mat' })
			.build()

		const player = new Player(table).init()
		const ramp = table.ramps.ramp.getApi()

		ramp.HeightBottom = 6
		ramp.HeightTop = 54
		ramp.WidthBottom = 89
		ramp.WidthTop = 32
		ramp.Material = 'mat2'
		ramp.Type = Enums.RampType.RampType1Wire
		ramp.ImageAlignment = Enums.ImageAlignment.ImageAlignTopLeft
		ramp.HasWallImage = false
		ramp.LeftWallHeight = 3
		ramp.RightWallHeight = 5
		ramp.VisibleLeftWallHeight = 3
		ramp.VisibleRightWallHeight = 6
		ramp.DepthBias = 3
		ramp.Visible = false

		const states = player.popStates()
		const state = states.getState<RampState>('ramp')

		expect(state.heightBottom).to.equal(6)
		expect(state.heightTop).to.equal(54)
		expect(state.widthBottom).to.equal(89)
		expect(state.widthTop).to.equal(32)
		expect(state.material).to.equal('mat2')
		expect(state.type).to.equal(Enums.RampType.RampType1Wire)
		expect(state.textureAlignment).to.equal(Enums.ImageAlignment.ImageAlignTopLeft)
		expect(state.hasWallImage).to.equal(false)
		expect(state.leftWallHeight).to.equal(3)
		expect(state.rightWallHeight).to.equal(5)
		expect(state.leftWallHeightVisible).to.equal(3)
		expect(state.rightWallHeightVisible).to.equal(6)
		expect(state.depthBias).to.equal(3)
		expect(state.isVisible).to.equal(false)
	})

	it('should toggle hit objects when setting Collidable', () => {
		const table = new TableBuilder().addMaterial('mat').addRamp('ramp').build()
		new Player(table).init()
		const item = table.ramps.ramp
		const ramp = item.getApi()

		expect(item.getHitShapes().length).to.be.above(0)
		ramp.Collidable = false
		expect(ramp.Collidable).to.equal(false)
		expect(item.getHitShapes().every(hit => !hit.isEnabled)).to.equal(true)

		ramp.Collidable = true
		expect(ramp.Collidable).to.equal(true)
		expect(item.getHitShapes().every(hit => hit.isEnabled)).to.equal(true)
	})

	it('should fall back to data when there are no hit objects', () => {
		const table = new TableBuilder().addMaterial('mat').addRamp('ramp').build()
		const player = new Player(table).init()
		const item = table.ramps.ramp
		const api = new RampApi(item.getState(), [], item.data, new EventProxy(item), player, table)

		expect(api.Collidable).to.equal(true)
		api.Collidable = false
		expect(api.Collidable).to.equal(false)
		expect(item.data.isCollidable).to.equal(false)
	})

	it('should allow unknown image names but reject HDR textures', () => {
		const table = new TableBuilder().addMaterial('mat').addRamp('ramp').build()
		new Player(table).init()
		const ramp = table.ramps.ramp.getApi()

		expect(() => {
			ramp.Image = 'does_not_exist_in_table'
		}).not.to.throw()
		expect(ramp.Image).to.equal('does_not_exist_in_table')

		table.textures.hdr_tex = {
			isHdr: () => true,
		} as any
		expect(() => {
			ramp.Image = 'hdr_tex'
		}).to.throw('Cannot use a HDR image (.exr/.hdr) here')
	})

	it('should stay visible with a single zero width and hide only when both are zero', () => {
		const tapered = new TableBuilder().addRamp('ramp', { widthTop: 0, widthBottom: 75 }).build()
		new Player(tapered).init()
		expect(tapered.ramps.ramp.getState().isVisible).to.equal(true)
		expect(tapered.ramps.ramp.getApi().WidthTop).to.equal(0)

		const flat = new TableBuilder().addRamp('ramp', { widthTop: 0, widthBottom: 0 }).build()
		new Player(flat).init()
		expect(flat.ramps.ramp.getState().isVisible).to.equal(false)
	})

	it('should generate finite meshes for a zero width without clamping data', () => {
		const table = new TableBuilder().addRamp('ramp', { widthTop: 0, widthBottom: 75 }).build()
		new Player(table).init()
		for (const info of Object.values(table.ramps.ramp.getMeshes(table))) {
			for (const v of info.mesh!.vertices) {
				expect(v.x).to.be.finite
				expect(v.y).to.be.finite
				expect(v.z).to.be.finite
				expect(v.nx).to.be.finite
				expect(v.ny).to.be.finite
				expect(v.nz).to.be.finite
			}
		}
	})
})
