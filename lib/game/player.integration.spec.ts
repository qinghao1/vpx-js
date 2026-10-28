// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as sinon from 'sinon'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { PinMameEmulator } from '../emu/pinmame/pinmame-emu.js'
import { resetPinmameModuleCache } from '../emu/pinmame/pinmame-loader.js'
import { VpmController } from '../scripting/objects/vpm-controller.js'
import { ERR } from '../scripting/stdlib/err.js'
import { Player } from './player.js'

describe('Player integration', () => {
	const sandbox = sinon.createSandbox()
	let origFetch: typeof globalThis.fetch
	beforeEach(() => {
		resetPinmameModuleCache()
		origFetch = globalThis.fetch
	})
	afterEach(() => {
		sandbox.restore()
		globalThis.fetch = origFetch
	})

	it('empty player smoke: init, step, frame, no emu before Vpm switch', () => {
		const player = new Player(new TableBuilder().build()).init()
		expect(player.balls.length).toBe(0)
		expect(typeof player.updatePhysics(16)).toBe('number')
		expect(() => player.simulateTime(20)).not.toThrow()
		const changed = player.onFrame()
		expect(changed.isEmpty).toBe(true)
		changed.release?.()
		expect(player.getPhysics().emu).toBeUndefined()
	})

	it('boots the VPM table-init path: ExecuteGlobal core.vbs plus cvpmFlips2.Init without UseSolenoids', () => {
		const table = new TableBuilder()
			.withTableScript(
				'On Error Resume Next\n' +
					'ExecuteGlobal GetTextFile("core.vbs")\n' +
					'Dim flips2\n' +
					'Set flips2 = New cvpmFlips2\n' +
					'flips2.Init\n',
			)
			.build()
		let player: Player | undefined
		const scope: Record<string, unknown> = {}
		expect(() => {
			player = new Player(table).init(scope)
		}).not.toThrow()
		expect(player?.balls.length).toBe(0)
		// Eval-derived defaults from core.vbs (BallSize/UseVPMDMD are Empty, so
		// IsEmpty(Eval(...)) takes the default branch in each case).
		expect(scope.BSize).toBe(25)
		expect(scope.UseDMD).toBe(false)
		// The boot's only handled error is flips2.Init's Eval of an Empty
		// variable, recorded as 13 through the Eval-Empty path.
		expect(ERR.Number).toBe(13)
		ERR.Clear()
		ERR.OnErrorGoto0()
	})

	it('creates Player with GameName script and inits', () => {
		const table = new TableBuilder().withTableScript('cGameName="twd_160h"').build()
		expect(table.tableScript).toContain('twd_160h')
		expect(new Player(table).init()).toBeDefined()
	})

	it('PinInput handles flipper key events without throw', () => {
		const player = new Player(new TableBuilder().addFlipper('Flipper1').build()).init()
		expect(() => player.onKeyDown({ code: 'ShiftLeft', key: 'Shift' })).not.toThrow()
		expect(() => player.onKeyUp({ code: 'ShiftLeft', key: 'Shift' })).not.toThrow()
		expect(() => player.onKeyDown({ code: 'ShiftRight', key: 'Shift' })).not.toThrow()
		expect(() => player.onKeyUp({ code: 'ShiftRight', key: 'Shift' })).not.toThrow()
	})

	it('Player physics steps emu after Vpm load', async () => {
		const player = new Player(new TableBuilder().build()).init()
		const vpm = new VpmController(player)
		sandbox.stub(PinMameEmulator.prototype, 'loadGame').callsFake(async function (this: PinMameEmulator) {
			;(this as any).ready = true
			return
		})
		globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0]).buffer }) as any
		vpm.GameName = 'generic_test_game'
		await vpm.whenReady()
		expect(player.getPhysics().emu).toBeDefined()
		expect(() => player.updatePhysics(16)).not.toThrow()
	})
})
