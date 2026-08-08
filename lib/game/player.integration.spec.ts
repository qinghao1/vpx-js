// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as sinon from 'sinon'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GamelistDB } from 'wpc-emu'
import { TableBuilder } from '../../test/table-builder.js'
import { PinMameEmulator } from '../emu/pinmame/pinmame-emu.js'
import { resetPinmameModuleCache } from '../emu/pinmame/pinmame-loader.js'
import { VpmController } from '../scripting/objects/vpm-controller.js'
import { Player } from './player.js'

async function waitFor(fn: () => boolean, ms = 500): Promise<void> {
	const start = Date.now()
	while (!fn()) {
		if (Date.now() - start > ms) throw new Error('waitFor timeout')
		await new Promise((r) => setTimeout(r, 10))
	}
}

describe('Player integration', () => {
	const sandbox = sinon.createSandbox()
	let origFetch: typeof globalThis.fetch
	beforeEach(() => { resetPinmameModuleCache(); origFetch = globalThis.fetch })
	afterEach(() => { sandbox.restore(); globalThis.fetch = origFetch })

	it('inits empty TableBuilder and simulates physics', () => {
		const player = new Player(new TableBuilder().build()).init()
		expect(player.balls.length).toBe(0)
		expect(typeof player.updatePhysics(16)).toBe('number')
		expect(() => player.simulateTime(20)).not.toThrow()
	})

	it('creates Player with GameName script and inits', () => {
		const table = new TableBuilder().withTableScript('cGameName="twd_160h"').build()
		expect(table.tableScript).toContain('twd_160h')
		expect(new Player(table).init()).toBeDefined()
	})

	it('Player popStates diffs after ball creation', () => {
		const states = new Player(new TableBuilder().build()).init().popStates()
		expect(states).toBeDefined()
	})

	it('updatePhysics and onFrame work together', () => {
		const player = new Player(new TableBuilder().build()).init()
		player.updatePhysics(16)
		const changed = player.onFrame()
		expect(changed).toBeDefined()
		changed.release?.()
	})

	it('PinInput handles flipper key events without throw', () => {
		const player = new Player(new TableBuilder().addFlipper('Flipper1').build()).init()
		expect(() => player.onKeyDown({ code: 'ShiftLeft', key: 'Shift', ts: Date.now() })).not.toThrow()
		expect(() => player.onKeyUp({ code: 'ShiftLeft', key: 'Shift', ts: Date.now() })).not.toThrow()
		expect(() => player.onKeyDown({ code: 'ShiftRight', key: 'Shift', ts: Date.now() })).not.toThrow()
		expect(() => player.onKeyUp({ code: 'ShiftRight', key: 'Shift', ts: Date.now() })).not.toThrow()
	})

	it('VpmController routing: WPC uses wpc-emu, SAM/generic uses pinmame', async () => {
		expect(GamelistDB.getByPinmameName('mm_109')).toBeTruthy()
		expect(GamelistDB.getByPinmameName('twd_160h')).toBeFalsy()
		const player = new Player(new TableBuilder().build())
		const vpm = new VpmController(player)
		player.init()
		const pinStub = sandbox.stub(PinMameEmulator.prototype, 'loadGame').resolves()
		globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0]).buffer }) as any
		vpm.GameName = 'twd_160h'
		await waitFor(() => pinStub.called)
		await vpm.whenReady()
		expect(player.getPhysics().emu?.constructor.name).toBe('PinMameEmulator')
	})

	it('generic arbitrary GameName also routes to PinMAME', async () => {
		expect(GamelistDB.getByPinmameName('my_custom_zzz')).toBeFalsy()
		const player = new Player(new TableBuilder().build())
		const vpm = new VpmController(player)
		player.init()
		const stub = sandbox.stub(PinMameEmulator.prototype, 'loadGame').resolves()
		globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0]).buffer }) as any
		vpm.GameName = 'my_custom_zzz'
		await waitFor(() => stub.called)
		await vpm.whenReady()
		expect(player.getPhysics().emu?.constructor.name).toBe('PinMameEmulator')
	})

	it('Player physics emu defaults to undefined before VpmController switch', () => {
		expect(new Player(new TableBuilder().build()).init().getPhysics().emu).toBeUndefined()
	})

	it('Player physics steps emu after Vpm load', async () => {
		const player = new Player(new TableBuilder().build()).init()
		const vpm = new VpmController(player)
		sandbox.stub(PinMameEmulator.prototype, 'loadGame').callsFake(async function (this: PinMameEmulator) { (this as any).ready = true; return })
		globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0]).buffer }) as any
		vpm.GameName = 'generic_test_game'
		await vpm.whenReady()
		expect(player.getPhysics().emu).toBeDefined()
		expect(() => player.updatePhysics(16)).not.toThrow()
	})
})
