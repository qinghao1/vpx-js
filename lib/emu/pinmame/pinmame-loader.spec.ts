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
			try {
				await createPinmameModule()
			} catch {
				// No usable module here — the candidate misses below are the point.
			}
			const misses = debug.mock.calls.filter(c => String(c[0]).includes('WASM candidate'))
			expect(misses.length).toBeGreaterThan(0)
		} finally {
			Logger.setLogger(orig)
		}
	})
})
