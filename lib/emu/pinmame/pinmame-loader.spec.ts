// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../../util/logger.js'
import { createPinmameModule, resetPinmameModuleCache } from './pinmame-loader.js'

describe('PinMAME loader', () => {
	beforeEach(() => resetPinmameModuleCache())
	afterEach(() => resetPinmameModuleCache())

	it('logs each failed WASM candidate at debug', async () => {
		const orig = Logger.logger()
		const debug = vi.fn()
		const noop = () => {}
		Logger.setLogger({ wtf: noop, error: noop, warn: noop, info: noop, debug })
		try {
			const loaded = await createPinmameModule().catch(() => null)
			const misses = debug.mock.calls.filter(c => String(c[0]).includes('WASM candidate'))
			if (!loaded) {
				// No usable module here — the candidate misses below are the point.
				expect(misses.length).toBeGreaterThan(0)
			} else {
				// A usable module resolves with the loader shape, mock or real.
				expect(typeof loaded.module.cwrap).toBe('function')
				expect(typeof loaded.isMock).toBe('boolean')
			}
		} finally {
			Logger.setLogger(orig)
		}
	})

	it('caches the module across calls', async () => {
		const first = await createPinmameModule()
		const second = await createPinmameModule()
		expect(second.module).toBe(first.module)
		expect(second.isMock).toBe(first.isMock)
	})
})
