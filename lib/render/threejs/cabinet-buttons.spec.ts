// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { resolveButtonCode } from './cabinet-buttons.js'

describe('resolveButtonCode', () => {
	it('maps button names to direct input codes', () => {
		expect(resolveButtonCode('coin_door_coin1')).toBe('Digit5')
		expect(resolveButtonCode('start_button')).toBe('Digit1')
		expect(resolveButtonCode('plunger_launch_btn')).toBe('Enter')
		expect(resolveButtonCode('fire_lockbar')).toBe('AltLeft')
		expect(resolveButtonCode('magna_left')).toBe('ControlLeft')
		expect(resolveButtonCode('magna_right')).toBe('ControlRight')
		expect(resolveButtonCode('unknown_primitive')).toBeNull()
	})

	it('keeps camel-case cabinet spellings resolving', () => {
		expect(resolveButtonCode('StartButton')).toBe('Digit1')
		expect(resolveButtonCode('CoinDoor')).toBe('Digit5')
		expect(resolveButtonCode('LaunchButton')).toBe('Enter')
		expect(resolveButtonCode('FireButton')).toBe('AltLeft')
		expect(resolveButtonCode('MagnaLeft')).toBe('ControlLeft')
	})

	it('rejects playfield words that merely contain a keyword', () => {
		expect(resolveButtonCode('starburst')).toBeNull()
		expect(resolveButtonCode('contour')).toBeNull()
		expect(resolveButtonCode('campfire')).toBeNull()
		expect(resolveButtonCode('button_holder')).toBeNull()
	})
})
