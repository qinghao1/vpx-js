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

	it('should return empty arrays for initially unchanged lamps, solenoids, and GI strings', () => {
		expect(emulatorState.getChangedLamps()).to.be.an('array')
		expect(emulatorState.getChangedLamps()).to.be.empty
		expect(emulatorState.getChangedSolenoids()).to.deep.equal([])
		expect(emulatorState.getChangedGI()).to.deep.equal([])
	})

	it('should ignore a numeric matrix column instead of throwing', () => {
		// The live backend reports the strobed column as a number, not row data.
		expect(() =>
			emulatorState.updateState({
				...stateOne,
				wpc: { ...wpcState1, inputSwitchMatrixActiveColumn: 3 as unknown as Uint8Array },
			}),
		).not.to.throw()
	})

	it('should read cabinet-byte bits for dedicated switches 1-8', () => {
		emulatorState.updateState({
			...stateOne,
			wpc: { ...wpcState1, inputState: new Uint8Array([0x10 | 0x01]) },
		})
		expect(emulatorState.getCabinetBit(0x10)).to.equal(1)
		expect(emulatorState.getCabinetBit(0x01)).to.equal(1)
		expect(emulatorState.getCabinetBit(0x40)).to.equal(0)
		emulatorState.updateState({
			...stateOne,
			wpc: { ...wpcState1, inputState: new Uint8Array([0x00]) },
		})
		expect(emulatorState.getCabinetBit(0x10)).to.equal(0)
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

	it('should scale wpc-emu GI (0-217, normalized by 31) to VPM GI (0-8, 8 = full on)', () => {
		emulatorState.updateState(stateOne)
		expect(emulatorState.getChangedGI()).to.deep.equal([
			[6, 8],
			[7, 4],
			[8, 4],
		])
	})

	it('should read full-on wpc-emu GI as 8 via getGIState', () => {
		const wpc = { ...wpcState2, generalIlluminationState: new Uint8Array([0, 217, 0, 93]) }
		emulatorState.updateState({ ram: new Uint8Array(), sound: soundState, wpc, dmd: dmdState })
		expect(emulatorState.getGIState(0)).to.equal(8)
		expect(emulatorState.getGIState(2)).to.equal(3)
	})

	it('should preserve GI fade steps from production normalized values', () => {
		const wpc = {
			...wpcState2,
			generalIlluminationState: new Uint8Array([217, 186, 155, 124, 93, 62, 31, 0]),
		}
		emulatorState.updateState({ ram: new Uint8Array(), sound: soundState, wpc, dmd: dmdState })
		expect(emulatorState.getChangedGI()).to.deep.equal([
			[1, 8],
			[2, 6],
			[3, 5],
			[4, 4],
			[5, 3],
			[6, 2],
			[7, 1],
		])
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

	it('should accumulate LED triples and drain on read', () => {
		emulatorState.pullLEDs([
			[7, 1, 2],
			[9, 4, 5],
		])
		expect(emulatorState.getChangedLEDs()).to.deep.equal([
			[7, 1, 2],
			[9, 4, 5],
		])
		expect(emulatorState.getChangedLEDs(), 'drains like a VPM read').to.deep.equal([])
	})

	it('should coalesce repeated LED triples like a VPM read', () => {
		emulatorState.pullLEDs([[7, 1, 2]])
		emulatorState.pullLEDs([[7, 4, 8]])
		expect(emulatorState.getChangedLEDs()).to.deep.equal([[7, 5, 8]])
	})

	it('should get empty getDmdScreen', () => {
		const result: Uint8Array = emulatorState.getDmdScreen()
		expect(result.length).to.equal(0)
	})

	it('should keep a published DMD snapshot stable across setDmd republishes', () => {
		emulatorState.setDmd(new Uint8Array([1, 2, 3, 4]))
		const snap = emulatorState.getDmdScreen()
		emulatorState.setDmd(new Uint8Array([5, 6, 7, 8]))
		expect(snap).to.deep.equal(new Uint8Array([1, 2, 3, 4]))
		expect(emulatorState.getDmdScreen()).to.deep.equal(new Uint8Array([5, 6, 7, 8]))
	})

	it('should not retain the caller frame passed to setDmd', () => {
		const frame = new Uint8Array([1, 2, 3, 4])
		emulatorState.setDmd(frame)
		frame.fill(9)
		expect(emulatorState.getDmdScreen()).to.deep.equal(new Uint8Array([1, 2, 3, 4]))
	})

	it('should keep a published DMD snapshot stable across updateState', () => {
		emulatorState.updateState(stateOne)
		const snap = emulatorState.getDmdScreen()
		emulatorState.updateState({
			ram: new Uint8Array(),
			sound: soundState,
			wpc: wpcState2,
			dmd: { scanline: 0, dmdShadedBuffer: new Uint8Array([7, 7, 7]), dmdPageMapping: [] },
		})
		expect(snap).to.deep.equal(new Uint8Array([1, 2, 3]))
		expect(emulatorState.getDmdScreen()).to.deep.equal(new Uint8Array([7, 7, 7]))
	})

	it('should copy pinmame lanes so later caller mutations do not leak in', () => {
		const lamps = new Uint8Array([1, 0])
		const sols = new Uint8Array([0, 1])
		const gis = new Uint8Array([8, 5])
		emulatorState.applyPinmame(lamps, sols, gis)
		lamps.fill(0)
		sols.fill(0)
		gis.fill(0)
		expect(emulatorState.getSolenoidState(1)).to.equal(1)
		expect(emulatorState.getGIState(0)).to.equal(8)
		expect(emulatorState.getChangedLamps()).to.deep.equal([[0, 1]])
	})
})
