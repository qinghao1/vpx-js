// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { EmulatorState } from '../emulator-state.js'
import { PinMameEmulator } from './pinmame-emu.js'
import { createPinmameModule, isPinmameMock, resetPinmameModuleCache } from './pinmame-loader.js'

const ROM_CANDIDATES = [
	path.join(os.homedir(), '.pinmame/roms/twd_160h.zip'),
	path.join(os.homedir(), 'Downloads/twd_160h.zip'),
	path.join(os.homedir(), 'Downloads/The Walking Dead LE Premium (Stern 2014) night 1.1.zip'),
]

function findRom(): string | null {
	for (const p of ROM_CANDIDATES) {
		try {
			if (fs.existsSync(p) && fs.statSync(p).size > 1024) return p
		} catch {}
	}
	return null
}

describe('PinMAME integration', () => {
	beforeEach(() => resetPinmameModuleCache())

	it('loads module with expected shape', async () => {
		const { module, isMock } = await createPinmameModule()
		expect(module).toBeDefined()
		expect(typeof module.cwrap).toBe('function')
		expect(typeof module._malloc).toBe('function')
		expect(module.FS).toBeDefined()
		expect(module.HEAPU8).toBeInstanceOf(Uint8Array)
		expect(typeof isMock).toBe('boolean')
	})

	it('isMock helper matches loader', async () => {
		expect(await isPinmameMock()).toBe((await createPinmameModule()).isMock)
	})

	it('mock lifecycle: init -> load -> initialized', async () => {
		const emu = new PinMameEmulator()
		expect(emu.isInitialized()).toBe(false)
		await emu.loadGame('twd_160h', new Uint8Array())
		expect(emu.isInitialized()).toBe(true)
		expect(emu.getVersion()).toMatch(/libpinmame/)
		expect(emu.getDmdDimensions().x).toBe(128)
		expect(emu.getDmdDimensions().y).toBe(32)
	})

	it('queues inputs before init and replays after load', async () => {
		const emu = new PinMameEmulator()
		expect(emu.setSwitchInput(11, true)).toBe(true)
		emu.setCabinetInput(16)
		emu.setDipSwitchByte(0x55)
		expect(emu.emuSimulateCycle(16)).toBe(0)
		await emu.loadGame('twd_160h', new Uint8Array())
		expect(emu.emuSimulateCycle(16)).toBe(16)
	})

	it('EmulatorState pinmame mode is direct indexed, wpc mode uses matrix', () => {
		const wpc = new EmulatorState()
		wpc.updateState({
			wpc: {
				lampState: new Uint8Array([0, 0, 0, 0, 0, 255, 0, 128]),
				solenoidState: new Uint8Array([0, 1, 0]),
				generalIlluminationState: new Uint8Array([1, 0]),
				inputSwitchMatrixActiveColumn: new Uint8Array([0]),
				diagnosticLed: 0,
				lampRow: 0,
				lampColumn: 0,
				diagnosticLedToggleCount: 0,
				midnightModeEnabled: false,
				irqEnabled: false,
				activeRomBank: 0,
				time: '',
				blankSignalHigh: false,
				watchdogExpiredCounter: 0,
				watchdogTicks: 0,
				zeroCrossFlag: 0,
				wpcSecureScrambler: 0,
			},
			dmd: { scanline: 0, dmdShadedBuffer: new Uint8Array(), dmdPageMapping: [] },
			sound: { volume: 0, readDataBytes: 0, writeDataBytes: 0, readControlBytes: 0, writeControlBytes: 0 },
			ram: new Uint8Array(),
		})
		const lamps = wpc.getChangedLamps() as unknown as number[][]
		expect(lamps.some(([n]) => n === 16)).toBe(true)

		const pin = new EmulatorState()
		pin.applyPinmame(new Uint8Array([0, 1, 0, 1]), new Uint8Array([1, 0, 1]), new Uint8Array([0, 1]))
		expect(pin.getSolenoidState(0)).toBe(1)
		expect(pin.getSolenoidState(1)).toBe(0)
		expect(pin.getSolenoidState(2)).toBe(1)
		expect(pin.getGIState(0)).toBe(0)
		expect(pin.getGIState(1)).toBe(1)
		expect(pin.getLampStateDirect(1)).toBe(1)
		expect((pin.getChangedLamps() as unknown as number[][]).length).toBeGreaterThan(0)
		const changedSols = pin.getChangedSolenoids()
		expect(changedSols.some(([n]) => n === 0)).toBe(true)
	})

	it('pinmame Changed* diff is identity, not matrix', () => {
		const s = new EmulatorState()
		const lamps = new Uint8Array(20)
		lamps[11] = 1
		lamps[18] = 1
		s.applyPinmame(lamps, new Uint8Array(8), new Uint8Array(4))
		const c = s.getChangedLamps() as unknown as number[][]
		expect(c.some(([n, v]) => n === 11 && v === 1)).toBe(true)
		expect(c.some(([n, v]) => n === 18 && v === 1)).toBe(true)
		expect(c.some(([n]) => n === 16)).toBe(false)
	})

	it('diff handles size mismatch without spurious changes', () => {
		const s = new EmulatorState()
		s.applyPinmame(new Uint8Array([0, 0, 0]), new Uint8Array([0]), new Uint8Array([0]))
		s.getChangedLamps()
		s.getChangedSolenoids()
		s.getChangedGI()
		s.applyPinmame(new Uint8Array([0, 0, 0]), new Uint8Array([0]), new Uint8Array([0]))
		expect((s.getChangedLamps() as unknown as number[][]).length).toBe(0)
		expect(s.getChangedSolenoids().length).toBe(0)
		expect(s.getChangedGI().length).toBe(0)
	})

	it('getLamp/Sol/GI return 0 when mock', async () => {
		const emu = new PinMameEmulator()
		await emu.loadGame('twd_160h', new Uint8Array())
		expect(emu.getLampState(0)).toBe(0)
		expect(emu.getSolenoidState(0)).toBe(0)
		expect(emu.getGIState(0)).toBe(0)
		expect(emu.getSwitchInput(11)).toBe(0)
	})

	it('with real ROM loads if available (skipped if mock or missing)', async () => {
		const romPath = findRom()
		if (!romPath) return
		const { isMock } = await createPinmameModule()
		if (isMock) return
		const rom = new Uint8Array(fs.readFileSync(romPath))
		expect(rom.length).toBeGreaterThan(1024)
		const emu = new PinMameEmulator()
		await emu.loadGame('twd_160h', rom)
		expect(emu.isInitialized()).toBe(true)
		for (let i = 0; i < 5; i++) emu.emuSimulateCycle(16)
		expect(() => emu.emulatorState.getChangedLamps()).not.toThrow()
	})

	it('generic arbitrary game name works', async () => {
		const emu = new PinMameEmulator()
		await emu.loadGame('my_generic_game_999', new Uint8Array([1, 2, 3]))
		expect(emu.isInitialized()).toBe(true)
	})

	it('handles string | object name overloads', async () => {
		const a = new PinMameEmulator()
		await a.loadGame({ name: 'twd_160h' } as any, new Uint8Array())
		expect(a.isInitialized()).toBe(true)
		const b = new PinMameEmulator()
		await b.loadGame({ pinmame: { name: 'twd_160h' } } as any, new Uint8Array())
		expect(b.isInitialized()).toBe(true)
	})

	it('throws on missing game name', async () => {
		const emu = new PinMameEmulator()
		await expect(emu.loadGame('', new Uint8Array())).rejects.toThrow(/PINMAME_GAME_NAME_MISSING/)
		await expect(emu.loadGame({} as any, new Uint8Array())).rejects.toThrow()
	})
})
