// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { readFromMemory } from './binary-helpers.js'

describe('readFromMemory guards', () => {
	it('rejects a negative position instead of aliasing earlier bytes', async () => {
		// subarray(-8, -4) would silently return [1, 2, 3, 4]; fail like an IStream seek.
		let err: Error | null = null
		try {
			await readFromMemory(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'x', new Uint8Array(8), 0, 4, -8)
		} catch (e) {
			err = e as Error
		}
		expect(err?.message).to.match(/position/)
	})

	it('rejects a negative target offset or length', async () => {
		for (const [offset, length] of [
			[-1, 4],
			[0, -1],
		] as const) {
			let err: Error | null = null
			try {
				await readFromMemory(new Uint8Array([1, 2, 3, 4]), 'x', new Uint8Array(8), offset, length, 0)
			} catch (e) {
				err = e as Error
			}
			expect(err?.message, `offset=${offset} length=${length}`).to.match(/range/)
		}
	})

	it('short-reads past EOF without throwing', async () => {
		const target = new Uint8Array(10)
		const [n, data] = await readFromMemory(new Uint8Array([1, 2, 3]), 'x', target, 0, 10, 0)
		expect(n).to.equal(3)
		expect(Array.from(data)).to.deep.equal([1, 2, 3])
	})

	it('requires an open reader', async () => {
		let err: Error | null = null
		try {
			await readFromMemory(undefined, 'BinaryReader not open', new Uint8Array(1), 0, 1, 0)
		} catch (e) {
			err = e as Error
		}
		expect(err?.message).to.equal('BinaryReader not open')
	})
})
