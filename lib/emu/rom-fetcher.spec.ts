// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { downloadGameEntry } from './rom-fetcher.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The ROM Fetcher', () => {
	const origFetch = globalThis.fetch
	const MOCK_ROM = 'MOCKROM'
	const VPDB_GAME_ENTRY_JSON = JSON.parse(
		`[{"id":"mm_109c","version":"v1.09C","notes":"Profanity ROM","languages":[],"rom_files":[{"filename":"mm_1_09c.bin","bytes":1048576,"crc":3655669919,"modified_at":"1996-12-25T04:32:00.000Z","type":"main","system":"wpc"},{"filename":"mm_s2.1_0","bytes":524288,"crc":3311156081,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav3.rom","bytes":1048576,"crc":3978028400,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav4.rom","bytes":1048576,"crc":2626284239,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav5.rom","bytes":1048576,"crc":1158192688,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav6.rom","bytes":1048576,"crc":1134384626,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"}],"file":{"id":"p2b9gpvd1","name":"mm_109c.zip","bytes":4933820,"mime_type":"application/zip","url":"https://storage.vpdb.io/files/p2b9gpvd1.zip","is_protected":true,"counter":{"downloads":551},"variations":{}},"created_by":{"id":"p2wrqyf1","name":"uploader","username":"uploader","gravatar_id":"eda3f36c4d9133b05b5f6336a75fcb34"}},{"id":"mm_109b","version":"v1.09B","languages":[],"rom_files":[{"filename":"mm_sav6.rom","bytes":1048576,"crc":1134384626,"modified_at":"2000-07-18T13:40:00.000Z","type":"sound"},{"filename":"mm_sav5.rom","bytes":1048576,"crc":1158192688,"modified_at":"2000-07-18T13:39:46.000Z","type":"sound"},{"filename":"mm_sav4.rom","bytes":1048576,"crc":2626284239,"modified_at":"2000-07-18T13:39:34.000Z","type":"sound"},{"filename":"mm_sav3.rom","bytes":1048576,"crc":3978028400,"modified_at":"2000-07-18T13:39:20.000Z","type":"sound"},{"filename":"mm_s2.1_0","bytes":524288,"crc":3311156081,"modified_at":"1997-07-18T02:52:40.000Z","type":"sound"},{"filename":"mm_109b.bin","bytes":1048576,"crc":1319811178,"modified_at":"1999-06-11T15:22:00.000Z","type":"main","system":"wpc"}],"file":{"id":"pkbkgevd1","name":"mm_109b.zip","bytes":4933798,"mime_type":"application/zip","url":"https://storage.vpdb.io/files/pkbkgevd1.zip","is_protected":true,"counter":{"downloads":381},"variations":{}},"created_by":{"id":"p2wrqyf1","name":"uploader","username":"uploader","gravatar_id":"eda3f36c4d9133b05b5f6336a75fcb34"}},{"id":"mm_109","version":"v1.09","languages":[],"rom_files":[{"filename":"mm_1_09.bin","bytes":1048576,"crc":2611760396,"modified_at":"1996-12-25T04:32:00.000Z","type":"main","system":"wpc"},{"filename":"mm_s2.1_0","bytes":524288,"crc":3311156081,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav3.rom","bytes":1048576,"crc":3978028400,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav4.rom","bytes":1048576,"crc":2626284239,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav5.rom","bytes":1048576,"crc":1158192688,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav6.rom","bytes":1048576,"crc":1134384626,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"}],"file":{"id":"e2b3net3o","name":"mm_109.zip","bytes":4933817,"mime_type":"application/zip","url":"https://storage.vpdb.io/files/e2b3net3o.zip","is_protected":true,"counter":{"downloads":339},"variations":{}},"created_by":{"id":"p2wrqyf1","name":"uploader","username":"uploader","gravatar_id":"eda3f36c4d9133b05b5f6336a75fcb34"}},{"id":"mm_10","version":"v1.0","languages":[],"rom_files":[{"filename":"mm_g11.1_0","bytes":524288,"crc":1809266118,"modified_at":"1996-12-25T04:32:00.000Z","type":"main","system":"wpc"},{"filename":"mm_s2.1_0","bytes":524288,"crc":3311156081,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav3.rom","bytes":1048576,"crc":3978028400,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav4.rom","bytes":1048576,"crc":2626284239,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav5.rom","bytes":1048576,"crc":1158192688,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav6.rom","bytes":1048576,"crc":1134384626,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"}],"file":{"id":"p2bnnptd1","name":"mm_10.zip","bytes":4929011,"mime_type":"application/zip","url":"https://storage.vpdb.io/files/p2bnnptd1.zip","is_protected":true,"counter":{"downloads":313},"variations":{}},"created_by":{"id":"p2wrqyf1","name":"uploader","username":"uploader","gravatar_id":"eda3f36c4d9133b05b5f6336a75fcb34"}},{"id":"mm_10u","version":"v1.0","notes":"Ultrapin","languages":[],"rom_files":[{"filename":"mmu_g11.1_0","bytes":524288,"crc":643719570,"modified_at":"2006-11-29T16:09:58.000Z","type":"main","system":"wpc"},{"filename":"mm_s2.1_0","bytes":524288,"crc":3311156081,"modified_at":"2001-08-05T11:56:50.000Z","type":"sound"},{"filename":"mm_sav3.rom","bytes":1048576,"crc":3978028400,"modified_at":"2000-07-18T13:39:20.000Z","type":"sound"},{"filename":"mm_sav4.rom","bytes":1048576,"crc":2626284239,"modified_at":"2000-07-18T13:39:34.000Z","type":"sound"},{"filename":"mm_sav5.rom","bytes":1048576,"crc":1158192688,"modified_at":"2000-07-18T13:39:46.000Z","type":"sound"},{"filename":"mm_sav6.rom","bytes":1048576,"crc":1134384626,"modified_at":"2000-07-18T13:40:00.000Z","type":"sound"}],"file":{"id":"e2hp6et3o","name":"mm_10u.zip","bytes":4922916,"mime_type":"application/zip","url":"https://storage.vpdb.io/files/e2hp6et3o.zip","is_protected":true,"counter":{"downloads":296},"variations":{}},"created_by":{"id":"p2wrqyf1","name":"uploader","username":"uploader","gravatar_id":"eda3f36c4d9133b05b5f6336a75fcb34"}},{"id":"mm_05","version":"v0.50","languages":[],"rom_files":[{"filename":"g11-050.rom","bytes":524288,"crc":3524373782,"modified_at":"1996-12-25T04:32:00.000Z","type":"main","system":"wpc"},{"filename":"mm_sav3.rom","bytes":1048576,"crc":3978028400,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav4.rom","bytes":1048576,"crc":2626284239,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav5.rom","bytes":1048576,"crc":1158192688,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"mm_sav6.rom","bytes":1048576,"crc":1134384626,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"},{"filename":"s2-020.rom","bytes":524288,"crc":3993017572,"modified_at":"1996-12-25T04:32:00.000Z","type":"sound"}],"file":{"id":"p2buapv31","name":"mm_05.zip","bytes":4855347,"mime_type":"application/zip","url":"https://storage.vpdb.io/files/p2buapv31.zip","is_protected":true,"counter":{"downloads":293},"variations":{}},"created_by":{"id":"p2wrqyf1","name":"uploader","username":"uploader","gravatar_id":"eda3f36c4d9133b05b5f6336a75fcb34"}}]`,
	)

	after(() => {
		globalThis.fetch = origFetch
	})

	it('should not find a rom entry', async () => {
		await downloadGameEntry('XXX').catch(error => {
			expect(error.message).match(/GAME_ENTRY_NOT_FOUND_XXX/)
		})
	})

	it('should successful download ROM', async () => {
		globalThis.fetch = (async (url: string | URL) => {
			const urlStr = url.toString()
			if (urlStr.includes('/v1/games/mm/roms/')) {
				return new Response(JSON.stringify(VPDB_GAME_ENTRY_JSON), { status: 200 })
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

	it('should handle invalid rom list, option 1', async () => {
		globalThis.fetch = (async () => {
			return new Response(JSON.stringify({ foo: 'bar' }), { status: 200 })
		}) as any

		await downloadGameEntry('mm_109c').catch(error => {
			expect(error.message).match(/VPDB_INVALID_ANSWER/)
		})
	})

	it('should handle invalid rom list, option 2', async () => {
		globalThis.fetch = (async () => {
			return new Response(JSON.stringify([{ foo: 'bar' }]), { status: 200 })
		}) as any

		await downloadGameEntry('mm_109c').catch(error => {
			expect(error.message).match(/VPDB_GAME_ENTRY_NOT_FOUND/)
		})
	})

	it('should fail to download Gameset', async () => {
		globalThis.fetch = (async () => {
			return new Response('Not found', { status: 404 })
		}) as any

		await downloadGameEntry('mm_109c').catch(error => {
			expect(error.message).match(/VPDB_FETCH_FAILED_WITH_ERROR_404/)
		})
	})

	it('should fail to download ROM', async () => {
		globalThis.fetch = (async (url: string | URL) => {
			const urlStr = url.toString()
			if (urlStr.includes('/v1/games/mm/roms/')) {
				return new Response(JSON.stringify(VPDB_GAME_ENTRY_JSON), { status: 200 })
			}
			return new Response('Not found', { status: 404 })
		}) as any

		await downloadGameEntry('mm_109c').catch(error => {
			expect(error.message).match(/VPDB_FETCH_FAILED_WITH_ERROR_404/)
		})
	})
})
