// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import { HitTargetData } from './hit-target.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball hit target API', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-hit-target.vpx')))
		player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const dropTarget = table.hitTargets.DropTargetBeveled.getApi()

		dropTarget.Material = 'dtmat'
		expect(dropTarget.Material).to.equal('dtmat')
		dropTarget.Visible = false
		expect(dropTarget.Visible).to.equal(false)
		dropTarget.Visible = true
		expect(dropTarget.Visible).to.equal(true)
		dropTarget.X = 4121
		expect(dropTarget.X).to.equal(4121)
		dropTarget.Y = 531
		expect(dropTarget.Y).to.equal(531)
		dropTarget.Z = 5234
		expect(dropTarget.Z).to.equal(5234)
		dropTarget.ScaleX = 14121
		expect(dropTarget.ScaleX).to.equal(14121)
		dropTarget.ScaleY = 2531
		expect(dropTarget.ScaleY).to.equal(2531)
		dropTarget.ScaleZ = 35234
		expect(dropTarget.ScaleZ).to.equal(35234)
		dropTarget.Orientation = 12.112
		expect(dropTarget.Orientation).to.equal(12.112)
		dropTarget.HasHitEvent = false
		expect(dropTarget.HasHitEvent).to.equal(false)
		dropTarget.HasHitEvent = true
		expect(dropTarget.HasHitEvent).to.equal(true)
		dropTarget.Threshold = 11.5987
		expect(dropTarget.Threshold).to.equal(11.5987)
		dropTarget.Elasticity = 394.2
		expect(dropTarget.Elasticity).to.equal(394.2)
		dropTarget.ElasticityFalloff = 66.665
		expect(dropTarget.ElasticityFalloff).to.equal(66.665)
		dropTarget.Friction = 22.1123
		expect(dropTarget.Friction).to.equal(1)
		dropTarget.Friction = -22.1123
		expect(dropTarget.Friction).to.equal(0)
		dropTarget.Friction = 0.1123
		expect(dropTarget.Friction).to.equal(0.1123)
		dropTarget.Scatter = 0.33
		expect(dropTarget.Scatter).to.equal(0.33)
		dropTarget.Collidable = false
		expect(dropTarget.Collidable).to.equal(false)
		dropTarget.Collidable = true
		expect(dropTarget.Collidable).to.equal(true)
		dropTarget.DisableLighting = false
		expect(dropTarget.DisableLighting).to.equal(false)
		dropTarget.DisableLighting = true
		expect(dropTarget.DisableLighting).to.equal(true)
		dropTarget.BlendDisableLighting = 0.665
		expect(dropTarget.BlendDisableLighting).to.equal(0.665)
		dropTarget.BlendDisableLightingFromBelow = 1.335
		expect(dropTarget.BlendDisableLightingFromBelow).to.equal(1.335)
		dropTarget.ReflectionEnabled = false
		expect(dropTarget.ReflectionEnabled).to.equal(false)
		dropTarget.ReflectionEnabled = true
		expect(dropTarget.ReflectionEnabled).to.equal(true)
		dropTarget.DropSpeed = 5.68
		expect(dropTarget.DropSpeed).to.equal(5.68)
		dropTarget.LegacyMode = false
		expect(dropTarget.LegacyMode).to.equal(false)
		dropTarget.LegacyMode = true
		expect(dropTarget.LegacyMode).to.equal(true)
		dropTarget.DrawStyle = 4
		expect(dropTarget.DrawStyle).to.equal(4)
		dropTarget.DrawStyle = 3
		expect(dropTarget.DrawStyle).to.equal(3)
		dropTarget.PhysicsMaterial = 'htpmat'
		expect(dropTarget.PhysicsMaterial).to.equal('htpmat')
		dropTarget.OverwritePhysics = false
		expect(dropTarget.OverwritePhysics).to.equal(false)
		dropTarget.OverwritePhysics = true
		expect(dropTarget.OverwritePhysics).to.equal(true)
		expect(dropTarget.HitThreshold).not.to.be.undefined
		dropTarget.RaiseDelay = 23
		expect(dropTarget.RaiseDelay).to.equal(23)
		dropTarget.DepthBias = 22.112
		expect(dropTarget.DepthBias).to.equal(22.112)
		dropTarget.Name = 'drop taaahget neym'
		expect(dropTarget.Name).to.equal('drop taaahget neym')
		dropTarget.TimerInterval = 1235
		expect(dropTarget.TimerInterval).to.equal(1235)
		dropTarget.TimerEnabled = false
		expect(dropTarget.TimerEnabled).to.equal(false)
		dropTarget.TimerEnabled = true
		expect(dropTarget.TimerEnabled).to.equal(true)

		dropTarget.UserValue = 'dtuv'
		expect(dropTarget.UserValue).to.equal('dtuv')
	})

	it('should back the upstream VBS property names with item data', () => {
		const item = table.hitTargets.DropTargetBeveled
		const dropTarget = item.getApi()

		dropTarget.LegacyMode = true
		expect(item.data.legacy).to.equal(true)
		dropTarget.DrawStyle = 4
		expect(item.data.targetType).to.equal(4)
		dropTarget.DisableLighting = true
		expect(item.data.disableLightingTop).to.equal(1)
		dropTarget.DisableLighting = false
		expect(item.data.disableLightingTop).to.equal(0)
		dropTarget.BlendDisableLighting = 0.665
		expect(item.data.disableLightingTop).to.equal(0.665)
		expect(dropTarget.DisableLighting).to.equal(true)
		dropTarget.BlendDisableLightingFromBelow = 1.335
		expect(item.data.disableLightingBelow).to.equal(1.335)
		dropTarget.ReflectionEnabled = false
		expect(item.data.isReflectionEnabled).to.equal(false)

		const untyped = dropTarget as unknown as Record<string, unknown>
		expect(untyped.Legacy).to.be.undefined
		expect(untyped.TargetType).to.be.undefined
	})

	it('should report the drop animation offset via CurrentAnimOffset', () => {
		const item = table.hitTargets.DropTargetBeveled
		const dropTarget = item.getApi()

		expect(dropTarget.CurrentAnimOffset).to.equal(0)
		dropTarget.IsDropped = true
		player.simulateTime(200)
		expect(dropTarget.CurrentAnimOffset).to.be.below(0)
		expect(dropTarget.CurrentAnimOffset).to.equal(item.getState().zOffset)
	})

	it('should drop and raise the drop target', () => {
		const item = table.hitTargets.DropTargetBeveled
		const dropTarget = item.getApi()

		// set to dropped — state flips immediately, animation follows
		dropTarget.IsDropped = true
		expect(dropTarget.IsDropped).to.equal(true)
		expect(item.getState().zOffset).to.equal(0)

		// animate down
		player.simulateTime(200)
		expect(dropTarget.IsDropped).to.equal(true)
		expect(item.getState().zOffset).to.be.below(0)

		// set to raised — state flips immediately, animation follows
		dropTarget.IsDropped = false
		expect(dropTarget.IsDropped).to.equal(false)

		// animate up
		player.simulateTime(420)
		expect(dropTarget.IsDropped).to.equal(false)
		expect(item.getState().zOffset).to.equal(0)
	})

	it('should stay raised when raised again before the drop animation completes', () => {
		const item = table.hitTargets.DropTargetBeveled
		const dropTarget = item.getApi()

		dropTarget.IsDropped = true
		expect(dropTarget.IsDropped).to.equal(true)
		dropTarget.IsDropped = false
		expect(dropTarget.IsDropped).to.equal(false)

		player.simulateTime(600)
		expect(dropTarget.IsDropped).to.equal(false)
		expect(item.getState().zOffset).to.equal(0)
	})
})

