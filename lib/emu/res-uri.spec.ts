import { describe, expect, it } from 'vitest'
import type { IEmulator } from '../game/iemulator.js'
import { parseStateLink, tryGetFloatState } from './res-uri.js'

function stubEmulator(
	lamps: Record<number, number> = {},
	solenoids: Record<number, number> = {},
	gi: Record<number, number> = {},
): IEmulator {
	return {
		getLampState: (n: number) => lamps[n] ?? 0,
		getSolenoidState: (n: number) => solenoids[n] ?? 0,
		getGIState: (n: number) => gi[n] ?? 0,
	} as unknown as IEmulator
}

describe('The controller state link resolver', () => {
	it('should parse a lamp state link', () => {
		expect(parseStateLink('ctrl://pinmame/state?group=10&mapping=11')).toEqual({ group: 10, mapping: 11 })
	})

	it('should reject non-state links', () => {
		expect(parseStateLink('')).toBeUndefined()
		expect(parseStateLink('not a uri')).toBeUndefined()
		expect(parseStateLink('http://pinmame/state?group=10&mapping=11')).toBeUndefined()
		expect(parseStateLink('ctrl://pinmame/display?id=1')).toBeUndefined()
		expect(parseStateLink('ctrl://pinmame/state?group=10')).toBeUndefined()
		expect(parseStateLink('ctrl://pinmame/state?group=10&name=lamp11')).toBeUndefined()
		expect(parseStateLink('ctrl://pinmame/state?group=lamp&mapping=11')).toBeUndefined()
		expect(parseStateLink('ctrl:///state?group=10&mapping=11')).toBeUndefined()
	})

	it('should route lamp groups to the emulator lamps', () => {
		const emu = stubEmulator({ 11: 1 })
		expect(tryGetFloatState(emu, 'ctrl://pinmame/state?group=10&mapping=11')).toEqual({ ok: true, value: 1 })
		expect(tryGetFloatState(emu, 'ctrl://pinmame/state?group=3&mapping=11')).toEqual({ ok: true, value: 1 })
		expect(tryGetFloatState(emu, 'ctrl://pinmame/state?group=10&mapping=12')).toEqual({ ok: true, value: 0 })
	})

	it('should route solenoid groups to the emulator solenoids', () => {
		const emu = stubEmulator({}, { 5: 1 })
		expect(tryGetFloatState(emu, 'ctrl://pinmame/state?group=1&mapping=5')).toEqual({ ok: true, value: 1 })
		expect(tryGetFloatState(emu, 'ctrl://pinmame/state?group=8&mapping=5')).toEqual({ ok: true, value: 1 })
	})

	it('should route GI groups to the emulator GI strings', () => {
		const emu = stubEmulator({}, {}, { 2: 1 })
		expect(tryGetFloatState(emu, 'ctrl://pinmame/state?group=2&mapping=2')).toEqual({ ok: true, value: 1 })
		expect(tryGetFloatState(emu, 'ctrl://pinmame/state?group=9&mapping=2')).toEqual({ ok: true, value: 1 })
	})

	it('should not resolve unknown groups', () => {
		const emu = stubEmulator({ 11: 1 })
		expect(tryGetFloatState(emu, 'ctrl://pinmame/state?group=4&mapping=11').ok).toBe(false)
		expect(tryGetFloatState(emu, 'ctrl://pinmame/state?group=99&mapping=11').ok).toBe(false)
	})

	it('should not resolve without an emulator', () => {
		expect(tryGetFloatState(undefined, 'ctrl://pinmame/state?group=10&mapping=11').ok).toBe(false)
	})
})
