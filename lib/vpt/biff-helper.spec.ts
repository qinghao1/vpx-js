// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { BiffParser } from '../io/biff-parser.js'
import { handleBiffTag } from './biff-helper.js'

class TestTarget extends BiffParser {
	public speed = 0
	public count = 0
	public enabled = false
	public name = ''
	public wide = ''
}

function intBuffer(value: number): Uint8Array {
	const buffer = new Uint8Array(4)
	new DataView(buffer.buffer).setInt32(0, value, true)
	return buffer
}

function floatBuffer(value: number): Uint8Array {
	const buffer = new Uint8Array(4)
	new DataView(buffer.buffer).setFloat32(0, value, true)
	return buffer
}

/** String payloads carry a 4-byte prefix that getString/getWideString skip. */
function prefixedBuffer(payload: Uint8Array): { buffer: Uint8Array; len: number } {
	const buffer = new Uint8Array(4 + payload.length)
	buffer.set(payload, 4)
	return { buffer, len: buffer.length }
}

describe('handleBiffTag', () => {
	it('assigns float, int, bool, string, and wide-string maps', () => {
		const target = new TestTarget()
		const name = prefixedBuffer(new TextEncoder().encode('playfield'))
		const wide = prefixedBuffer(Buffer.from('Täblé', 'utf16le'))
		expect(handleBiffTag(target, 'SPEE', floatBuffer(2.5), 4, { float: { SPEE: 'speed' } })).toBe(true)
		expect(handleBiffTag(target, 'NUMB', intBuffer(7), 4, { int: { NUMB: 'count' } })).toBe(true)
		expect(handleBiffTag(target, 'ENAB', intBuffer(1), 4, { bool: { ENAB: 'enabled' } })).toBe(true)
		expect(handleBiffTag(target, 'NAME', name.buffer, name.len, { string: { NAME: 'name' } })).toBe(true)
		expect(handleBiffTag(target, 'WIDE', wide.buffer, wide.len, { wideString: { WIDE: 'wide' } })).toBe(true)
		expect(target.speed).toBeCloseTo(2.5, 5)
		expect(target.count).toBe(7)
		expect(target.enabled).toBe(true)
		expect(target.name).toBe('playfield')
		expect(target.wide).toBe('Täblé')
	})

	it('returns false and assigns nothing for unmapped tags', () => {
		const target = new TestTarget()
		expect(handleBiffTag(target, 'NOPE', intBuffer(7), 4, { int: { NUMB: 'count' } })).toBe(false)
		expect(target.count).toBe(0)
	})

	it('ignores tags that only exist on Object.prototype', () => {
		const target = new TestTarget()
		for (const tag of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
			expect(handleBiffTag(target, tag, intBuffer(7), 4, { int: { NUMB: 'count' } })).toBe(false)
		}
		expect(target.count).toBe(0)
		expect((target as unknown as Record<string, unknown>).toString).toBeTypeOf('function')
	})
})
