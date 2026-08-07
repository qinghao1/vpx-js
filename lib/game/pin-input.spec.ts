// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../test/table-builder.js'
import type { Table } from '../vpt/table/table.js'
import { AssignKey } from './key-code.js'
import { Player } from './player.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball input handler', () => {
	let table: Table
	let player: Player
	let scope: any

	beforeEach(() => {
		scope = {}
		// this just writes the key code to the scope so we can assert it later
		const vbs = `Sub Table1_KeyDown(ByVal keycode)\nkeyDown = keycode\nEnd Sub\nSub Table1_KeyUp(ByVal keycode)\nkeyUp = keycode\nEnd Sub\n`
		table = new TableBuilder().withTableScript(vbs).build('Table1')
		player = new Player(table).init(scope)
	})

	it('should react on left flipper key down', () => {
		player.onKeyDown({ code: 'ControlLeft', key: 'Control', ts: Date.now() })
		player.updatePhysics(20)
		expect(scope.keyDown).to.be.equal(player.getKey(AssignKey.LeftFlipperKey))
	})

	it('should react on plunger key down', () => {
		player.onKeyDown({ code: 'Enter', key: 'Enter', ts: Date.now() })
		player.updatePhysics(20)
		expect(scope.keyDown).to.be.equal(player.getKey(AssignKey.PlungerKey))
	})

	it('should react on some other key down', () => {
		player.onKeyDown({ code: 'KeyG', key: 'g', ts: Date.now() })
		player.updatePhysics(20)
		expect(scope.keyDown).to.be.equal(0x22)
	})

	it('should react on a key up', () => {
		player.onKeyUp({ code: 'ControlRight', key: 'Control', ts: Date.now() })
		player.updatePhysics(20)
		expect(scope.keyUp).to.be.equal(player.getKey(AssignKey.RightFlipperKey))
	})
})
