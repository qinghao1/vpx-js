// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'
import type { RubberState } from './rubber-state.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball rubber API', () => {
	it('should correctly read and write the properties', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-rubber.vpx')))
		new Player(table).init()
		const rubber = table.rubbers.Rubber1.getApi()

		rubber.Height = 74
		rubber.HitHeight = 51
		rubber.Thickness = 2.1
		rubber.Material = 'material'
		rubber.Image = 'test_pattern'
		rubber.HasHitEvent = false
		expect(rubber.HasHitEvent).to.equal(false)
		rubber.HasHitEvent = true
		rubber.Elasticity = 1.3
		rubber.ElasticityFalloff = 0.339
		rubber.Friction = 2.5
		rubber.Scatter = 7.998
		rubber.Collidable = false
		expect(rubber.Collidable).to.equal(false)
		rubber.Collidable = true
		rubber.EnableStaticRendering = false
		expect(rubber.EnableStaticRendering).to.equal(false)
		rubber.EnableStaticRendering = true
		rubber.EnableShowInEditor = false
		expect(rubber.EnableShowInEditor).to.equal(false)
		rubber.EnableShowInEditor = true
		rubber.ReflectionEnabled = false
		expect(rubber.ReflectionEnabled).to.equal(false)
		rubber.ReflectionEnabled = true
		rubber.RotX = 7
		rubber.RotY = 124
		rubber.RotZ = 34
		rubber.PhysicsMaterial = 'PhysicsMaterial'
		rubber.OverwritePhysics = false
		expect(rubber.OverwritePhysics).to.equal(false)
		rubber.OverwritePhysics = true
		rubber.Visible = false
		expect(rubber.Visible).to.equal(false)
		rubber.Visible = true

		expect(rubber.Height).to.equal(74)
		expect(rubber.HitHeight).to.equal(51)
		expect(rubber.Thickness).to.equal(2.1)
		expect(rubber.Material).to.equal('material')
		expect(rubber.Image).to.equal('test_pattern')
		expect(rubber.HasHitEvent).to.equal(true)
		expect(rubber.Elasticity).to.equal(1.3)
		expect(rubber.ElasticityFalloff).to.equal(0.339)
		expect(rubber.Friction).to.equal(2.5)
		expect(rubber.Scatter).to.equal(7.998)
		expect(rubber.Collidable).to.equal(true)
		expect(rubber.EnableStaticRendering).to.equal(true)
		expect(rubber.EnableShowInEditor).to.equal(true)
		expect(rubber.ReflectionEnabled).to.equal(true)
		expect(rubber.RotX).to.equal(7)
		expect(rubber.RotY).to.equal(124)
		expect(rubber.RotZ).to.equal(34)
		expect(rubber.PhysicsMaterial).to.equal('PhysicsMaterial')
		expect(rubber.OverwritePhysics).to.equal(true)
		expect(rubber.Visible).to.equal(true)
	})

	it('should update the state when static rendering is disabled', () => {
		const table = new TableBuilder().addMaterial('mat').addRubber('rubber', { staticRendering: false }).build()

		const player = new Player(table).init()
		const rubber = table.rubbers.rubber.getApi()

		rubber.Height = 2
		rubber.Material = 'mat'
		rubber.RotX = 5
		rubber.RotY = 3
		rubber.RotZ = 4

		const states = player.popStates()
		const state = states.getState<RubberState>('rubber')

		expect(state.height).to.equal(2)
		expect(state.material).to.equal('mat')
		expect(state.rotX).to.equal(5)
		expect(state.rotY).to.equal(3)
		expect(state.rotZ).to.equal(4)
	})

	it('should not crash when executing unused APIs', () => {
		const table = new TableBuilder()
			.addMaterial('mat', { isOpacityActive: true })
			.addMaterial('mat2')
			.addRubber('rubber')
			.build()
		new Player(table).init()
		const rubber = table.rubbers.rubber.getApi()
		expect(rubber.InterfaceSupportsErrorInfo({})).to.equal(false)
	})
})
