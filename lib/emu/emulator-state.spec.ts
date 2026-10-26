// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import type { WpcEmuWebWorkerApi } from 'wpc-emu'
import { EmulatorState } from './emulator-state.js'

const soundState: WpcEmuWebWorkerApi.EmuStateSound = {
	volume: 0,
	readDataBytes: 0,
	writeDataBytes: 0,
	readControlBytes: 0,
	writeControlBytes: 0,
}

const dmdState: WpcEmuWebWorkerApi.EmuStateDMD = {
	scanline: 0,
	dmdShadedBuffer: new Uint8Array([1, 2, 3]),
	dmdPageMapping: [],
}

const wpcState1: WpcEmuWebWorkerApi.EmuStateWpc = {
	diagnosticLed: 0,
	lampState: new Uint8Array([1, 0, 0, 0, 0, 255, 127, 128]),
	solenoidState: new Uint8Array([2, 0, 0, 0, 0, 255, 127, 128]),
	generalIlluminationState: new Uint8Array([3, 0, 0, 0, 0, 255, 127, 128]),
	inputState: new Uint8Array([4, 0, 0, 0, 0, 255, 127, 128]),
	diagnosticLedToggleCount: 0,
	midnightModeEnabled: false,
	irqEnabled: false,
	activeRomBank: 0,
	time: 'fooTIME1',
	blankSignalHigh: false,
	watchdogExpiredCounter: 0,
	watchdogTicks: 0,
	zeroCrossFlag: 0,
	inputSwitchMatrixActiveColumn: new Uint8Array([5, 0, 0, 0, 0, 255, 127, 128]),
	lampRow: 0,
	lampColumn: 0,
	wpcSecureScrambler: 0,
}

const wpcState2: WpcEmuWebWorkerApi.EmuStateWpc = {
	diagnosticLed: 1,
	lampState: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]),
	solenoidState: new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0]),
	generalIlluminationState: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0]),
	inputState: new Uint8Array([4, 0, 0, 0, 0, 0, 0, 0]),
	diagnosticLedToggleCount: 1,
	midnightModeEnabled: true,
	irqEnabled: true,
	activeRomBank: 1,
	time: 'fooTIME2',
	blankSignalHigh: true,
	watchdogExpiredCounter: 1,
	watchdogTicks: 1,
	zeroCrossFlag: 1,
	inputSwitchMatrixActiveColumn: new Uint8Array([5, 0, 0, 0, 0, 0, 0, 0]),
	lampRow: 1,
	lampColumn: 1,
	wpcSecureScrambler: 1,
}

