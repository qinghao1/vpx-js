// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as sinon from 'sinon'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GamelistDB } from 'wpc-emu'
import { TableBuilder } from '../../../test/table-builder.js'
import { PinMameEmulator } from '../../emu/pinmame/pinmame-emu.js'
import { resetPinmameModuleCache } from '../../emu/pinmame/pinmame-loader.js'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../../vpt/table/table.js'
import { VpmController } from './vpm-controller.js'

async function waitFor(fn: () => boolean, ms = 500): Promise<void> {
	const start = Date.now()
	while (!fn()) {
		if (Date.now() - start > ms) throw new Error('waitFor timeout')
		await new Promise((r) => setTimeout(r, 10))
	}
}

describe('VpmController integration', () => {
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

	it('routes WPC to wpc-emu, SAM/generic to pinmame', async () => {
		expect(GamelistDB.getByPinmameName('mm_109')).toBeTruthy()
		expect(GamelistDB.getByPinmameName('twd_160h')).toBeFalsy()
		const table = new TableBuilder().build()
		const player = new Player(table)
		const vpm = new VpmController(player)
		const samLoad = sandbox.stub(PinMameEmulator.prototype, 'loadGame').resolves()
		globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0]).buffer }) as any
		vpm.GameName = 'twd_160h'
		await waitFor(() => samLoad.called)
		expect(samLoad.called).toBe(true)
	})

	it('Switch proxy handles WPC and fliptronics', () => {
		const vpm = new VpmController(new Player(new TableBuilder().build()))
		expect(vpm.Switch[11]).toBe(0)
		expect(vpm.Lamp[11]).toBe(0)
		expect(vpm.Solenoid[0]).toBe(0)
		expect(vpm.GIString[0]).toBe(0)
		expect(() => (vpm.Dip[0] = 0x55)).not.toThrow()
		expect(() => (vpm.Switch[112] = 1)).not.toThrow()
		expect(() => (vpm.Switch[112] = 0)).not.toThrow()
	})

	it('loads Walking Dead VPX and extracts GameName (if present)', async () => {
		const vpxPath = path.resolve('walking_dead.vpx')
		if (!fs.existsSync(vpxPath)) return
		const table = await Table.load(new NodeBinaryReader(vpxPath))
		expect(table.tableScript?.length).toBeGreaterThan(10000)
		const m = table.tableScript?.match(/cGameName\s*=\s*["']([^"']+)["']/i)
		expect(m).not.toBeNull()
		expect(m?.[1].toLowerCase()).toBe('twd_160h')
	})

	it('generic game name routes to PinMAME — not just twd_160h', async () => {
		const vpm = new VpmController(new Player(new TableBuilder().build()))
		const stub = sandbox.stub(PinMameEmulator.prototype, 'loadGame').resolves()
		globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0]).buffer }) as any
		vpm.GameName = 'my_custom_game_123'
		await waitFor(() => stub.called)
		expect(stub.firstCall.args[0]).toBe('my_custom_game_123')
	})

	it('full wiring with mock ROM', async () => {
		const player = new Player(new TableBuilder().build())
		const vpm = new VpmController(player)
		player.init()
		const stub = sandbox.stub(PinMameEmulator.prototype, 'loadGame').resolves()
		globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }) as any
		vpm.GameName = 'twd_160h'
		await waitFor(() => stub.called)
		expect(stub.firstCall.args[0]).toBe('twd_160h')
		await vpm.whenReady()
		expect(player.getPhysics().emu?.constructor.name).toBe('PinMameEmulator')
		expect(vpm.Version).toBe('00990201')
		expect(vpm.ChangedLamps).toBeDefined()
	})

	it('whenReady resolves after load', async () => {
		const vpm = new VpmController(new Player(new TableBuilder().build()))
		sandbox.stub(PinMameEmulator.prototype, 'loadGame').resolves()
		globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0]).buffer }) as any
		vpm.GameName = 'any_game_xyz'
		await expect(vpm.whenReady()).resolves.toBeUndefined()
	})
})
