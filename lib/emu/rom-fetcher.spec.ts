// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { crc32 as nodeCrc32 } from 'node:zlib'
import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import VPDB_GAME_ENTRY_JSON from './rom-fetcher.fixture.json'
import { crc32, downloadGameEntry, fetchWithTimeout } from './rom-fetcher.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The ROM Fetcher', () => {
	const origFetch = globalThis.fetch
	const MOCK_ROM = 'MOCKROM'

	after(() => {
		globalThis.fetch = origFetch
	})

	it('should not find a rom entry', async () => {
		try {
			await downloadGameEntry('XXX')
			expect.fail('expected downloadGameEntry to reject')
		} catch (error) {
			if (error instanceof chai.AssertionError) throw error
			expect((error as Error).message).match(/GAME_ENTRY_NOT_FOUND_XXX/)
		}
	})

	it('should successful download ROM', async () => {
		const body = new TextEncoder().encode(MOCK_ROM)
		globalThis.fetch = (async (url: string | URL) => {
			const urlStr = url.toString()
			if (urlStr.includes('/v1/games/mm/roms/')) {
				// Serve a manifest matching the mocked body (size + crc).
				const json = JSON.parse(JSON.stringify(VPDB_GAME_ENTRY_JSON))
				json[0].rom_files[0].bytes = body.length
				json[0].rom_files[0].crc = crc32(body)
				return new Response(JSON.stringify(json), { status: 200 })
			}
			if (urlStr.includes('mm_1_09c.bin')) {
				return new Response(MOCK_ROM, { status: 200 })
			}
			return new Response('Not found', { status: 404 })
		}) as any

		const answer = await downloadGameEntry('mm_109c')
		expect(answer.romFile).to.deep.equal(new Uint8Array([77, 79, 67, 75, 82, 79, 77]))
		expect(answer.wpcDbEntry.name).to.equal('WPC-95: Medieval Madness')
	})

	it('crc32 matches zlib', () => {
		for (const text of ['', 'MOCKROM', 'The quick brown fox jumps over the lazy dog']) {
			const body = new TextEncoder().encode(text)
			expect(crc32(body)).to.equal(nodeCrc32(body) >>> 0)
		}
	})

	it('should reject a truncated ROM', async () => {
		globalThis.fetch = (async (url: string | URL) => {
			const urlStr = url.toString()
			if (urlStr.includes('/v1/games/mm/roms/')) {
				return new Response(JSON.stringify(VPDB_GAME_ENTRY_JSON), { status: 200 })
			}
			return new Response(MOCK_ROM, { status: 200 })
		}) as any

		try {
			await downloadGameEntry('mm_109c')
			expect.fail('expected downloadGameEntry to reject')
		} catch (error) {
			if (error instanceof chai.AssertionError) throw error
			expect((error as Error).message).match(/VPDB_ROM_SIZE_MISMATCH/)
		}
	})

	it('should reject a corrupt ROM of the right size', async () => {
		globalThis.fetch = (async (url: string | URL) => {
			const urlStr = url.toString()
			if (urlStr.includes('/v1/games/mm/roms/')) {
				const json = JSON.parse(JSON.stringify(VPDB_GAME_ENTRY_JSON))
				json[0].rom_files[0].bytes = MOCK_ROM.length
				json[0].rom_files[0].crc = 1
				return new Response(JSON.stringify(json), { status: 200 })
			}
			return new Response(MOCK_ROM, { status: 200 })
		}) as any

		try {
			await downloadGameEntry('mm_109c')
			expect.fail('expected downloadGameEntry to reject')
		} catch (error) {
			if (error instanceof chai.AssertionError) throw error
			expect((error as Error).message).match(/VPDB_ROM_CRC_MISMATCH/)
		}
	})

	it('should handle invalid rom list, option 1', async () => {
		globalThis.fetch = (async () => {
			return new Response(JSON.stringify({ foo: 'bar' }), { status: 200 })
		}) as any

		try {
			await downloadGameEntry('mm_109c')
			expect.fail('expected downloadGameEntry to reject')
		} catch (error) {
			if (error instanceof chai.AssertionError) throw error
			expect((error as Error).message).match(/VPDB_INVALID_ANSWER/)
		}
	})

	it('should handle invalid rom list, option 2', async () => {
		globalThis.fetch = (async () => {
			return new Response(JSON.stringify([{ foo: 'bar' }]), { status: 200 })
		}) as any

		try {
			await downloadGameEntry('mm_109c')
			expect.fail('expected downloadGameEntry to reject')
		} catch (error) {
			if (error instanceof chai.AssertionError) throw error
			expect((error as Error).message).match(/VPDB_GAME_ENTRY_NOT_FOUND/)
		}
	})

	it('should fail to download Gameset', async () => {
		globalThis.fetch = (async () => {
			return new Response('Not found', { status: 404 })
		}) as any

		try {
			await downloadGameEntry('mm_109c')
			expect.fail('expected downloadGameEntry to reject')
		} catch (error) {
			if (error instanceof chai.AssertionError) throw error
			expect((error as Error).message).match(/VPDB_FETCH_FAILED_WITH_ERROR_404/)
		}
	})

	it('should abort a stalled download within the timeout', async () => {
		globalThis.fetch = ((_url: string | URL, init?: RequestInit) => {
			return new Promise((_resolve, reject) => {
				// Hang until the timeout signal fires, like a stalled connection.
				init?.signal?.addEventListener('abort', () => {
					reject(new DOMException('The operation timed out', 'TimeoutError'))
				})
			})
		}) as any

		try {
			await fetchWithTimeout('https://example.com/rom.zip', 'ROM', 50)
			expect.fail('expected fetchWithTimeout to reject')
		} catch (error) {
			if (error instanceof chai.AssertionError) throw error
			expect((error as Error).name).to.match(/TimeoutError|AbortError/)
		}
	})

	it('should fail to download ROM', async () => {
		globalThis.fetch = (async (url: string | URL) => {
			const urlStr = url.toString()
			if (urlStr.includes('/v1/games/mm/roms/')) {
				return new Response(JSON.stringify(VPDB_GAME_ENTRY_JSON), { status: 200 })
			}
			return new Response('Not found', { status: 404 })
		}) as any

		try {
			await downloadGameEntry('mm_109c')
			expect.fail('expected downloadGameEntry to reject')
		} catch (error) {
			if (error instanceof chai.AssertionError) throw error
			expect((error as Error).message).match(/VPDB_FETCH_FAILED_WITH_ERROR_404/)
		}
	})
})
