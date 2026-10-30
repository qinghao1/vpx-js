// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { ensureProcessShim } from './process-shim.js'

describe('ensureProcessShim', () => {
	it('fills the trimmed shape on an empty host', () => {
		const host: Record<string, unknown> = {}
		ensureProcessShim(host)
		const proc = host.process as Record<string, (...args: unknown[]) => unknown>
		expect(typeof proc.on).toBe('function')
		expect(proc.env).toEqual({})
		expect(proc.browser).toBe(true)
		expect(proc.platform).toBe('browser')
		expect(Object.keys(proc).sort()).toEqual(['browser', 'env', 'on', 'platform'])
		expect(host.global).toBe(host)
		expect((host.Buffer as { isBuffer: (v: unknown) => boolean }).isBuffer(0)).toBe(false)
	})

	it('keeps existing values and only fills missing keys', () => {
		const on = () => 'mine'
		const host: Record<string, unknown> = { process: { env: { NODE_ENV: 'test' }, on } }
		ensureProcessShim(host)
		const proc = host.process as Record<string, unknown>
		expect(proc.on).toBe(on)
		expect(proc.env).toEqual({ NODE_ENV: 'test' })
		expect(proc.browser).toBe(true)
		expect(proc.platform).toBe('browser')
	})
})