chai.use((sinonChai as any).default ?? sinonChai)
describe('The EmulatorState - handle state changes', () => {
	let emulatorState: EmulatorState

	const stateOne: WpcEmuWebWorkerApi.EmuStateAsic = {
		ram: new Uint8Array(),
		sound: soundState,
		wpc: wpcState1,
		dmd: dmdState,
	}
	const stateTwo: WpcEmuWebWorkerApi.EmuStateAsic = {
		ram: new Uint8Array(),
		sound: soundState,
		wpc: wpcState2,
		dmd: dmdState,
	}

	beforeEach(() => {
		emulatorState = new EmulatorState()
	})

	it('should return empty array for initially unchanged lamps', () => {
		expect(emulatorState.getChangedLamps()).to.be.an('array')
		expect(emulatorState.getChangedLamps()).to.be.empty
	})

	it('should return empty array for initially unchanged solenoids', () => {
		expect(emulatorState.getChangedSolenoids()).to.deep.equal([])
	})

	it('should return empty array for initially unchanged GI strings', () => {
		expect(emulatorState.getChangedGI()).to.deep.equal([])
	})

	it('should get changed lamps when transition from empty state to state 1', () => {
		const expectedDiff: number[][] = [
			[16, 1],
			[18, 1],
		]
		emulatorState.updateState(stateOne)
		const result = emulatorState.getChangedLamps()
		expect(result).to.deep.equal(expectedDiff)
	})

	it('should get changed lamps when transition from state 1 to state 2', () => {
		const expectedDiff: number[][] = [
			[16, 0],
			[18, 0],
		]
		emulatorState.updateState(stateOne)
		emulatorState.getChangedLamps()
		emulatorState.updateState(stateTwo)
		const result = emulatorState.getChangedLamps()
		expect(result).to.deep.equal(expectedDiff)
	})

	it('should return empty array when transition from empty state -> state 1 -> state 2, without fetching state', () => {
		emulatorState.updateState(stateOne)
		emulatorState.updateState(stateTwo)
		const result = emulatorState.getChangedLamps()
		expect(result).to.deep.equal([])
	})

	it('should return empty array after calling multiple getChangedLamps()', () => {
		emulatorState.updateState(stateOne)
		emulatorState.getChangedLamps()
		expect(emulatorState.getChangedLamps()).to.deep.equal([])
	})

	it('should threshold wpc-emu solenoids (0x00/0xFF) to VPM 0/1', () => {
		emulatorState.updateState(stateOne)
		expect(emulatorState.getChangedSolenoids()).to.deep.equal([
			[6, 1],
			[8, 1],
		])
	})

	it('should use the same >127 boundary for solenoids as for lamps', () => {
		const wpc = { ...wpcState2, solenoidState: new Uint8Array([128, 127]) }
		emulatorState.updateState({ ram: new Uint8Array(), sound: soundState, wpc, dmd: dmdState })
		expect(emulatorState.getChangedSolenoids()).to.deep.equal([[1, 1]])
	})

	it('should not report solenoid decay that stays within one threshold band', () => {
		const mk = (solenoidState: Uint8Array) => ({
			ram: new Uint8Array(),
			sound: soundState,
			wpc: { ...wpcState2, solenoidState },
			dmd: dmdState,
		})
		emulatorState.updateState(mk(new Uint8Array([255, 63])))
		emulatorState.getChangedSolenoids()
		emulatorState.updateState(mk(new Uint8Array([128, 31])))
		expect(emulatorState.getChangedSolenoids()).to.deep.equal([])
	})

	it('should scale wpc-emu GI (0-7) to VPM GI (0-8, 8 = full on)', () => {
		emulatorState.updateState(stateOne)
		expect(emulatorState.getChangedGI()).to.deep.equal([
			[1, 3],
			[6, 8],
			[7, 8],
			[8, 8],
		])
	})

	it('should read full-on wpc-emu GI as 8 via getGIState', () => {
		const wpc = { ...wpcState2, generalIlluminationState: new Uint8Array([0, 7, 0, 3]) }
		emulatorState.updateState({ ram: new Uint8Array(), sound: soundState, wpc, dmd: dmdState })
		expect(emulatorState.getGIState(0)).to.equal(8)
		expect(emulatorState.getGIState(2)).to.equal(3)
	})

	it('should pass pinmame sols (0/1) and GI (0-8) through unchanged', () => {
		emulatorState.applyPinmame(new Uint8Array([1, 0]), new Uint8Array([0, 1]), new Uint8Array([8, 5]))
		expect(emulatorState.getSolenoidState(1)).to.equal(1)
		expect(emulatorState.getGIState(0)).to.equal(8)
		expect(emulatorState.getChangedSolenoids()).to.deep.equal([[1, 1]])
		expect(emulatorState.getChangedGI()).to.deep.equal([
			[0, 8],
			[1, 5],
		])
	})

	it('should return empty array after fetching getChangedLEDs - not implemented used for Alphanumeric displays only', () => {
		const result: number[][] = emulatorState.getChangedLEDs()
		expect(result).to.deep.equal([])
	})

	it('should get empty getDmdScreen', () => {
		const result: Uint8Array = emulatorState.getDmdScreen()
		expect(result.length).to.equal(0)
	})
})
