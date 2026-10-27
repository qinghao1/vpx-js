// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import os from 'node:os'
import * as chai from 'chai'
import { expect } from 'chai'
import type { SinonStub } from 'sinon'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { PinMameEmulator } from '../../emu/pinmame/pinmame-emu.js'
import { crc32 } from '../../emu/rom-fetcher.js'
import { Emulator } from '../../emu/wpc-emu.js'
import { Player } from '../../game/player.js'
import type { Table } from '../../vpt/table/table.js'
import { vbsEquals, vbsNot } from '../vbs-values.js'
import { VpmController } from './vpm-controller.js'

/** Display/debug stubs defined on VpmController at runtime via Object.defineProperty in its static block. */
interface VpmControllerDisplayStubs {
	ShowDMDOnly: boolean
	HandleKeyboard: boolean
	ShowTitle: boolean
	LockDisplay: boolean
	Hidden: boolean
	DoubleSize: boolean
	Antialias: boolean
	ShowFrame: boolean
	BorderSizeX: number
	BorderSizeY: number
	WindowPosX: number
	WindowPosY: number
}

chai.use((sinonChai as any).default ?? sinonChai)
describe('The VpmController - VISUAL PINMAME COM OBJECT', () => {
	const sandbox = sinon.createSandbox()
	let vpmController: VpmController & VpmControllerDisplayStubs
	let setSwitchInputSpy: SinonStub<[number, boolean?]>
	let setFliptronicsInputSpy: SinonStub<[string, boolean?]>
	let setDipSwitchByteSpy: SinonStub<[number, number?]>
	let _getDipSwitchByteSpy: SinonStub<any>

	beforeEach(() => {
		setSwitchInputSpy = sandbox.stub(Emulator.prototype, 'setSwitchInput').returns(true)
		setFliptronicsInputSpy = sandbox.stub(Emulator.prototype, 'setFliptronicsInput')
		setDipSwitchByteSpy = sandbox.stub(Emulator.prototype, 'setDipSwitchByte')
		_getDipSwitchByteSpy = sandbox.stub(Emulator.prototype, 'getDipSwitchByte').returns(123)

		const table: Table = new TableBuilder().build()
		const player: Player = new Player(table)
		vpmController = new VpmController(player) as VpmController & VpmControllerDisplayStubs
	})

	afterEach(() => {
		sandbox.restore()
	})

	//TODO this fails due wpc-emu module loader
	it('should set and get GameName', () => {
		const NAME: string = 'foo'
		vpmController.GameName = NAME
		expect(vpmController.GameName).to.equal(NAME)
	})

	it('should set and get pause state', () => {
		vpmController.Pause = true
		expect(vpmController.Pause).to.equal(true)
	})

	it('should not run when paused', () => {
		vpmController.Pause = true
		expect(vpmController.Running).to.equal(false)
	})

	it('should not run when emu is not initialized', () => {
		vpmController.Pause = false
		expect(vpmController.Running).to.equal(false)
	})

	it('should Stop', () => {
		vpmController.Stop()
		expect(vpmController.Running).to.equal(false)
	})

	it('should set and get Dip[0] - bank-aware, WPC uses bank 0', () => {
		const VALUE: number = 0x55
		vpmController.Dip[0] = VALUE
		expect(setDipSwitchByteSpy.args[0][0]).to.equal(VALUE)
		expect(setDipSwitchByteSpy.args[0][1]).to.equal(0)
		expect(vpmController.Dip[0]).to.equal(VALUE)
	})

	it('should set and get SolMask from the cache', () => {
		vpmController.SolMask[3] = 5
		expect(vpmController.SolMask[3]).to.equal(5)
	})

	it('should forward SolMask to an emulator that supports masks', () => {
		const calls: Array<[number, number]> = []
		;(vpmController as any).emulator = {
			getSolMask: (_low: number) => 7,
			setSolMask: (low: number, mask: number) => {
				calls.push([low, mask])
			},
		}
		vpmController.SolMask[4] = 9
		expect(calls).to.deep.equal([[4, 9]])
		expect(vpmController.SolMask[4]).to.equal(9)
		expect(vpmController.SolMask[6]).to.equal(7)
	})

	it('should set and get TimeFence, forwarding to the emulator', () => {
		const seen: number[] = []
		;(vpmController as any).emulator = {
			setTimeFence: (t: number) => {
				seen.push(t)
			},
		}
		vpmController.TimeFence = 1234
		expect(vpmController.TimeFence).to.equal(1234)
		expect(seen).to.deep.equal([1234])
	})

	it('should tolerate an emulator without setTimeFence', () => {
		vpmController.TimeFence = 42
		expect(vpmController.TimeFence).to.equal(42)
	})

	it('WPC branch builds a fresh wpc Emulator even with a PinMAME emulator installed', async () => {
		const installed = new PinMameEmulator()
		;(vpmController as any).emulator = installed
		const body = new TextEncoder().encode('ABCD')
		const entry = [
			{
				id: 'mm_109c',
				rom_files: [
					{ filename: 'mm_1_09c.bin', bytes: body.length, crc: crc32(body), type: 'main', system: 'wpc' },
				],
				file: {
					id: 'x',
					name: 'mm_109c.zip',
					bytes: 4,
					mime_type: 'application/zip',
					url: 'https://storage.vpdb.io/files/x.zip',
					is_protected: true,
					counter: { downloads: 1 },
					variations: {},
				},
			},
		]
		const origFetch = globalThis.fetch
		globalThis.fetch = (async (url: any) => {
			const s = String(url)
			if (s.includes('/v1/games/mm/roms/')) return { ok: true, json: async () => entry }
			return { ok: true, arrayBuffer: async () => body.buffer }
		}) as any
		const loadGame = sandbox.stub(Emulator.prototype, 'loadGame').resolves()
		try {
			vpmController.GameName = 'mm_109c'
			await vpmController.whenReady()
			expect(loadGame.calledOnce).to.equal(true)
			const emu = (vpmController as any).emulator
			expect(emu).to.be.an.instanceof(Emulator)
			expect(emu).to.not.equal(installed)
			expect(loadGame.firstCall.args[1]).to.deep.equal(new Uint8Array([65, 66, 67, 68]))
		} finally {
			globalThis.fetch = origFetch
		}
	})

	it('RawDmdPixels falls back to a zeroed w*h buffer when the emulator throws', () => {
		;(vpmController as any).emulator = {
			getDmdDimensions: () => ({ x: 128, y: 32 }),
			getDmdFrame: () => {
				throw new Error('dead core')
			},
		}
		const pixels = vpmController.RawDmdPixels
		expect(pixels).to.be.an.instanceof(Uint8Array)
		expect(pixels.length).to.equal(128 * 32)
		expect([...pixels].every(v => v === 0)).to.equal(true)
	})

	it('should fetch ROMs from shaped URLs without leaking the home dir', async () => {
		const name = 'testgame-shape-09'
		const urls: string[] = []
		const g = globalThis as any
		const origFetch = globalThis.fetch
		const origLocation = g.location
		const origPendingRom = g.__pendingRom
		const origPendingRomName = g.__pendingRomName
		g.__pendingRom = undefined
		g.__pendingRomName = undefined
		VpmController.setRomBaseUrls(['https://roms.example.com/base'])
		g.location = { search: '' }
		globalThis.fetch = (async (url: any) => {
			urls.push(String(url))
			return { ok: false, status: 404 }
		}) as any
		try {
			const rom = await (vpmController as any).fetchRom(name)
			expect(rom).to.be.an.instanceof(Uint8Array)
			const mine = urls.filter(u => u.includes(name))
			expect(mine).to.deep.equal([
				`https://roms.example.com/base/${name}.zip`,
				`/pinmame/roms/${name}.zip`,
				`/roms/${name}.zip`,
			])
			for (const u of mine) expect(u).to.not.contain(os.homedir())
		} finally {
			globalThis.fetch = origFetch
			g.location = origLocation
			g.__pendingRom = origPendingRom
			g.__pendingRomName = origPendingRomName
			VpmController.setRomBaseUrls([])
		}
	})

	it('no changed lamps detected', () => {
		const result = vpmController.ChangedLamps
		expect(result).to.deep.equal([])
	})

	it('no changed solenoid detected', () => {
		const result = vpmController.ChangedSolenoids
		expect(result).to.deep.equal([])
	})

	it('no changed GI detected', () => {
		const result = vpmController.ChangedGI
		expect(result).to.deep.equal([])
	})

	it('no changed LEDs detected', () => {
		const result = vpmController.ChangedLEDs
		expect(result).to.deep.equal([])
	})

	it('should ignore writes to RO settings', () => {
		vpmController.Solenoid[0] = 1
		vpmController.Lamp[0] = 1
		vpmController.GIString[0] = 1
		vpmController.Switch[0] = 1
		expect(vpmController.Solenoid[0]).to.equal(0)
	})

	it('should ignore calls to Customization functions', () => {
		vpmController.SetDisplayPosition(1, 2, 3)
		vpmController.ShowOptsDialog(3)
		vpmController.ShowPathesDialog(3)
		const foo = vpmController.ShowAboutDialog(3)
		expect(foo).to.equal(undefined)
	})

	it('should ignore calls to B2SSetData (B2S backglass data)', () => {
		const result = vpmController.B2SSetData(1, 1)
		expect(result).to.equal(undefined)
	})

	it('get Switch 0 (offset 11)', () => {
		const result = vpmController.Switch[11]
		expect(result).to.deep.equal(0)
	})

	it('should return VARIANT_BOOL -1/0 from Switch so `= True` guards work', () => {
		vpmController.Switch[11] = 1
		expect(vpmController.Switch[11]).to.equal(-1)
		vpmController.Switch[11] = 0
		expect(vpmController.Switch[11]).to.equal(0)
	})

	it('should keep the plunger fire-button guard closed when the lane switch is set', () => {
		// walking_dead KeyDown guard: `NOT Controller.Switch(23) = True`.
		vpmController.Switch[23] = 1
		const guard = vbsNot(vbsEquals(vpmController.Switch[23], true))
		expect(guard).to.equal(false)
	})

	it('validate setSwitchInput is called with the correct settings, using 1 as input', () => {
		vpmController.Switch[11] = 1
		expect(setSwitchInputSpy.args[0]).to.deep.equal([11, true])
	})

	it('validate setSwitchInput is called with the correct settings, using 0 as input', () => {
		vpmController.Switch[11] = 0
		expect(setSwitchInputSpy.args[0]).to.deep.equal([11, false])
	})

	it('validate setFliptronicsInput is called (F2), using 0 as input', () => {
		vpmController.Switch[112] = 0
		expect(setFliptronicsInputSpy.args[0]).to.deep.equal(['F2', false])
	})

	it('validate setFliptronicsInput is called (F6), using 1 as input', () => {
		vpmController.Switch[116] = 1
		expect(setFliptronicsInputSpy.args[0]).to.deep.equal(['F6', true])
	})

	it('validate setFliptronicsInput is called (F8), using false as input', () => {
		// @ts-expect-error
		vpmController.Switch[118] = false
		expect(setFliptronicsInputSpy.args[0]).to.deep.equal(['F8', false])
	})

	it('validate setSwitchInput is called with the correct settings, using true as input', () => {
		// @ts-expect-error
		vpmController.Switch[11] = true
		expect(setSwitchInputSpy.args[0]).to.deep.equal([11, true])
	})

	it('validate setSwitchInput is called with the correct settings, using false as input', () => {
		// @ts-expect-error
		vpmController.Switch[11] = false
		expect(setSwitchInputSpy.args[0]).to.deep.equal([11, false])
	})

	it('get Lamp 0 (offset 11)', () => {
		const result = vpmController.Lamp[11]
		expect(result).to.deep.equal(0)
	})

	it('get Solenoid 0', () => {
		const result = vpmController.Solenoid[0]
		expect(result).to.deep.equal(0)
	})

	it('get GIString 0', () => {
		const result = vpmController.GIString[0]
		expect(result).to.deep.equal(0)
	})

	it('is WPCNumbering?', () => {
		const result: number = vpmController.WPCNumbering
		expect(result).to.equal(1)
	})

	it('get SampleRate', () => {
		const result: number = vpmController.SampleRate
		expect(result).to.equal(22050)
	})

	it('CheckROMS()', () => {
		const result: boolean = vpmController.CheckROMS(1)
		expect(result).to.equal(true)
	})

	it('get Version', () => {
		const result: string = vpmController.Version
		expect(result).to.equal('03070000')
	})

	it('set and get SplashInfoLine', () => {
		vpmController.SplashInfoLine = 'SPLASH!'
		const result: string = vpmController.SplashInfoLine
		expect(result).to.equal('SPLASH!')
	})

	it('dummy Debugging function (GET): ShowDMDOnly', () => {
		const result: boolean = vpmController.ShowDMDOnly
		expect(result).to.equal(false)
	})

	it('dummy Debugging function (GET): HandleKeyboard', () => {
		const result: boolean = vpmController.HandleKeyboard
		expect(result).to.equal(false)
	})

	it('dummy Debugging function (GET): ShowTitle', () => {
		const result: boolean = vpmController.ShowTitle
		expect(result).to.equal(false)
	})

	it('set dummy Debugging functions', () => {
		vpmController.ShowDMDOnly = true
		vpmController.HandleKeyboard = true
		vpmController.ShowTitle = true
		expect(vpmController.ShowTitle).to.equal(false)
	})

	it('dummy Customization function (GET): LockDisplay', () => {
		vpmController.LockDisplay = true
		const result: boolean = vpmController.LockDisplay
		expect(result).to.equal(false)
	})

	it('dummy Customization function: Hidden', () => {
		vpmController.Hidden = true
		const result: boolean = vpmController.Hidden
		expect(result).to.equal(false)
	})

	it('dummy Customization function: DoubleSize', () => {
		vpmController.DoubleSize = true
		const result: boolean = vpmController.DoubleSize
		expect(result).to.equal(false)
	})

	it('dummy Customization function: Antialias', () => {
		vpmController.Antialias = true
		const result: boolean = vpmController.Antialias
		expect(result).to.equal(false)
	})

	it('dummy Customization function: ShowFrame', () => {
		vpmController.ShowFrame = true
		const result: boolean = vpmController.ShowFrame
		expect(result).to.equal(false)
	})

	it('dummy Customization function: BorderSizeX', () => {
		vpmController.BorderSizeX = 5
		const result: number = vpmController.BorderSizeX
		expect(result).to.equal(0)
	})

	it('dummy Customization function: BorderSizeY', () => {
		vpmController.BorderSizeY = 5
		const result: number = vpmController.BorderSizeY
		expect(result).to.equal(0)
	})

	it('dummy Customization function: WindowPosX', () => {
		vpmController.WindowPosX = 5
		const result: number = vpmController.WindowPosX
		expect(result).to.equal(0)
	})

	it('dummy Customization function: WindowPosY', () => {
		vpmController.WindowPosY = 5
		const result: number = vpmController.WindowPosY
		expect(result).to.equal(0)
	})

	it('dummy GameSetting function: HandleMechanics', () => {
		vpmController.HandleMechanics = 1
		const result: number = vpmController.HandleMechanics
		expect(result).to.equal(0)
	})
})