describe('The VPinball hit target animation', () => {
	function setup(attrs: Record<string, unknown> = {}) {
		const table = new TableBuilder().addHitTarget('target', attrs).build()
		const player = new Player(table).init()
		const item = table.hitTargets.target
		return { table, player, item, api: item.getApi() }
	}

	it('should keep the mesh static and start dropped targets at the drop offset', () => {
		const raised = setup()
		const dropped = setup({ isDropped: true })
		const limit = 52 * dropped.table.getScaleZ()

		expect(dropped.item.getState().zOffset).to.equal(-limit)
		expect(dropped.api.CurrentAnimOffset).to.equal(-limit)

		const raisedMesh = raised.item.getMeshes(raised.table).hitTarget.mesh
		const droppedMesh = dropped.item.getMeshes(dropped.table).hitTarget.mesh
		expect(droppedMesh.vertices.map(v => v.z)).to.deep.equal(raisedMesh.vertices.map(v => v.z))
	})

	it('should raise an initially-dropped target exactly back to zero', () => {
		const { player, item, api } = setup({ isDropped: true })

		api.IsDropped = false
		player.simulateTime(2000)

		expect(api.IsDropped).to.equal(false)
		expect(item.getState().zOffset).to.equal(0)
	})

	it('should register and fire Animate while a drop target animates', () => {
		const { player, item, api } = setup()
		expect(item.getEventNames()).to.include('Animate')

		let animate = 0
		api.on('Animate', () => animate++)
		api.Hit()
		player.simulateTime(2000)

		expect(animate).to.be.above(0)
	})

	it('should fire Animate while a standup target animates', () => {
		const { player, api } = setup({ targetType: Enums.TargetType.HitTargetRound })

		let animate = 0
		api.on('Animate', () => animate++)
		api.Hit()
		player.simulateTime(2000)

		expect(animate).to.be.above(0)
	})

	it('should not animate invisible targets until shown', () => {
		const { player, item, api } = setup({ isVisible: false })

		api.Hit()
		player.simulateTime(2000)
		expect(item.getState().zOffset).to.equal(0)

		api.Visible = true
		expect(item.data.isVisible).to.equal(true)
		player.simulateTime(4000)
		expect(item.getState().zOffset).to.be.below(0)
	})
})

describe('The legacy hit target DILI tag', () => {
	async function loadWithDili(value: number): Promise<HitTargetData> {
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
		return HitTargetData.fromStorage(storage as unknown as Storage, 'Target')
	}

	it('should read DILI=1 as fully disabled lighting', async () => {
		expect((await loadWithDili(1)).disableLightingTop).to.equal(1)
	})

	it('should dequantize other legacy DILI values', async () => {
		expect((await loadWithDili(0)).disableLightingTop).to.equal(0)
		expect((await loadWithDili(255)).disableLightingTop).to.equal(1)
		expect((await loadWithDili(127)).disableLightingTop).to.be.closeTo(127 / 255, 1e-6)
	})
})
