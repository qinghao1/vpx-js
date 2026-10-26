// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { Binary } from './binary.js'

/** String payloads carry a 4-byte prefix that getString skips. */
function stringRecord(text: string): { buffer: Uint8Array; len: number } {
	const payload = new TextEncoder().encode(text)
	const buffer = new Uint8Array(4 + payload.length)
	buffer.set(payload, 4)
	return { buffer, len: buffer.length }
}

describe('Binary', () => {
	it('parses NAME, INME, PATH, and SIZE tags', async () => {
		const binary = new Binary()
		const name = stringRecord('test.png')
		expect(await binary.fromTag(name.buffer, 'NAME', 0, name.len)).toBe(0)
		const internal = stringRecord('internal')
		expect(await binary.fromTag(internal.buffer, 'INME', 0, internal.len)).toBe(0)
		const path = stringRecord('textures/test.png')
		expect(await binary.fromTag(path.buffer, 'PATH', 0, path.len)).toBe(0)
		const size = new Uint8Array(4)
		new DataView(size.buffer).setInt32(0, 1234, true)
		expect(await binary.fromTag(size, 'SIZE', 0, 4)).toBe(0)
		expect(binary.szName).toBe('test.png')
		expect(binary.szInternalName).toBe('internal')
		expect(binary.szPath).toBe('textures/test.png')
		expect(binary.cdata).toBe(1234)
	})

	it('records DATA position and length instead of copying bytes', async () => {
		const binary = new Binary()
		expect(await binary.fromTag(new Uint8Array(0), 'DATA', 512, 1024)).toBe(0)
		expect(binary.pos).toBe(512)
		expect(binary.len).toBe(1024)
	})

	it('ignores unknown tags without throwing', async () => {
		const binary = new Binary()
		await expect(binary.fromTag(new Uint8Array(0), 'NOPE', 0, 0)).resolves.toBe(0)
	})
})
