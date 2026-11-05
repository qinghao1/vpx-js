// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { clampModulateVsAdd, DEFAULT_MODULATE, MODULATE_MAX, MODULATE_MIN } from './flasher-blend.js'

describe('clampModulateVsAdd', () => {
	it('clamps into the open (0,1) window with the native default fallback', () => {
		expect(clampModulateVsAdd(undefined)).toBe(DEFAULT_MODULATE)
		expect(clampModulateVsAdd(0)).toBe(MODULATE_MIN)
		expect(clampModulateVsAdd(1)).toBe(MODULATE_MAX)
		expect(clampModulateVsAdd(0.5)).toBe(0.5)
		expect(clampModulateVsAdd(Number.NaN)).toBe(MODULATE_MAX)
		expect(clampModulateVsAdd(2, 0.3)).toBe(MODULATE_MAX)
	})
})
